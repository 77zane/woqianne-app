/**
 * 数据服务层 — V2 本地存储
 *
 * V2 变更：
 * - 交易记录新增 serverId / createdAt / updatedAt / deletedAt 字段
 * - deleteTransaction 改为软删除
 * - 新增 getAllTransactions / saveRawTransactions 供同步模块使用
 * - getTransactions 默认过滤软删除记录（UI 展示用）
 */

const KEYS = {
  TRANSACTIONS: 'lucky_transactions',
  TAGS: 'lucky_tags',
  TAG_USAGE: 'lucky_tag_usage',
  NEXT_ID: 'lucky_next_id',
}

// ==================== 交易记录 ====================

/**
 * 获取所有交易记录（含软删除）
 * 供同步模块使用，确保 pending 记录不会丢失。
 * @returns {Array}
 */
export function getAllTransactions() {
  try {
    const raw = uni.getStorageSync(KEYS.TRANSACTIONS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * 获取有效交易记录（排除已软删除的）
 * UI 展示用，和 V1 行为兼容。
 * @returns {Array}
 */
export function getTransactions() {
  return getAllTransactions().filter(t => !t.deletedAt)
}

/**
 * 批量保存原始交易列表（含软删除记录）
 * 供同步模块回写 serverId / updatedAt 后使用。
 * @param {Array} list
 */
export function saveRawTransactions(list) {
  uni.setStorageSync(KEYS.TRANSACTIONS, JSON.stringify(list))
}

/** 保存一条新记录 */
export function addTransaction(txn) {
  const list = getAllTransactions()
  const now = Date.now()
  list.push({
    amount: txn.amount,
    note: txn.note || '',
    date: txn.date,
    id: txn.id, // 由调用方通过 getNextId() 预先分配
    serverId: txn.serverId || null,
    createdAt: txn.createdAt || now,
    updatedAt: txn.updatedAt || now,
    deletedAt: null,
  })
  uni.setStorageSync(KEYS.TRANSACTIONS, JSON.stringify(list))
}

/** 更新一条记录（原地修改，自动刷新 updatedAt） */
export function updateTransaction(id, updates) {
  const list = getAllTransactions()
  const idx = list.findIndex(t => t.id === id)
  if (idx === -1) return false
  Object.assign(list[idx], updates, { updatedAt: Date.now() })
  uni.setStorageSync(KEYS.TRANSACTIONS, JSON.stringify(list))
  return true
}

/**
 * 软删除一条记录
 * 标记 deletedAt 和 updatedAt，不物理删除。
 */
export function deleteTransaction(id) {
  const list = getAllTransactions()
  const idx = list.findIndex(t => t.id === id)
  if (idx === -1) return false
  const now = Date.now()
  list[idx].deletedAt = now
  list[idx].updatedAt = now
  uni.setStorageSync(KEYS.TRANSACTIONS, JSON.stringify(list))
  return true
}

// ==================== 标签 ====================

/** 获取所有标签 */
export function getTags() {
  try {
    const raw = uni.getStorageSync(KEYS.TAGS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** 保存标签列表 */
export function saveTags(tags) {
  uni.setStorageSync(KEYS.TAGS, JSON.stringify(tags))
}

/** 添加新标签（不重复） */
export function addTag(text) {
  if (!text) return
  const tags = getTags()
  if (!tags.includes(text)) {
    tags.push(text)
    saveTags(tags)
  }
}

/** 删除标签 */
export function removeTag(text) {
  const tags = getTags().filter(t => t !== text)
  saveTags(tags)
  return tags
}

// ==================== 标签使用次数 ====================

/** 获取标签使用次数 */
export function getTagUsageCount() {
  try {
    const raw = uni.getStorageSync(KEYS.TAG_USAGE)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** 记录一次标签使用 */
export function incrementTagUsage(text) {
  if (!text) return
  const counts = getTagUsageCount()
  if (!counts[text]) counts[text] = 0
  counts[text]++
  uni.setStorageSync(KEYS.TAG_USAGE, JSON.stringify(counts))
}

/** 从交易记录重新计算标签使用次数 */
export function rebuildTagUsage(transactions) {
  const counts = {}
  transactions.forEach(t => {
    if (t.note) {
      if (!counts[t.note]) counts[t.note] = 0
      counts[t.note]++
    }
  })
  uni.setStorageSync(KEYS.TAG_USAGE, JSON.stringify(counts))
  return counts
}

// ==================== ID 生成 ====================

export function getNextId() {
  let id = 1
  try {
    const raw = uni.getStorageSync(KEYS.NEXT_ID)
    if (raw) id = parseInt(raw, 10)
    uni.setStorageSync(KEYS.NEXT_ID, id + 1)
  } catch {
    uni.setStorageSync(KEYS.NEXT_ID, 2)
  }
  return id
}
