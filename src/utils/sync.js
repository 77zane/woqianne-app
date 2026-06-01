/**
 * 同步逻辑
 *
 * 核心同步方法：
 * - syncUpload:   将本地待同步记录推送到服务端
 * - syncDownload: 从服务端拉取增量数据合并到本地
 * - mergeOnFirstLogin: 首次登录时自动合并两端数据（三元组去重）
 */

import * as storage from './storage'
import * as api from './api'
import * as auth from './auth'

/**
 * 获取本地所有待同步的记录
 * pending = serverId 为 null 或 updatedAt > lastSyncTime
 * @returns {Array}
 */
function getPendingTransactions() {
  const all = storage.getAllTransactions() // 含软删除的原始数据
  const lastSyncTime = auth.getLastSyncTime()
  const pending = []

  for (const t of all) {
    // 新建的或修改后未同步的
    if (t.serverId === null || t.updatedAt > lastSyncTime) {
      pending.push(t)
    }
  }

  return pending
}

/**
 * 上传：将本地 pending 记录推送到服务端
 *
 * 操作后自动调用，异步不阻塞。
 * 成功后回写 serverId 和 updatedAt。
 *
 * @returns {Promise<{success: boolean, uploaded?: number, error?: string}>}
 */
export async function syncUpload() {
  const token = auth.getToken()
  if (!token) {
    return { success: false, error: '未登录' }
  }

  const pending = getPendingTransactions()
  if (pending.length === 0) {
    return { success: true, uploaded: 0 }
  }

  try {
    const result = await api.uploadTransactions(pending, token)

    // 回写 serverId 和 updatedAt
    const list = storage.getAllTransactions()
    for (let i = 0; i < pending.length; i++) {
      const txn = pending[i]
      const res = result.results[i]
      const idx = list.findIndex(t => t.id === txn.id)
      if (idx !== -1) {
        list[idx].serverId = res.serverId
        list[idx].updatedAt = res.updatedAt
      }
    }
    storage.saveRawTransactions(list)

    // 更新最后同步时间
    auth.setLastSyncTime(result.serverTime)

    return { success: true, uploaded: pending.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * 下载：从服务端拉取增量数据，合并到本地
 *
 * 下拉触发，或启动时自动调用。
 * 按 serverId 匹配：新增 / 更新 / 删除。
 *
 * @returns {Promise<{success: boolean, downloaded?: number, error?: string}>}
 */
export async function syncDownload() {
  const token = auth.getToken()
  if (!token) {
    return { success: false, error: '未登录' }
  }

  const since = auth.getLastSyncTime()

  try {
    const result = await api.downloadTransactions(since, token)

    if (result.transactions.length === 0) {
      auth.setLastSyncTime(result.serverTime)
      return { success: true, downloaded: 0 }
    }

    const list = storage.getAllTransactions()

    for (const remote of result.transactions) {
      const idx = list.findIndex(t => t.serverId === remote.serverId)

      if (idx === -1) {
        // 本地不存在
        if (remote.deletedAt === null || remote.deletedAt === undefined) {
          // 新增记录 → 插入本地
          list.push({
            id: storage.getNextId(),
            serverId: remote.serverId,
            amount: remote.amount,
            note: remote.note,
            date: remote.date,
            createdAt: remote.createdAt,
            updatedAt: remote.updatedAt,
            deletedAt: null,
          })
        }
        // 已删除的记录且本地本就不存在，跳过
      } else {
        // 本地存在
        if (remote.deletedAt !== null && remote.deletedAt !== undefined) {
          // 服务端已删除 → 本地也软删除
          list[idx].deletedAt = remote.deletedAt
          list[idx].updatedAt = remote.updatedAt
        } else if (remote.updatedAt > list[idx].updatedAt) {
          // 服务端有新版本 → 覆盖本地（Last-write-wins）
          list[idx].amount = remote.amount
          list[idx].note = remote.note
          list[idx].date = remote.date
          list[idx].updatedAt = remote.updatedAt
        }
        // else: 本地版本更新，保留本地
      }
    }

    storage.saveRawTransactions(list)
    auth.setLastSyncTime(result.serverTime)

    // 重建标签使用次数（从交易记录中计算）
    const activeList = list.filter(t => !t.deletedAt)
    storage.rebuildTagUsage(activeList)

    return { success: true, downloaded: result.transactions.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * 首次登录合并
 *
 * 拉取服务端全量数据，上传本地全部数据，然后按 note + amount + date 三元组去重合并。
 * 两端重复的记录保留本地版本（本地已有 id），仅插入服务端独有的记录。
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function mergeOnFirstLogin() {
  const token = auth.getToken()
  if (!token) {
    return { success: false, error: '未登录' }
  }

  try {
    // 1. 拉取服务端全量数据
    const remoteResult = await api.downloadTransactions(0, token)

    // 2. 上传本地全部数据
    const localAll = storage.getAllTransactions().filter(t => !t.deletedAt)
    // 将所有本地记录标记为 pending（未同步到当前账号）
    const toUpload = localAll.map(t => ({
      ...t,
      serverId: null, // 以新用户的身份上传
    }))
    if (toUpload.length > 0) {
      try {
        await api.uploadTransactions(toUpload, token)
      } catch {
        // 上传失败不阻塞合并，下次同步再上传
      }
    }

    // 3. 合并：按 note + amount + date 三元组去重
    const list = storage.getAllTransactions()
    const existingKeys = new Set()
    for (const t of list) {
      existingKeys.add(`${t.note}|${t.amount}|${t.date}`)
    }

    for (const remote of remoteResult.transactions) {
      if (remote.deletedAt !== null && remote.deletedAt !== undefined) {
        continue // 跳过已删除的
      }

      const key = `${remote.note}|${remote.amount}|${remote.date}`
      if (!existingKeys.has(key)) {
        // 本地不存在 → 插入
        list.push({
          id: storage.getNextId(),
          serverId: remote.serverId,
          amount: remote.amount,
          note: remote.note,
          date: remote.date,
          createdAt: remote.createdAt,
          updatedAt: remote.updatedAt,
          deletedAt: null,
        })
        existingKeys.add(key)
      }
      // 已存在的：保留本地版本
    }

    storage.saveRawTransactions(list)
    auth.setLastSyncTime(remoteResult.serverTime)
    storage.rebuildTagUsage(list.filter(t => !t.deletedAt))

    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * 执行一次完整的双向同步
 * 先拉取远端增量，再上传本地 pending。
 * 下拉刷新时调用。
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function doFullSync() {
  // 先下载，再上传（顺序不影响正确性，但先下载可以避免不必要的上传冲突）
  const downloadResult = await syncDownload()
  if (!downloadResult.success) {
    return downloadResult
  }

  const uploadResult = await syncUpload()
  if (!uploadResult.success) {
    return uploadResult
  }

  return { success: true }
}
