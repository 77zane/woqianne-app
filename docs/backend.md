# 后端开发文档 — 第二阶段

## 一、技术栈

| 项目 | 选型 | 说明 |
|------|------|------|
| 语言 | Java 17+ | 用户最熟悉的语言 |
| Web 框架 | Javalin | 极轻量，类似 Express 风格 |
| 数据库 | SQLite（JDBC） | 零配置，单文件存储，个人 App 够用 |
| ORM | 不用 | 直接 JDBC SQL 语句，保持简单 |
| JWT | java-jwt（Auth0）/ jjwt | 签发和验证 JWT |
| 邮件 | Resend HTTP API | 发送验证码邮件 |
| HTTP Client | Java 11 内置 `HttpClient` | 调用 Resend API |
| JSON | Jackson / Gson | JSON 序列化 |
| 密码哈希 | 不需要 | 无密码方案，无需 bcrypt |

---

## 二、项目结构

```
lucky-server/
├── pom.xml                     (Maven 项目配置)
├── src/main/java/com/lucky/
│   ├── App.java                (入口，main 方法)
│   ├── config/
│   │   └── Config.java         (配置常量：端口、JWT 密钥、Resend API Key 等)
│   ├── db/
│   │   └── Database.java       (SQLite 初始化 + 建表 + 连接管理)
│   ├── model/
│   │   ├── User.java           (用户数据类)
│   │   ├── VerifyCode.java     (验证码数据类)
│   │   └── Transaction.java    (交易记录数据类)
│   ├── handler/
│   │   ├── AuthHandler.java    (认证接口处理)
│   │   └── SyncHandler.java    (同步接口处理)
│   ├── service/
│   │   ├── AuthService.java    (认证业务逻辑)
│   │   ├── SyncService.java    (同步业务逻辑)
│   │   └── EmailService.java   (Resend 邮件发送)
│   └── middleware/
│       └── AuthMiddleware.java (JWT 验证中间件)
└── src/main/resources/
    └── application.properties  (外部配置)
```

如果追求更极简，可以合并 handler 和 service，直接在 handler 中写全逻辑。

---

## 三、依赖（Maven pom.xml 核心依赖）

```xml
<dependencies>
    <!-- Web 框架 -->
    <dependency>
        <groupId>io.javalin</groupId>
        <artifactId>javalin</artifactId>
        <version>6.3.0</version>
    </dependency>

    <!-- SQLite JDBC -->
    <dependency>
        <groupId>org.xerial</groupId>
        <artifactId>sqlite-jdbc</artifactId>
        <version>3.46.1.0</version>
    </dependency>

    <!-- JWT -->
    <dependency>
        <groupId>com.auth0</groupId>
        <artifactId>java-jwt</artifactId>
        <version>4.4.0</version>
    </dependency>

    <!-- JSON -->
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
        <version>2.17.2</version>
    </dependency>

    <!-- 日志 -->
    <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-simple</artifactId>
        <version>2.0.13</version>
    </dependency>
</dependencies>
```

---

## 四、数据库设计

### 4.1 初始化 SQL

启动时自动建表，SQLite 文件存于项目根目录 `data/lucky.db`。

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);

-- 验证码表
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

-- 交易记录表
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

### 4.2 字段说明

#### users

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 自增主键 |
| `email` | TEXT | 邮箱，唯一 |
| `created_at` | INTEGER | 注册时间戳（毫秒） |

#### verify_codes

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 自增主键 |
| `email` | TEXT | 邮箱 |
| `code` | TEXT | 6 位验证码 |
| `expires_at` | INTEGER | 过期时间戳（毫秒） |
| `used_at` | INTEGER | 使用时间，null 表示未使用 |
| `created_at` | INTEGER | 创建时间戳（毫秒） |

#### transactions

| 字段 | 类型 | 说明 |
|------|------|------|
| `server_id` | TEXT | UUID v4，主键 |
| `user_id` | INTEGER | 外键，关联 users.id |
| `amount` | REAL | 金额，负数=支出，正数=收入 |
| `note` | TEXT | 备注，默认空字符串 |
| `date` | TEXT | 日期 `YYYY-MM-DD` |
| `created_at` | INTEGER | 创建时间戳（毫秒） |
| `updated_at` | INTEGER | 最后修改时间戳（毫秒） |
| `deleted_at` | INTEGER | 软删除时间戳，null=正常 |

### 4.3 数据隔离

所有涉及 transactions 的查询必须带 `WHERE user_id = ?` 条件，保证用户数据隔离。

---

## 五、配置常量（Config.java）

```java
public class Config {
    // 服务端口
    public static final int PORT = 8080;

    // JWT 密钥（至少 256 bit，部署时更换为实际密钥）
    public static final String JWT_SECRET = "your-256-bit-secret-key-here-change-in-production";

    // JWT 有效期：10 年（毫秒）
    public static final long JWT_EXPIRATION = 10L * 365 * 24 * 60 * 60 * 1000;

    // Resend API
    public static final String RESEND_API_KEY = "re_xxxxxxxxxxxx";  // 部署时回填
    public static final String RESEND_API_URL = "https://api.resend.com/emails";
    public static final String RESEND_FROM = "noreply@yourdomain.com";  // 部署时回填

    // 数据库路径
    public static final String DB_PATH = "data/lucky.db";

    // 验证码有效期：5 分钟
    public static final long CODE_EXPIRATION = 5 * 60 * 1000;

    // 验证码重发间隔：60 秒
    public static final long CODE_RESEND_INTERVAL = 60 * 1000;
}
```

**安全提醒**：`JWT_SECRET`、`RESEND_API_KEY` 这些敏感信息不要硬编码，建议从环境变量或外部配置文件读取。部署时通过环境变量注入。

---

## 六、数据库连接管理（Database.java）

```java
public class Database {
    private static final String URL = "jdbc:sqlite:" + Config.DB_PATH;

    static {
        // 确保 data 目录存在
        new File("data").mkdirs();

        // 初始化表结构
        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement()) {

            stmt.execute("PRAGMA journal_mode=WAL");      // 写性能优化
            stmt.execute("PRAGMA foreign_keys=ON");        // 启用外键约束

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    email      TEXT    NOT NULL UNIQUE,
                    created_at INTEGER NOT NULL
                )
            """);

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS verify_codes (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    email      TEXT    NOT NULL,
                    code       TEXT    NOT NULL,
                    expires_at INTEGER NOT NULL,
                    used_at    INTEGER,
                    created_at INTEGER NOT NULL
                )
            """);

            stmt.execute("""
                CREATE INDEX IF NOT EXISTS idx_verify_codes_email
                    ON verify_codes(email)
            """);

            stmt.execute("""
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
                )
            """);

            stmt.execute("""
                CREATE INDEX IF NOT EXISTS idx_transactions_user_updated
                    ON transactions(user_id, updated_at)
            """);

        } catch (SQLException e) {
            throw new RuntimeException("数据库初始化失败", e);
        }
    }

    public static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(URL);
    }
}
```

**注意**：SQLite JDBC 的 `sqlite-jdbc` 驱动会自动通过 `DriverManager` 加载，无需显式 `Class.forName`。

---

## 七、接口实现

### 7.1 路由注册（App.java）

```java
public class App {
    public static void main(String[] args) {
        Javalin app = Javalin.create(config -> {
            config.plugins.enableCors(cors -> {
                cors.add(it -> {
                    it.anyHost();  // 生产环境应限制具体域名
                });
            });
        }).start(Config.PORT);

        // 认证接口（无需鉴权）
        app.post("/api/auth/send-code", AuthHandler::sendCode);
        app.post("/api/auth/login", AuthHandler::login);

        // 同步接口（需鉴权）
        app.post("/api/sync/upload", SyncHandler::upload, Role.ANYONE);
        app.get("/api/sync/download", SyncHandler::download, Role.ANYONE);

        // 全局鉴权
        app.before("/api/sync/*", AuthMiddleware::verify);

        System.out.println("Server started on port " + Config.PORT);
    }
}
```

Javalin 的鉴权有两种方式：
1. 使用 `app.before()` 全局中间件
2. Javalin 6.x 的 `Role.ANYONE` 机制

推荐方式 1（`app.before` 中间件），更直观。

---

### 7.2 JWT 鉴权中间件（AuthMiddleware.java）

```java
public class AuthMiddleware {
    public static void verify(Context ctx) {
        String header = ctx.header("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            ctx.status(401).json(Map.of("error", "未登录或登录已过期"));
            throw new RouteStopped();
        }

        String token = header.substring(7);
        try {
            DecodedJWT jwt = JWT.require(Algorithm.HMAC256(Config.JWT_SECRET))
                .build()
                .verify(token);

            // 将用户信息存入 ctx，供后续 handler 使用
            ctx.attribute("userId", jwt.getSubject());
            ctx.attribute("userEmail", jwt.getClaim("email").asString());
            ctx.attribute("userId", Integer.parseInt(jwt.getSubject()));

        } catch (JWTVerificationException e) {
            ctx.status(401).json(Map.of("error", "未登录或登录已过期"));
            throw new RouteStopped();
        }
    }
}
```

Javalin 中抛出 `RouteStopped`（或对应的异常类）可以中止请求处理。具体取决于 Javalin 版本，也可以用 `ctx.skipRemainingHandlers()`。

---

### 7.3 认证 Handler（AuthHandler.java）

#### 7.3.1 发送验证码

```
POST /api/auth/send-code
Request:  { "email": "user@example.com" }
Response: { "data": { "message": "验证码已发送" } }
```

```java
public class AuthHandler {

    public static void sendCode(Context ctx) {
        JsonNode body = ctx.bodyAsClass(JsonNode.class);
        String email = body.get("email").asText();

        // 1. 校验邮箱格式
        if (email == null || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            ctx.status(400).json(Map.of("error", "邮箱格式不正确"));
            return;
        }

        // 2. 检查 60 秒内是否已发送
        try (Connection conn = Database.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT created_at FROM verify_codes WHERE email = ? ORDER BY id DESC LIMIT 1"
             )) {
            ps.setString(1, email);
            ResultSet rs = ps.executeQuery();
            if (rs.next()) {
                long lastSent = rs.getLong("created_at");
                if (System.currentTimeMillis() - lastSent < Config.CODE_RESEND_INTERVAL) {
                    ctx.status(429).json(Map.of("error", "请求过于频繁，请60秒后重试"));
                    return;
                }
            }
        } catch (SQLException e) {
            ctx.status(500).json(Map.of("error", "服务器错误"));
            return;
        }

        // 3. 生成验证码
        String code = String.valueOf(100000 + (int)(Math.random() * 900000));

        // 4. 存入数据库
        long now = System.currentTimeMillis();
        try (Connection conn = Database.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "INSERT INTO verify_codes (email, code, expires_at, created_at) VALUES (?, ?, ?, ?)"
             )) {
            ps.setString(1, email);
            ps.setString(2, code);
            ps.setLong(3, now + Config.CODE_EXPIRATION);
            ps.setLong(4, now);
            ps.executeUpdate();
        } catch (SQLException e) {
            ctx.status(500).json(Map.of("error", "服务器错误"));
            return;
        }

        // 5. 发送邮件
        try {
            EmailService.sendVerificationCode(email, code);
        } catch (Exception e) {
            ctx.status(500).json(Map.of("error", "验证码发送失败，请稍后重试"));
            return;
        }

        ctx.json(Map.of("data", Map.of("message", "验证码已发送")));
    }

    public static void login(Context ctx) {
        // ... 见下方
    }
}
```

#### 7.3.2 登录

```
POST /api/auth/login
Request:  { "email": "user@example.com", "code": "654321" }
Response: { "data": { "token": "...", "isNewUser": true/false } }
```

```java
public static void login(Context ctx) {
    JsonNode body = ctx.bodyAsClass(JsonNode.class);
    String email = body.get("email").asText();
    String code = body.get("code").asText();

    // 1. 基本校验
    if (email == null || email.isBlank() || code == null || code.isBlank()) {
        ctx.status(400).json(Map.of("error", "邮箱和验证码不能为空"));
        return;
    }

    long now = System.currentTimeMillis();

    try (Connection conn = Database.getConnection()) {

        // 2. 校验验证码
        PreparedStatement ps = conn.prepareStatement(
            "SELECT id, code, expires_at FROM verify_codes WHERE email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1"
        );
        ps.setString(1, email);
        ResultSet rs = ps.executeQuery();

        if (!rs.next()) {
            ctx.status(401).json(Map.of("error", "验证码错误"));
            return;
        }

        String dbCode = rs.getString("code");
        long expiresAt = rs.getLong("expires_at");
        long codeId = rs.getLong("id");

        if (!dbCode.equals(code)) {
            ctx.status(401).json(Map.of("error", "验证码错误"));
            return;
        }

        if (now > expiresAt) {
            ctx.status(410).json(Map.of("error", "验证码已过期，请重新发送"));
            return;
        }

        // 3. 标记验证码已使用
        PreparedStatement updatePs = conn.prepareStatement(
            "UPDATE verify_codes SET used_at = ? WHERE id = ?"
        );
        updatePs.setLong(1, now);
        updatePs.setLong(2, codeId);
        updatePs.executeUpdate();

        // 4. 查找或创建用户
        PreparedStatement userPs = conn.prepareStatement(
            "SELECT id FROM users WHERE email = ?"
        );
        userPs.setString(1, email);
        ResultSet userRs = userPs.executeQuery();

        int userId;
        boolean isNewUser = false;

        if (userRs.next()) {
            userId = userRs.getInt("id");
        } else {
            // 新用户 → 创建
            PreparedStatement createPs = conn.prepareStatement(
                "INSERT INTO users (email, created_at) VALUES (?, ?)",
                Statement.RETURN_GENERATED_KEYS
            );
            createPs.setString(1, email);
            createPs.setLong(2, now);
            createPs.executeUpdate();
            ResultSet genKeys = createPs.getGeneratedKeys();
            userId = genKeys.getInt(1);
            isNewUser = true;
        }

        // 5. 签发 JWT
        String token = JWT.create()
            .withSubject(String.valueOf(userId))
            .withClaim("email", email)
            .withIssuedAt(new Date(now))
            .withExpiresAt(new Date(now + Config.JWT_EXPIRATION))
            .sign(Algorithm.HMAC256(Config.JWT_SECRET));

        ctx.json(Map.of("data", Map.of(
            "token", token,
            "isNewUser", isNewUser
        )));

    } catch (SQLException e) {
        ctx.status(500).json(Map.of("error", "服务器错误"));
    }
}
```

---

### 7.4 同步 Handler（SyncHandler.java）

#### 7.4.1 上传

```
POST /api/sync/upload
Request:  { "transactions": [ { ... }, ... ] }
Response: { "data": { "results": [ ... ], "serverTime": ... } }
```

```java
public class SyncHandler {

    public static void upload(Context ctx) {
        int userId = ctx.attribute("userId");
        JsonNode body = ctx.bodyAsClass(JsonNode.class);
        JsonNode transactions = body.get("transactions");

        if (transactions == null || !transactions.isArray() || transactions.size() == 0) {
            ctx.status(400).json(Map.of("error", "同步数据不能为空"));
            return;
        }

        List<Map<String, Object>> results = new ArrayList<>();
        long now = System.currentTimeMillis();

        try (Connection conn = Database.getConnection()) {
            conn.setAutoCommit(false);  // 事务

            PreparedStatement selectPs = conn.prepareStatement(
                "SELECT updated_at FROM transactions WHERE server_id = ? AND user_id = ?"
            );
            PreparedStatement insertPs = conn.prepareStatement(
                "INSERT INTO transactions (server_id, user_id, amount, note, date, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            );
            PreparedStatement updatePs = conn.prepareStatement(
                "UPDATE transactions SET amount=?, note=?, date=?, updated_at=?, deleted_at=? WHERE server_id=? AND user_id=?"
            );

            for (JsonNode txn : transactions) {
                String serverId = txn.has("serverId") && !txn.get("serverId").isNull()
                    ? txn.get("serverId").asText() : null;
                double amount = txn.get("amount").asDouble();
                String note = txn.has("note") ? txn.get("note").asText() : "";
                String date = txn.get("date").asText();
                long createdAt = txn.get("createdAt").asLong();
                long updatedAt = txn.get("updatedAt").asLong();
                Long deletedAt = txn.has("deletedAt") && !txn.get("deletedAt").isNull()
                    ? txn.get("deletedAt").asLong() : null;

                // 基本校验
                if (amount == 0) {
                    ctx.status(400).json(Map.of("error", "数据格式错误：amount 不能为 0"));
                    conn.rollback();
                    return;
                }

                if (serverId == null) {
                    // 新建 → INSERT
                    String newId = UUID.randomUUID().toString();
                    insertPs.setString(1, newId);
                    insertPs.setInt(2, userId);
                    insertPs.setDouble(3, amount);
                    insertPs.setString(4, note);
                    insertPs.setString(5, date);
                    insertPs.setLong(6, createdAt);
                    insertPs.setLong(7, updatedAt);
                    if (deletedAt != null) insertPs.setLong(8, deletedAt);
                    else insertPs.setNull(8, Types.INTEGER);
                    insertPs.executeUpdate();

                    results.add(Map.of("serverId", newId, "updatedAt", updatedAt));

                } else {
                    // 已存在 → 检查是否需更新（Last-write-wins）
                    selectPs.setString(1, serverId);
                    selectPs.setInt(2, userId);
                    ResultSet rs = selectPs.executeQuery();

                    if (rs.next()) {
                        long dbUpdatedAt = rs.getLong("updated_at");

                        if (updatedAt > dbUpdatedAt) {
                            // 前端版本更新 → UPDATE
                            updatePs.setDouble(1, amount);
                            updatePs.setString(2, note);
                            updatePs.setString(3, date);
                            updatePs.setLong(4, updatedAt);
                            if (deletedAt != null) updatePs.setLong(5, deletedAt);
                            else updatePs.setNull(5, Types.INTEGER);
                            updatePs.setString(6, serverId);
                            updatePs.setInt(7, userId);
                            updatePs.executeUpdate();
                        }
                        // else: 服务端版本更新，跳过（返回当前时间戳）
                        results.add(Map.of("serverId", serverId, "updatedAt", Math.max(updatedAt, dbUpdatedAt)));

                    } else {
                        // serverId 不在该用户名下 → INSERT
                        insertPs.setString(1, serverId);
                        insertPs.setInt(2, userId);
                        insertPs.setDouble(3, amount);
                        insertPs.setString(4, note);
                        insertPs.setString(5, date);
                        insertPs.setLong(6, createdAt);
                        insertPs.setLong(7, updatedAt);
                        if (deletedAt != null) insertPs.setLong(8, deletedAt);
                        else insertPs.setNull(8, Types.INTEGER);
                        insertPs.executeUpdate();

                        results.add(Map.of("serverId", serverId, "updatedAt", updatedAt));
                    }
                }
            }

            conn.commit();

            ctx.json(Map.of("data", Map.of(
                "results", results,
                "serverTime", now
            )));

        } catch (SQLException e) {
            ctx.status(500).json(Map.of("error", "服务器错误"));
        }
    }

    public static void download(Context ctx) {
        // ... 见下方
    }
}
```

#### 7.4.2 下载

```
GET /api/sync/download?since={lastSyncTime}
Response: { "data": { "transactions": [ ... ], "serverTime": ... } }
```

```java
public static void download(Context ctx) {
    int userId = ctx.attribute("userId");
    String sinceStr = ctx.queryParam("since");
    long since;

    try {
        since = Long.parseLong(sinceStr);
    } catch (NumberFormatException e) {
        ctx.status(400).json(Map.of("error", "since 参数格式错误"));
        return;
    }

    long now = System.currentTimeMillis();

    try (Connection conn = Database.getConnection();
         PreparedStatement ps = conn.prepareStatement(
             "SELECT server_id, amount, note, date, created_at, updated_at, deleted_at FROM transactions WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC"
         )) {

        ps.setInt(1, userId);
        ps.setLong(2, since);
        ResultSet rs = ps.executeQuery();

        List<Map<String, Object>> transactions = new ArrayList<>();
        while (rs.next()) {
            Map<String, Object> txn = new LinkedHashMap<>();
            txn.put("serverId", rs.getString("server_id"));
            txn.put("amount", rs.getDouble("amount"));
            txn.put("note", rs.getString("note"));
            txn.put("date", rs.getString("date"));
            txn.put("createdAt", rs.getLong("created_at"));
            txn.put("updatedAt", rs.getLong("updated_at"));
            long deletedAt = rs.getLong("deleted_at");
            txn.put("deletedAt", rs.wasNull() ? null : deletedAt);
            transactions.add(txn);
        }

        ctx.json(Map.of("data", Map.of(
            "transactions", transactions,
            "serverTime", now
        )));

    } catch (SQLException e) {
        ctx.status(500).json(Map.of("error", "服务器错误"));
    }
}
```

---

### 7.5 邮件服务（EmailService.java）

使用 Resend HTTP API 发送邮件。Resend API 非常简洁，直接 POST JSON 即可。

```java
public class EmailService {

    private static final HttpClient client = HttpClient.newHttpClient();
    private static final ObjectMapper mapper = new ObjectMapper();

    public static void sendVerificationCode(String toEmail, String code) throws Exception {
        Map<String, Object> payload = Map.of(
            "from", Config.RESEND_FROM,
            "to", toEmail,
            "subject", "您的验证码是 " + code,
            "html", String.format("""
                <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
                    <h2>您的验证码</h2>
                    <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                              background: #f5f5f5; padding: 16px; border-radius: 8px;
                              text-align: center;">%s</p>
                    <p>有效期 5 分钟，请勿泄露给他人。</p>
                    <p style="color: #999; font-size: 14px;">如非本人操作，请忽略此邮件。</p>
                </div>
            """, code)
        );

        String json = mapper.writeValueAsString(payload);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(Config.RESEND_API_URL))
            .header("Authorization", "Bearer " + Config.RESEND_API_KEY)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json))
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("Resend API error: " + response.body());
        }
    }
}
```

---

## 八、启动和部署

### 8.1 本地开发启动

```bash
# 设置环境变量
export JWT_SECRET="your-development-secret-key-at-least-32-chars"
export RESEND_API_KEY="re_xxxxxxxxxxxx"
export RESEND_FROM="noreply@yourdomain.com"

# 运行
mvn exec:java -Dexec.mainClass="com.lucky.App"
```

### 8.2 生产部署

建议部署到云服务器：

1. 打包 JAR：`mvn package`
2. 上传 JAR 到服务器
3. 使用 systemd 管理进程
4. 用 Nginx 反向代理 + HTTPS

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 九、安全注意事项

1. **JWT_SECRET** 必须足够长（至少 256 bit），通过环境变量注入，不能硬编码
2. **RESEND_API_KEY** 通过环境变量注入，不能提交到代码仓库
3. **SQL 注入防护**：所有 SQL 使用 PreparedStatement 参数化，不要拼接字符串
4. **数据隔离**：所有 transactions 查询必须带 `user_id` 条件
5. **频率限制**：验证码发送 60 秒内只能一次，防止邮件轰炸
6. **HTTPS**：生产环境必须使用 HTTPS，否则 JWT 在传输中可能被窃取
7. **CORS**：开发环境可以放宽，生产环境应限制为 App 域名
8. **SQLite 并发**：SQLite 写操作是串行的，使用 WAL 模式可以改善并发读
