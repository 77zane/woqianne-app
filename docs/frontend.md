# 前端开发文档 — 第二阶段（登录 & 同步）

## 一、设计原则

- **极致极简**：未登录状态下界面和 V1 完全一致，用户感知不到后台和同步功能的存在
- **无密码**：邮箱验证码登录，登录即注册
- **本地优先**：所有数据操作先写本地，同步异步执行，网络不可用时不影响记账
- **静默同步**：登录后每次保存自动同步，下拉手动触发同步

---

## 二、页面交互设计

### 2.1 下拉手势（核心入口）

下拉是登录和同步的**唯一入口**。利用 uni-app 的 `onPullDownRefresh` 或 `scroll-view` 的 `refresherrefresh` 事件实现。

```
用户下拉
    │
    ├─ 有 token → 执行同步（download → upload）
    │              ├─ 成功 → 顶部 toast "✓ 已同步"，1.5秒消失
    │              └─ 失败 → 顶部 toast "⚠ 同步失败"，2秒消失
    │
    └─ 无 token → 弹出登录弹窗
```

**注意**：不需要下拉阈值判定；未登录时直接弹登录弹窗，已登录时直接执行同步。

### 2.2 登录弹窗

未登录状态下拉时弹出。

```
┌─────────────────────────────────────┐
│                                     │
│        登录即注册                    │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  📧 输入邮箱                 │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🔢 验证码    [发送验证码]    │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │          [登录]              │   │
│  └─────────────────────────────┘   │
│                                     │
│  ⚠ 请牢记邮箱，验证码无法找回       │
│                                     │
└─────────────────────────────────────┘
```

**交互细节：**

| 元素 | 行为 |
|------|------|
| 邮箱输入框 | type=email，自动弹出邮箱键盘 |
| 发送验证码按钮 | 点击后：校验邮箱非空 → 调用 `sendCode` → 按钮变为 60s 倒计时 `"重新发送(59s)"` → 倒计时结束恢复为 `"发送验证码"` |
| 验证码输入框 | type=number，maxlength=6，输入完 6 位后自动聚焦登录按钮，支持回车确认 |
| 登录按钮 | 校验邮箱 + 验证码非空 → 调用 `login` → 成功后关闭弹窗 → 自动执行首次同步 |
| 弹窗外部区域 | 点击关闭弹窗（不做任何操作），保留未登录状态 |

**状态管理：**

| 状态字段 | 类型 | 说明 |
|----------|------|------|
| `loginEmail` | string | 邮箱输入 |
| `loginCode` | string | 验证码输入 |
| `sendingCode` | boolean | 是否正在发送验证码 |
| `codeCountdown` | number | 发送倒计时秒数，0 表示可重新发送 |
| `loggingIn` | boolean | 是否正在登录 |

### 2.3 同步 Toast

登录后下拉同步完成时的反馈。不常驻，自动消失。

**实现：** 在页面顶部使用一个固定定位的 toast view，通过 `v-if` + 定时器控制显隐。

```
┌─────────────────────────────────────┐
│           ✓ 已同步                   │   ← 绿色，1.5秒后消失
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│           ⚠ 同步失败                 │   ← 红色，2秒后消失
└─────────────────────────────────────┘
```

**注意**：同步失败时 toast 可点击，点击后重试同步。

### 2.4 月份选择器（含账户信息）

**已登录时**，月份选择器底部显示账户信息：

```
┌─────────────────────────────────────┐
│  选择月份                            │
│                                     │
│  2026年5月                           │
│  2026年4月                           │
│  2026年3月                           │
│  ─────────────                      │
│  📧 xxx@qq.com          [退出]       │
└─────────────────────────────────────┘
```

**未登录时**，底部无任何账户信息，与 V1 完全一致：

```
┌─────────────────────────────────────┐
│  选择月份                            │
│                                     │
│  2026年5月                           │
│  2026年4月                           │
│  2026年3月                           │
│                                     │
└─────────────────────────────────────┘
```

**退出登录确认弹窗：**

点击「退出」→ 弹出：

```
┌─────────────────────────────────────┐
│  退出登录                            │
│  退出后云端数据仍保留，              │
│  本地数据不受影响。                  │
│                                     │
│  [取消]          [退出登录]          │
└─────────────────────────────────────┘
```

**退出登录后的操作：**
1. 删除本地 `lucky_token`
2. 删除本地 `lucky_last_sync_time`
3. 删除本地 `lucky_user_email`
4. 关闭月份选择器
5. 界面恢复为完全无登录痕迹状态

---

## 三、数据结构变更

### 3.1 交易记录结构变更

**V1 结构：**

```json
{
  "id": 1,
  "amount": -18,
  "note": "午餐",
  "date": "2026-05-31"
}
```

**V2 结构（新增 4 个字段）：**

```json
{
  "id": 1,
  "serverId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "amount": -18,
  "note": "午餐",
  "date": "2026-05-31",
  "createdAt": 1748697600000,
  "updatedAt": 1748697600000,
  "deletedAt": null
}
```

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `id` | number | 本地自增 ID，保持不变 | 自动生成 |
| `serverId` | string \| null | 服务端唯一 ID，未同步时为 `null` | `null` |
| `amount` | number | 金额（负数支出，正数收入） | 必填 |
| `note` | string | 备注，最多 50 字 | `''` |
| `date` | string | 日期，格式 `YYYY-MM-DD` | `today` |
| `createdAt` | number | 创建时间戳（毫秒） | `Date.now()` |
| `updatedAt` | number | 最后修改时间戳（毫秒） | `Date.now()` |
| `deletedAt` | number \| null | 软删除标记 | `null` |

### 3.2 Storage Keys 变更

```js
// V1 keys
const KEYS = {
  TRANSACTIONS: 'lucky_transactions',
  TAGS: 'lucky_tags',
  TAG_USAGE: 'lucky_tag_usage',
  NEXT_ID: 'lucky_next_id',
}

// V2 新增 keys
  TOKEN: 'lucky_token',               // JWT token 字符串
  LAST_SYNC_TIME: 'lucky_last_sync_time',  // 上次同步时间戳 (number)
  USER_EMAIL: 'lucky_user_email',     // 登录邮箱 (string)
```

---

## 四、文件变更清单

### 4.1 需修改的文件

| 文件 | 变更内容 |
|------|---------|
| `src/utils/storage.js` | 新增 token/lastSyncTime/userEmail 存取方法；修改交易记录数据结构（新增字段默认值） |
| `src/pages/index/index.vue` | 新增下拉刷新（登录弹窗/同步逻辑）；月份选择器底部加账户信息；登录弹窗模板；同步 toast 模板；新增 methods |
| `src/App.vue` | 可能需要新增全局 toast 样式 |

### 4.2 需新增的文件

| 文件 | 职责 |
|------|------|
| `src/utils/api.js` | 封装所有后端 HTTP 请求（sendCode, login, upload, download） |
| `src/utils/sync.js` | 同步逻辑（上传 pending 记录、下载增量数据、首次合并） |
| `src/utils/auth.js` | 认证状态管理（login, logout, isLoggedIn, getToken） |

---

## 五、新增文件详细设计

### 5.1 `src/utils/auth.js`

```js
/**
 * 认证状态管理
 * 职责：token 的读写，登录态判断
 */

import { getStorageSync, setStorageSync, removeStorageSync } from './helpers'

const KEYS = {
  TOKEN: 'lucky_token',
  USER_EMAIL: 'lucky_user_email',
  LAST_SYNC_TIME: 'lucky_last_sync_time',
}

/** 获取存储的 token */
export function getToken() {
  return uni.getStorageSync(KEYS.TOKEN) || null
}

/** 保存 token */
export function saveToken(token) {
  uni.setStorageSync(KEYS.TOKEN, token)
}

/** 是否已登录 */
export function isLoggedIn() {
  return !!getToken()
}

/** 保存用户邮箱 */
export function saveUserEmail(email) {
  uni.setStorageSync(KEYS.USER_EMAIL, email)
}

/** 获取用户邮箱 */
export function getUserEmail() {
  return uni.getStorageSync(KEYS.USER_EMAIL) || ''
}

/** 获取上次同步时间 */
export function getLastSyncTime() {
  return uni.getStorageSync(KEYS.LAST_SYNC_TIME) || 0
}

/** 更新上次同步时间 */
export function setLastSyncTime(ts) {
  uni.setStorageSync(KEYS.LAST_SYNC_TIME, ts)
}

/** 退出登录 */
export function logout() {
  uni.removeStorageSync(KEYS.TOKEN)
  uni.removeStorageSync(KEYS.USER_EMAIL)
  uni.removeStorageSync(KEYS.LAST_SYNC_TIME)
}
```

**注意**：要使用 `uni.getStorageSync` / `uni.setStorageSync` / `uni.removeStorageSync` 而不是从 storage.js 引入，因为 storage.js 主要管理业务数据。这里的 3 个 key 独立管理。

### 5.2 `src/utils/api.js`

```js
/**
 * API 请求封装
 * 职责：封装所有后端 HTTP 请求
 */

const BASE_URL = 'https://api.yourdomain.com'  // TODO: 部署时回填

/**
 * 通用请求方法
 * @param {string} path - API 路径，如 '/api/auth/login'
 * @param {object} options - { method, token, body }
 * @returns {Promise<object>}
 */
async function request(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await uni.request({
    url: BASE_URL + path,
    method,
    headers,
    data: body,
    timeout: 10000, // 10 秒超时
  })

  const [err, result] = res
  if (err) {
    throw new Error('网络错误，请检查网络连接')
  }
  if (result.statusCode >= 400) {
    const msg = result.data?.error || '请求失败'
    const error = new Error(msg)
    error.statusCode = result.statusCode
    throw error
  }
  return result.data.data
}

// ---------- 认证接口 ----------

/** 发送验证码 */
export function sendCode(email) {
  return request('/api/auth/send-code', {
    method: 'POST',
    body: { email },
  })
}

/** 登录（登录即注册） */
export function login(email, code) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { email, code },
  })
}

// ---------- 同步接口 ----------

/** 上传变更 */
export function uploadTransactions(transactions, token) {
  return request('/api/sync/upload', {
    method: 'POST',
    token,
    body: { transactions },
  })
}

/** 下载变更 */
export function downloadTransactions(since, token) {
  return request(`/api/sync/download?since=${since}`, {
    method: 'GET',
    token,
  })
}
```

### 5.3 `src/utils/sync.js`

```js
/**
 * 同步逻辑
 * 职责：上传 pending 记录、下载增量数据、首次登录合并
 */

import * as storage from './storage'
import * as api from './api'
import * as auth from './auth'

/**
 * 获取本地所有待同步的记录
 * pending = serverId 为 null 或 updatedAt > lastSyncTime
 */
function getPendingTransactions() {
  const all = storage.getTransactions()
  const lastSyncTime = auth.getLastSyncTime()
  return all.filter(t => {
    if (t.serverId === null) return true
    if (t.updatedAt > lastSyncTime) return true
    return false
  })
}

/**
 * 上传：将本地 pending 记录推送到服务端
 */
export async function syncUpload() {
  const token = auth.getToken()
  if (!token) return { success: false, error: '未登录' }

  const pending = getPendingTransactions()
  if (pending.length === 0) return { success: true, uploaded: 0 }

  const result = await api.uploadTransactions(pending, token)

  // 回写 serverId 和 updatedAt
  const list = storage.getTransactions()
  result.results.forEach((r, i) => {
    const txn = pending[i]
    const idx = list.findIndex(t => t.id === txn.id)
    if (idx !== -1) {
      list[idx].serverId = r.serverId
      list[idx].updatedAt = r.updatedAt
    }
  })
  storage.saveTransactions(list)

  // 更新最后同步时间
  auth.setLastSyncTime(result.serverTime)

  return { success: true, uploaded: pending.length }
}

/**
 * 下载：拉取服务端增量数据，合并到本地
 */
export async function syncDownload() {
  const token = auth.getToken()
  if (!token) return { success: false, error: '未登录' }

  const since = auth.getLastSyncTime()
  const result = await api.downloadTransactions(since, token)

  if (result.transactions.length === 0) {
    auth.setLastSyncTime(result.serverTime)
    return { success: true, downloaded: 0 }
  }

  const list = storage.getTransactions()

  result.transactions.forEach(remote => {
    const idx = list.findIndex(t => t.serverId === remote.serverId)

    if (idx === -1) {
      // 本地不存在
      if (remote.deletedAt === null) {
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
      // 已删除的记录本地本就不存在，跳过
    } else {
      // 本地存在
      if (remote.deletedAt !== null) {
        // 服务端已删除 → 本地也删除
        list.splice(idx, 1)
      } else if (remote.updatedAt > list[idx].updatedAt) {
        // 服务端更新 → 覆盖本地（Last-write-wins）
        list[idx] = {
          ...list[idx],
          amount: remote.amount,
          note: remote.note,
          date: remote.date,
          updatedAt: remote.updatedAt,
        }
      }
      // 本地 updatedAt 更大 → 保留本地，不做覆盖
    }
  })

  storage.saveTransactions(list)
  auth.setLastSyncTime(result.serverTime)

  // 重建标签使用次数
  storage.rebuildTagUsage(list)

  return { success: true, downloaded: result.transactions.length }
}

/**
 * 首次登录合并
 * 拉取服务端全量 + 上传本地全部 + 合并去重
 */
export async function mergeOnFirstLogin() {
  const token = auth.getToken()
  if (!token) return { success: false, error: '未登录' }

  // 1. 拉取服务端全量数据
  const remoteResult = await api.downloadTransactions(0, token)

  // 2. 上传本地全部数据
  const localAll = storage.getTransactions()
  if (localAll.length > 0) {
    try {
      await api.uploadTransactions(localAll, token)
    } catch (e) {
      // 上传失败不阻塞合并，下次同步再上传
    }
  }

  // 3. 合并：按 note + amount + date 三元组去重
  const list = [...storage.getTransactions()]
  const existingKeys = new Set()
  list.forEach(t => {
    existingKeys.add(`${t.note}|${t.amount}|${t.date}`)
  })

  remoteResult.transactions.forEach(remote => {
    if (remote.deletedAt !== null) return // 跳过已删除的

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
    // 已存在的跳过（保留本地版本）
  })

  storage.saveTransactions(list)
  auth.setLastSyncTime(remoteResult.serverTime)
  storage.rebuildTagUsage(list)

  return { success: true }
}
```

---

## 六、`index.vue` 主要修改点

### 6.1 新增 data 字段

```js
data() {
  return {
    // ... 现有字段保持不变 ...

    // ===== V2 新增 =====
    // 登录弹窗
    loginModalVisible: false,
    loginEmail: '',
    loginCode: '',
    sendingCode: false,
    codeCountdown: 0,
    loggingIn: false,

    // 同步状态
    syncToastVisible: false,
    syncToastType: '',   // 'success' | 'error'
    syncToastText: '',

    // 退出登录确认
    logoutConfirmVisible: false,
  }
},
```

### 6.2 新增 computed

```js
computed: {
  // ... 现有 computed 保持不变 ...

  // ===== V2 新增 =====
  isLoggedIn() {
    return auth.isLoggedIn()
  },
  userEmail() {
    return auth.getUserEmail()
  },
},
```

### 6.3 新增 methods

以下方法需要新增到 `methods` 中：

```
方法列表及职责：

—— 登录相关 ——
handlePullDown()        - 下拉处理入口：已登录→同步，未登录→弹登录框
showLoginModal()        - 显示登录弹窗
closeLoginModal()       - 关闭登录弹窗
sendVerificationCode()  - 发送验证码（含 60s 倒计时）
handleLogin()           - 执行登录，成功后关闭弹窗并执行合并
startCodeCountdown()    - 启动 60 秒倒计时

—— 同步相关 ——
doSync()                - 执行同步（download → upload）
showSyncToast()         - 显示同步 toast（成功/失败）
hideSyncToast()         - 隐藏同步 toast

—— 退出登录 ——
showLogoutConfirm()     - 显示退出登录确认弹窗
hideLogoutConfirm()     - 关闭退出确认弹窗
doLogout()              - 执行退出登录
```

### 6.4 模板变更

#### 下拉刷新

将现有的 `scroll-view` 开启 `refresher-enabled`：

```html
<scroll-view
  class="transaction-list"
  scroll-y
  :refresher-enabled="true"
  refresher-default-style="none"
  @refresherrefresh="handlePullDown"
  :refresher-triggered="refresherTriggered"
>
  <!-- 现有内容 -->
</scroll-view>
```

或者在 `pages.json` 中开启 `enablePullDownRefresh`：

```json
{
  "path": "pages/index/index",
  "style": {
    "navigationStyle": "custom",
    "enablePullDownRefresh": true
  }
}
```

并在 `onPullDownRefresh` 生命周期和 `methods` 中处理。

#### 登录弹窗模板（放在页面底部，`</view>` 之前）

```html
<!-- 登录弹窗 -->
<view v-if="loginModalVisible" class="modal-overlay" @tap.self="closeLoginModal">
  <view class="modal-card" @tap.stop>
    <text class="modal-title">登录即注册</text>

    <!-- 邮箱输入 -->
    <view class="login-field">
      <text class="field-icon">📧</text>
      <input
        class="login-input"
        v-model="loginEmail"
        type="text"
        placeholder="输入邮箱"
        :disabled="loggingIn"
      />
    </view>

    <!-- 验证码输入 -->
    <view class="login-field">
      <text class="field-icon">🔢</text>
      <input
        class="login-input code-input"
        v-model="loginCode"
        type="number"
        maxlength="6"
        placeholder="验证码"
        :disabled="loggingIn"
        @confirm="handleLogin"
      />
      <view
        class="send-code-btn"
        :class="{ counting: codeCountdown > 0 }"
        @tap="sendVerificationCode"
      >
        <text v-if="codeCountdown === 0">发送验证码</text>
        <text v-else>{{ codeCountdown }}s</text>
      </view>
    </view>

    <!-- 登录按钮 -->
    <view
      class="login-btn"
      :class="{ disabled: loggingIn || !loginEmail || loginCode.length !== 6 }"
      @tap="handleLogin"
    >
      <text v-if="loggingIn">登录中...</text>
      <text v-else>登录</text>
    </view>

    <text class="login-hint">⚠ 请牢记邮箱，验证码无法找回</text>
  </view>
</view>
```

#### 同步 Toast（放在页面顶部固定定位）

```html
<!-- 同步状态 Toast -->
<view v-if="syncToastVisible" class="sync-toast" :class="syncToastType" @tap="syncToastType === 'error' ? doSync() : null">
  <text class="sync-toast-text">{{ syncToastText }}</text>
</view>
```

#### 月份选择器底部账户信息

在 `<view class="month-picker-card">` 内部的 `month-picker-grid` 和 `modal-actions` 之间添加：

```html
<!-- V2：已登录时显示账户信息 -->
<view v-if="isLoggedIn" class="account-section">
  <view class="account-divider"></view>
  <view class="account-row">
    <text class="account-email">📧 {{ userEmail }}</text>
    <view class="logout-btn" @tap="showLogoutConfirm">
      <text>退出</text>
    </view>
  </view>
</view>
```

#### 退出登录确认弹窗（与登录弹窗一样的 modal 结构）

```html
<!-- 退出登录确认弹窗 -->
<view v-if="logoutConfirmVisible" class="modal-overlay" @tap.self="hideLogoutConfirm">
  <view class="modal-card" @tap.stop>
    <text class="modal-title">退出登录</text>
    <text class="modal-body">退出后云端数据仍保留，本地数据不受影响。</text>
    <view class="modal-actions">
      <view class="modal-btn cancel" @tap="hideLogoutConfirm">
        <text>取消</text>
      </view>
      <view class="modal-btn confirm-delete" @tap="doLogout">
        <text>退出登录</text>
      </view>
    </view>
  </view>
</view>
```

### 6.5 新增方法实现要点

**handlePullDown()**：
```
1. 关闭 refresherTriggered
2. if auth.isLoggedIn(): doSync()
3. else: showLoginModal()
```

**sendVerificationCode()**：
```
1. 校验 loginEmail 非空 + 基本格式（含 @ 和 .）
2. 调用 api.sendCode(loginEmail)
3. 成功后启动 60s 倒计时
4. 失败时 uni.showToast 提示错误
```

**handleLogin()**：
```
1. 校验 loginEmail 和 loginCode
2. loggingIn = true
3. 调用 api.login(loginEmail, loginCode)
4. 成功后：
   a. auth.saveToken(token)
   b. auth.saveUserEmail(email)
   c. loginModalVisible = false
   d. if isNewUser: sync.mergeOnFirstLogin()
   e. 清空 loginEmail, loginCode
5. 失败时 uni.showToast 提示错误
6. loggingIn = false
```

**doSync()**：
```
1. showSyncToast('sync', '↻ 同步中...')
2. await syncDownload()
3. await syncUpload()
4. 成功: showSyncToast('success', '✓ 已同步', 1500ms)
5. 失败: showSyncToast('error', '⚠ 同步失败', 2000ms)
```

**doLogout()**：
```
1. auth.logout()
2. logoutConfirmVisible = false
3. monthPickerVisible = false
```

---

## 七、样式设计

### 7.1 同步 Toast

```css
.sync-toast {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 300;
  padding: 16rpx 40rpx;
  border-radius: 0 0 20rpx 20rpx;
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
}

.sync-toast.success {
  background: rgba(115, 199, 168, 0.9);
  color: #fff;
}

.sync-toast.error {
  background: rgba(232, 133, 109, 0.9);
  color: #fff;
}

.sync-toast-text {
  font-size: 28rpx;
  font-weight: 600;
}
```

### 7.2 登录弹窗内新增样式

```css
.login-field {
  display: flex;
  align-items: center;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 20rpx;
  padding: 0 20rpx;
  margin-bottom: 16rpx;
  height: 88rpx;
}

.field-icon {
  font-size: 32rpx;
  margin-right: 12rpx;
}

.login-input {
  flex: 1;
  height: 88rpx;
  font-size: 28rpx;
  color: var(--text-primary);
}

.code-input {
  max-width: 180rpx;
}

.send-code-btn {
  flex-shrink: 0;
  padding: 10rpx 20rpx;
  border-radius: 16rpx;
  background: var(--accent);
  cursor: pointer;
}

.send-code-btn.counting {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
}

.send-code-btn text {
  font-size: 24rpx;
  color: #fff;
  font-weight: 500;
}

.send-code-btn.counting text {
  color: var(--text-muted);
}

.login-btn {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #73C7A8, #5BAF8E);
  border-radius: 24rpx;
  margin-top: 24rpx;
}

.login-btn.disabled {
  background: #C8D6CF;
  opacity: 0.6;
}

.login-btn text {
  font-size: 32rpx;
  font-weight: 600;
  color: #fff;
}

.login-hint {
  font-size: 22rpx;
  color: var(--text-muted);
  text-align: center;
  margin-top: 20rpx;
}
```

### 7.3 月份选择器账户信息样式

```css
.account-section {
  margin-top: 20rpx;
}

.account-divider {
  height: 1px;
  background: var(--border);
  margin-bottom: 20rpx;
}

.account-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 0;
}

.account-email {
  font-size: 24rpx;
  color: var(--text-secondary);
}

.logout-btn {
  padding: 10rpx 24rpx;
  border-radius: 16rpx;
  background: var(--input-bg);
}

.logout-btn text {
  font-size: 24rpx;
  color: var(--text-muted);
}
```

---

## 八、`storage.js` 修改

### 8.1 `addTransaction` 修改

创建记录时自动加上新字段的默认值：

```js
export function addTransaction(txn) {
  const list = getTransactions()
  list.push({
    ...txn,
    serverId: txn.serverId || null,
    createdAt: txn.createdAt || Date.now(),
    updatedAt: txn.updatedAt || Date.now(),
    deletedAt: txn.deletedAt || null,
  })
  uni.setStorageSync(KEYS.TRANSACTIONS, JSON.stringify(list))
}
```

### 8.2 `updateTransaction` 修改

更新时自动刷新 `updatedAt`：

```js
export function updateTransaction(id, updates) {
  const list = getTransactions()
  const idx = list.findIndex(t => t.id === id)
  if (idx === -1) return false
  Object.assign(list[idx], updates, { updatedAt: Date.now() })
  uni.setStorageSync(KEYS.TRANSACTIONS, JSON.stringify(list))
  return true
}
```

### 8.3 `deleteTransaction` 修改

改为软删除：

```js
export function deleteTransaction(id) {
  const list = getTransactions()
  const idx = list.findIndex(t => t.id === id)
  if (idx === -1) return false
  list[idx].deletedAt = Date.now()
  list[idx].updatedAt = Date.now()
  uni.setStorageSync(KEYS.TRANSACTIONS, JSON.stringify(list))
  return true
}
```

### 8.4 新增 `saveTransactions`

批量保存整个列表（同步逻辑使用）：

```js
export function saveTransactions(list) {
  uni.setStorageSync(KEYS.TRANSACTIONS, JSON.stringify(list))
}
```

### 8.5 `getTransactions` 修改

过滤软删除的记录（默认行为不变，但需要确认 UI 层是否需要读软删除记录用于上传）：

```js
// getTransactions 默认返回未删除的记录（UI 展示用）
export function getTransactions() {
  try {
    const raw = uni.getStorageSync(KEYS.TRANSACTIONS)
    const list = raw ? JSON.parse(raw) : []
    return list.filter(t => !t.deletedAt)
  } catch {
    return []
  }
}
```

---

## 九、注意要点

1. **条件编译**：日期选择器已有 `#ifdef APP-PLUS` / `#ifdef H5` 分支，新增代码保持跨平台兼容
2. **Scroll-view refresher**：uni-app 的 refresher 在 H5 和微信小程序上行为有差异，需分别测试
3. **验证码登录后自动关闭弹窗**：不额外弹 toast，用户看到界面刷新即为登录成功
4. **首次登录合并**：`mergeOnFirstLogin` 不上传也不下载成功时，仍然关闭弹窗；可稍后再试
5. **金额处理**：`saveTransaction` 中无符号数字默认为支出的逻辑保持不变
6. **API Base URL**：开发时可用 `localhost`，部署时替换为实际域名；建议做成可配置的常量
7. **离线处理**：所有同步调用都要 try-catch，失败时静默处理，不阻塞 UI
