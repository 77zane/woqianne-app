/**
 * API 请求封装
 *
 * 封装所有后端 HTTP 请求，统一处理错误和 Token 注入。
 */

// 后端 API 地址（生产环境）
const BASE_URL = 'https://api.biubiudiudiu.cn'

/**
 * 通用请求方法
 * @param {string} path - API 路径，如 '/api/auth/login'
 * @param {object} opts - { method, token, body }
 * @returns {Promise<object>} 返回 data 字段的内容
 */
async function request(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + path,
      method,
      header: headers,
      data: body,
      timeout: 10000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data.data)
        } else {
          const msg = res.data?.error || '请求失败'
          const err = new Error(msg)
          err.statusCode = res.statusCode
          reject(err)
        }
      },
      fail: (err) => {
        console.error('[API] 请求失败:', BASE_URL + path, JSON.stringify(err))
        reject(new Error('网络错误，请检查网络连接'))
      },
    })
  })
}

// ===================== 认证接口 =====================

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

// ===================== 同步接口 =====================

/** 上传变更 */
export function uploadTransactions(transactions, token) {
  return request('/api/sync/upload', {
    method: 'POST',
    token,
    body: { transactions },
  })
}

/** 下载变更（增量同步） */
export function downloadTransactions(since, token) {
  return request(`/api/sync/download?since=${since}`, {
    method: 'GET',
    token,
  })
}
