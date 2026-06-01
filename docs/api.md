# 接口文档 v1.0

## 基本信息

| 项目 | 值 |
|------|-----|
| Base URL | `https://api.yourdomain.com`（开发/部署时回填） |
| 协议 | HTTPS |
| 认证方式 | Bearer Token（JWT，有效期 10 年） |
| 请求 Content-Type | `application/json` |
| 响应数据格式 | JSON |
| 字符编码 | UTF-8 |
| 时间戳格式 | 毫秒级 Unix 时间戳（`number` 类型） |

## 通用响应格式

成功响应统一使用 HTTP 200，数据在 `data` 字段中：

```json
{
  "data": { ... }
}
```

错误响应格式：

```json
{
  "error": "错误描述信息"
}
```

---

## 一、认证接口

### 1.1 发送验证码

发送 6 位数字验证码到用户邮箱。

```
POST /api/auth/send-code
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | ✅ | 用户邮箱地址 |

```json
{
  "email": "user@example.com"
}
```

**成功响应 `200`：**

```json
{
  "data": {
    "message": "验证码已发送"
  }
}
```

**错误响应：**

| 状态码 | 场景 | 响应体 |
|--------|------|--------|
| `400` | 邮箱格式不合法 | `{ "error": "邮箱格式不正确" }` |
| `429` | 60 秒内重复发送 | `{ "error": "请求过于频繁，请60秒后重试" }` |
| `500` | 邮件发送失败 | `{ "error": "验证码发送失败，请稍后重试" }` |

**后端逻辑：**
1. 校验邮箱格式（基本正则：`^[^\s@]+@[^\s@]+\.[^\s@]+$`）
2. 检查同一邮箱 60 秒内是否已发送过验证码（通过 `verify_codes` 表查询最近一条的 `created_at`）
3. 生成 6 位随机数字验证码（100000 ~ 999999）
4. 计算过期时间：当前时间 + 5 分钟
5. 存入 `verify_codes` 表
6. 调用 Resend API 发送邮件

**Resend 邮件内容模板：**

```
主题：您的验证码是 ${code}

正文：
您的验证码是：${code}
有效期 5 分钟，请勿泄露给他人。

如非本人操作，请忽略此邮件。
```

---

### 1.2 登录（登录即注册）

验证邮箱验证码，首次登录自动创建账号，返回 JWT。

```
POST /api/auth/login
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | ✅ | 用户邮箱 |
| `code` | string | ✅ | 6 位数字验证码 |

```json
{
  "email": "user@example.com",
  "code": "654321"
}
```

**成功响应 `200`：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `token` | string | JWT，有效期 10 年 |
| `isNewUser` | boolean | 首次注册为 `true`，已有账号为 `false` |

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "isNewUser": true
  }
}
```

**错误响应：**

| 状态码 | 场景 | 响应体 |
|--------|------|--------|
| `400` | 邮箱或验证码为空 | `{ "error": "邮箱和验证码不能为空" }` |
| `401` | 验证码错误 | `{ "error": "验证码错误" }` |
| `410` | 验证码过期 | `{ "error": "验证码已过期，请重新发送" }` |

**后端逻辑：**
1. 校验邮箱格式和验证码非空
2. 查找 `verify_codes` 表中该邮箱最新一条未使用的验证码
3. 校验验证码是否匹配，不匹配返回 401
4. 检验是否过期（`expires_at < now`），过期返回 410
5. 标记该验证码为已使用（更新 `used_at`）
6. 在 `users` 表中查找邮箱：
   - **不存在** → 创建新用户，`isNewUser = true`
   - **存在** → `isNewUser = false`
7. 签发 JWT：
   - Payload: `{ sub: <user_id>, email: "<email>", iat: <now> }`
   - 过期时间: `now + 10年`
   - 签名算法: HS256
8. 返回 token 和 isNewUser

---

## 二、同步接口

以下所有接口需在 Header 中携带 JWT：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

未携带或 Token 无效/过期，统一返回 `401`：

```json
{ "error": "未登录或登录已过期" }
```

### 2.1 上传变更

将前端本地的创建/修改/删除操作同步到服务端。逐条或批量调用。

```
POST /api/sync/upload
```

**请求头：**

```
Authorization: Bearer <token>
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `transactions` | array | ✅ | 待同步的交易记录列表，单条或多条 |

`transactions` 数组中每条记录：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serverId` | string \| null | 必填 | 服务端 ID，新建时为 `null`，已存在的为 UUID 字符串 |
| `amount` | number | ✅ | 金额，负数=支出，正数=收入，不能为 0 |
| `note` | string | ❌ | 备注，最长 50 字 |
| `date` | string | ✅ | 日期字符串，格式 `YYYY-MM-DD` |
| `createdAt` | number | ✅ | 创建时间戳（毫秒） |
| `updatedAt` | number | ✅ | 最后修改时间戳（毫秒） |
| `deletedAt` | number \| null | ✅ | 软删除时间戳，`null` 表示正常记录 |

```json
{
  "transactions": [
    {
      "serverId": null,
      "amount": -18,
      "note": "午餐",
      "date": "2026-05-31",
      "createdAt": 1748697600000,
      "updatedAt": 1748697600000,
      "deletedAt": null
    },
    {
      "serverId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "amount": 8500,
      "note": "工资",
      "date": "2026-05-30",
      "createdAt": 1748611200000,
      "updatedAt": 1748698800000,
      "deletedAt": null
    }
  ]
}
```

**成功响应 `200`：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `results` | array | 与 `transactions` 一一对应的结果数组 |
| `serverTime` | number | 服务端当前时间戳，前端用于更新 `lastSyncTime` |

`results` 中每条：

| 字段 | 类型 | 说明 |
|------|------|------|
| `serverId` | string | 服务端分配的全局唯一 ID（UUID v4） |
| `updatedAt` | number | 服务端确认的最终更新时间戳 |

```json
{
  "data": {
    "results": [
      {
        "serverId": "b1c2d3e4-f5a6-7890-abcd-ef1234567891",
        "updatedAt": 1748697600123
      },
      {
        "serverId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "updatedAt": 1748698800000
      }
    ],
    "serverTime": 1748698800123
  }
}
```

**错误响应：**

| 状态码 | 场景 | 响应体 |
|--------|------|--------|
| `400` | transactions 为空 | `{ "error": "同步数据不能为空" }` |
| `400` | 数据校验失败（金额为 0 等） | `{ "error": "数据格式错误：amount 不能为 0" }` |
| `401` | Token 无效或过期 | `{ "error": "未登录或登录已过期" }` |

**后端逻辑：**

对于每条记录：

1. **基本校验**：amount 不能为 0，date 格式必须为 YYYY-MM-DD
2. **upsert 逻辑**：
   - `serverId` 为 `null` 或服务端不存在 → **INSERT**：生成 UUID v4 作为 `server_id`，注意 `created_at` 取前端传的值（以客户端时间为准），防止时间偏差
   - `serverId` 存在且服务端也存在于该用户数据中 → **UPDATE**：更新所有字段
3. **冲突处理**（Last-write-wins）：
   - 比较前端传来的 `updatedAt` 和服务端当前的 `updated_at`
   - 如果前端时间戳 ≤ 服务端时间戳 → **跳过当前记录**（服务端有新版本），仍然返回当前记录的信息
   - 如果前端时间戳 > 服务端时间戳 → 执行更新
4. 返回每条记录的 `serverId` 和最终的 `updatedAt`

---

### 2.2 下载变更

拉取服务端增量变更数据。

```
GET /api/sync/download?since={lastSyncTime}
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `since` | number | ✅ | 上次同步时间戳（毫秒），首次传 `0` 拉取全量 |

**成功响应 `200`：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `transactions` | array | 所有 `updatedAt > since` 的记录（含已软删除的） |
| `serverTime` | number | 服务端当前时间戳 |

`transactions` 中每条：

| 字段 | 类型 | 说明 |
|------|------|------|
| `serverId` | string | 服务端全局唯一 ID |
| `amount` | number | 金额 |
| `note` | string | 备注 |
| `date` | string | 日期 `YYYY-MM-DD` |
| `createdAt` | number | 创建时间戳 |
| `updatedAt` | number | 最后修改时间戳 |
| `deletedAt` | number \| null | 软删除时间，`null` 正常 |

```json
{
  "data": {
    "transactions": [
      {
        "serverId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "amount": -18,
        "note": "午餐",
        "date": "2026-05-31",
        "createdAt": 1748697600000,
        "updatedAt": 1748697600000,
        "deletedAt": null
      },
      {
        "serverId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "amount": -35,
        "note": "地铁",
        "date": "2026-05-31",
        "createdAt": 1748698000000,
        "updatedAt": 1748700000000,
        "deletedAt": 1748700000000
      }
    ],
    "serverTime": 1748700000000
  }
}
```

**注意**：`deletedAt` 不为 `null` 的记录也需要返回，前端根据此字段在本地执行软删除。

**后端逻辑：**

1. 校验 `since` 参数，非数字时返回 400
2. 查询 `transactions` 表中 `user_id = <当前用户>` 且 `updated_at > since` 的所有记录（包括 `deleted_at` 非空的）
3. 返回数据 + 当前服务端时间戳

---

## 三、错误码汇总

| 状态码 | 含义 | 前端处理 |
|--------|------|---------|
| `200` | 成功 | 正常处理 |
| `400` | 请求参数错误 | 检查请求体，使用默认值 |
| `401` | 未认证 / Token 过期 | 清除本地 token，下次下拉时重新弹出登录框 |
| `410` | 验证码过期 | 提示用户，重新发送验证码 |
| `429` | 请求过于频繁 | 提示等待 60 秒后重试 |
| `500` | 服务端内部错误 | 提示"同步失败，请稍后重试" |

---

## 四、数据库表结构（后端实现参考）

### 4.1 users 表

```sql
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);
```

### 4.2 verify_codes 表

```sql
CREATE TABLE IF NOT EXISTS verify_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL,
    code       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verify_codes_email
    ON verify_codes(email);
```

### 4.3 transactions 表

```sql
CREATE TABLE IF NOT EXISTS transactions (
    server_id  TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    amount     REAL    NOT NULL,
    note       TEXT    DEFAULT '',
    date       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_updated
    ON transactions(user_id, updated_at);
```

---

## 五、接口调用时序

### 5.1 新用户首次使用流程

```
1. 用户下拉页面
2. 前端检查无 token → 弹出登录弹窗
3. 用户输入邮箱 → 前端调用 POST /api/auth/send-code
4. 用户收到邮件，输入验证码 → 前端调用 POST /api/auth/login
5. 拿到 token，isNewUser = true
6. 前端将本地全部标记为"未同步"的记录
   调用 POST /api/sync/upload 批量上传
7. 调用 GET /api/sync/download?since=0 拉取全量（首次为空）
8. 更新 lastSyncTime
```

### 5.2 日常同步流程

```
1. 用户下拉页面
2. 前端检查有 token → 调用 GET /api/sync/download?since={lastSyncTime}
3. 处理返回数据，更新本地
4. 调用 POST /api/sync/upload（本地有 pending 记录时）
5. 更新 lastSyncTime
```

### 5.3 操作后自动同步

```
1. 用户保存/编辑/删除一条记录
2. 本地 storage 立即更新
3. 异步调用 POST /api/sync/upload（仅这一条）
4. 成功 → 回写 serverId 和 updatedAt，更新 lastSyncTime
5. 失败 → 不做处理，下次下拉时重新同步
```
