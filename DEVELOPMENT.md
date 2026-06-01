# 我钱呢 — 开发操作手册

> 最后更新：2026-05-31  
> 版本：V2.0.0 (versionCode: 101)

---

## 一、项目概览

| 项目 | 值 |
|------|-----|
| APP 名称 | **我钱呢** |
| 英文名 | Where's My Money |
| 一句话 | 打开就问，我钱呢？ |
| appid | `__UNI__FC3C77D` |
| 包名 | `com.wqd.lucky` |
| 技术栈 | UniApp (Vue 3) + 后端 Java + Javalin + SQLite |
| 后端 API | `https://api.biubiudiudiu.cn` |
| 目录 | `C:\Users\Administrator\Desktop\77home\lucky-app\` |

---

## 二、证书信息

### Android 签名证书

| 项目 | 值 |
|------|-----|
| 文件路径 | `lucky-app/lucky.keystore` |
| 别名 (alias) | `lucky` |
| 私钥密码 | `lucky123456` |
| 证书密码 | `lucky123456` |
| 加密算法 | RSA 2048, SHA256withRSA |
| 有效期 | 100 年 (36500 天) |
| 生成命令 | `keytool -genkey -alias lucky -keyalg RSA -keysize 2048 -keystore lucky.keystore -validity 36500` |

> ⚠️ **绝对不能丢失 `lucky.keystore` 文件。** 丢失后所有后续版本无法覆盖安装。
> ⚠️ **绝对不能忘记密码。** 建议将证书文件备份到云盘。

---

## 三、如何打包 APK

### 前置条件

1. 安装 HBuilderX
2. 打开项目 `lucky-app`

### 打包步骤

1. **HBuilderX → 顶部菜单 → 发行 → 原生App-云打包**
2. 弹窗中：
   - Android 包名：`com.wqd.lucky`
   - 选择 **「使用自有证书」**
   - 浏览选择 `lucky.keystore`
   - 别名填 `lucky`
   - 私钥密码和证书密码都填 `lucky123456`
3. 点击「打包」，等待 3-5 分钟
4. 下载 APK，发给朋友安装

### 版本号规则

- `versionCode`：整数，必须每次递增（当前 101 → 下一个 102）
- `versionName`：对外显示的版本号（如 2.0.0 → 2.1.0）
- 修改位置：`src/manifest.json`

---

## 四、项目结构

```
lucky-app/
├── src/
│   ├── pages/
│   │   └── index/
│   │       └── index.vue      ← 唯一页面，V2 含登录/同步逻辑
│   ├── utils/
│   │   ├── storage.js         ← 数据持久化层（V2 支持软删除）
│   │   ├── auth.js            ← V2：JWT 认证管理
│   │   ├── api.js             ← V2：后端 API 请求封装
│   │   └── sync.js            ← V2：同步逻辑（上传/下载/合并）
│   ├── App.vue                ← 全局样式 / CSS 变量
│   ├── main.js                ← 入口
│   ├── pages.json             ← 页面配置（已开启下拉刷新）
│   └── manifest.json          ← APP 配置（名称/版本/权限/图标）
├── lucky.keystore             ← Android 签名证书
├── icon.png                   ← APP 图标 (1024px)
├── index.html                 ← H5 入口
├── package.json
├── vite.config.js
├── CLAUDE.md                  ← Claude Code 项目指引
└── DEVELOPMENT.md             ← 本文件（开发/部署手册）
```

---

## 五、数据层说明

### 存储方式

`src/utils/storage.js` 封装了全部数据操作，底层使用 `uni.setStorageSync`。

### 存储的 Key

| Key | 内容 | 格式 |
|-----|------|------|
| `lucky_transactions` | 全部交易记录 | JSON 数组 |
| `lucky_tags` | 标签列表 | JSON 数组 |
| `lucky_tag_usage` | 标签使用次数 | JSON 对象 `{标签: 次数}` |
| `lucky_next_id` | 自增 ID | 整数 |

### 对外接口

```javascript
import * as storage from '../../utils/storage.js'

// 交易记录
storage.getTransactions()                        // 获取全部
storage.addTransaction({ id, amount, note, date }) // 新增
storage.updateTransaction(id, { amount, note, date }) // 更新
storage.deleteTransaction(id)                    // 删除

// 标签
storage.getTags()        // 获取全部
storage.addTag('午餐')   // 添加（自动去重）
storage.removeTag('午餐') // 删除，返回新列表

// 标签使用次数
storage.getTagUsageCount()         // 获取计数
storage.incrementTagUsage('午餐')  // 次数 +1
rebuildTagUsage(transactions)      // 从交易记录重建

// ID
storage.getNextId()   // 自增 ID
```

### V2 新增存储 Key

| Key | 内容 | 格式 |
|-----|------|------|
| `lucky_token` | JWT 令牌 | 字符串 |
| `lucky_user_email` | 登录邮箱 | 字符串 |
| `lucky_last_sync_time` | 上次同步时间戳 | 数字（毫秒） |

### V2 API 配置

生产环境 API 地址在 `src/utils/api.js` 中配置：

```js
const BASE_URL = 'https://api.biubiudiudiu.cn'   // 生产
// const BASE_URL = 'http://localhost:8080'        // 本地开发
```

---

## 六、页面核心逻辑

### 6.1 整体布局

```
┌──────────────────────────────┐
│          顶部概览              │  ← 月份 + 支出/收入/结余
├──────────────────────────────┤
│          流水列表              │  ← 按天分组，可滚动
│                              │
├──────────────────────────────┤
│          底部输入栏            │  ← 固定，毛玻璃效果
└──────────────────────────────┘
```

### 6.2 金额输入规则

| 输入 | 解析结果 | 含义 |
|------|---------|------|
| `18` | -18 | 无符号 → 支出 |
| `-18` | -18 | 明确支出 |
| `+8500` | +8500 | 明确收入 |
| `0` / `""` / 非数字 | 不保存 | — |

输入框类型：`inputmode="decimal"`（弹出数字键盘但允许 +/- 符号）

### 6.3 备注与标签

- 备注选填，placeholder：`"午餐、地铁…"`
- 每次保存新备注 → 自动加入标签列表（去重）
- 标签按使用频率降序排列
- 标签栏默认显示前 5 个，超过后显示「更多」按钮
- 点击「更多」→ 弹出抽屉展示全部标签（带使用次数）
- 点击标签 → 填充到备注输入框
- 长按标签 → 弹出删除确认

### 6.4 新建记账

1. 输入金额 → 输入备注 / 点击标签 → 点击「记一笔」
2. 保存后金额和备注清空，日期保持
3. 自动切换到记录所在月份

### 6.5 编辑记录

1. 点击列表中某条记录 → 进入编辑模式
2. 底部按钮变为：**[取消] [保存]**
3. 下方红色小字：「删除此记录」
4. 点击删除 → 确认弹窗 → 删除后退出编辑

### 6.6 日期选择

- 底部日期按钮：显示「今天」「昨天」或「X月X日」
- 点击 → 直接弹出原生日期选择器（无中转弹窗）
- 可任意选择日期（包括未来日期）
- 保存后日期保持选中，不重置

### 6.7 月份选择

- 顶部显示当前月份（如「2026年5月 ▾」）
- 点击 → 弹窗展示：当前月 + 所有有记录的月份
- 切换月份后日期自动同步
- 切换月份后统计面板收起

### 6.8 统计面板

- 顶部三个标签：**[支出] · [收入] · 结余**
- 结余 = max(0, 收入 - 支出)，点击无效果
- 点击支出/收入 → 展开对应的按备注分组统计
- 再次点击同一个标签 → 收起
- 初始状态：三个标签都不高亮

### 6.9 列表展示

- 按天分组：今天 / 昨天 / X月X日
- 支出：`¥18`（珊瑚色）
- 收入：`+¥8500`（薄荷绿色）
- 无记录时显示空状态
- 当前月无记录但其他月有记录 → 列表留空

### 6.10 长按删除标签

- 标签栏上的标签：长按 → 弹出删除确认
- 标签抽屉面板中的标签：同样支持长按删除
- 删除标签后已有记录的备注不受影响

---

## 七、设计规范 (iOS 26 Liquid Glass)

| 元素 | 颜色 | 色值 |
|------|------|------|
| 页面背景 | 米色 | `#FBF7F0` |
| 主色调 | 薄荷绿 | `#73C7A8` |
| 主色调深 | 深薄荷 | `#5BAF8E` |
| 支出 | 暖珊瑚 | `#E8856D` |
| 收入 | 薄荷绿 | `#73C7A8` |
| 主要文字 | 深灰 | `#2D2D2A` |
| 次要文字 | 中灰 | `#7A7A72` |
| 辅助文字 | 浅米灰 | `#B5B0A6` |
| 卡片背景 | 半透白 | `rgba(255,255,255,0.72)` |
| 毛玻璃 | — | `backdrop-filter: saturate(180%) blur(20px)` |

### 按钮

- 新建「记一笔」：薄荷绿渐变 + 发光阴影
- 保存按钮：薄荷绿渐变
- 取消按钮：米白底 + 边框
- 删除按钮：珊瑚色文字

---

## 八、V2 新增功能

### 8.1 登录

- 邮箱验证码登录，登录即注册
- 后端通过 Resend 发送验证码邮件
- JWT 有效期 10 年（等效永久），退出登录清除本地 token

### 8.2 同步

- 增量同步策略：时间戳 + 软删除 + Last-write-wins
- 上传：每次保存/编辑/删除操作后自动触发
- 下载：下拉手势手动触发
- 首次登录：自动合并两端数据（按 `note + amount + date` 三元组去重）

### 8.3 交互入口

- **下拉**：未登录→弹出登录弹窗，已登录→执行同步
- 同步结果以 toast 形式展示（1.5~2 秒自动消失）
- 月份选择器底部：登录后显示邮箱 + 退出按钮

---

## 九、已知限制

| 限制 | 说明 | 计划 |
|------|------|------|
| 无数据导出 | 未实现 | 后续版本 |
| 无预算功能 | 保持极简 | 后续版本 |
| iOS 不可用 | 需开发者账号 | 待定 |
| 键盘弹出时列表被顶 | iOS Safari 行为 | 待修复 |

---

---

## 九、常用命令

```bash
# H5 开发预览
cd lucky-app && npm run dev:h5

# H5 构建
cd lucky-app && npm run build:h5
```

---

## 十、升级发布检查清单

每次发布新版本前确认：

- [ ] `versionCode` 已递增（`src/manifest.json`）
- [ ] `versionName` 已更新
- [ ] `src/utils/api.js` 中 `BASE_URL` 指向生产地址 `https://api.biubiudiudiu.cn`
- [ ] 使用的是同一个 `lucky.keystore`
- [ ] 证书密码正确
- [ ] 真机测试通过（含登录 + 同步）
- [ ] HBuilderX → 发行 → 原生App-云打包
