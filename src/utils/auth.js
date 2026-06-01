/**
 * 认证状态管理
 *
 * 管理 token、用户邮箱、最后同步时间等认证相关数据，
 * 提供登录态判断和退出登录功能。
 */

const KEYS = {
  TOKEN: 'lucky_token',
  USER_EMAIL: 'lucky_user_email',
  LAST_SYNC_TIME: 'lucky_last_sync_time',
}

/** 获取存储的 JWT token */
export function getToken() {
  try {
    return uni.getStorageSync(KEYS.TOKEN) || null
  } catch {
    return null
  }
}

/** 保存 JWT token */
export function saveToken(token) {
  uni.setStorageSync(KEYS.TOKEN, token)
}

/** 是否已登录（基于 token 是否存在） */
export function isLoggedIn() {
  return !!getToken()
}

/** 获取用户邮箱 */
export function getUserEmail() {
  try {
    return uni.getStorageSync(KEYS.USER_EMAIL) || ''
  } catch {
    return ''
  }
}

/** 保存用户邮箱 */
export function saveUserEmail(email) {
  uni.setStorageSync(KEYS.USER_EMAIL, email)
}

/** 获取上次同步时间戳（毫秒），首次返回 0 */
export function getLastSyncTime() {
  try {
    const val = uni.getStorageSync(KEYS.LAST_SYNC_TIME)
    return val ? parseInt(val, 10) : 0
  } catch {
    return 0
  }
}

/** 更新上次同步时间戳 */
export function setLastSyncTime(ts) {
  uni.setStorageSync(KEYS.LAST_SYNC_TIME, ts)
}

/** 退出登录：清除所有认证相关数据 */
export function logout() {
  uni.removeStorageSync(KEYS.TOKEN)
  uni.removeStorageSync(KEYS.USER_EMAIL)
  uni.removeStorageSync(KEYS.LAST_SYNC_TIME)
}
