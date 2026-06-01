# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

「我钱哪」— 一个基于 uni-app (Vue 3) 的个人记账应用，支持支出/收入记录、标签管理、月度统计。V2 已加入远程同步功能（邮箱验证码登录、增量同步、多设备合并）。

开发文档位于 `docs/` 目录：
- `docs/api.md` — 后端接口文档
- `docs/frontend.md` — 前端开发文档
- `docs/backend.md` — 后端开发文档（Java + Javalin + SQLite）

## 常用命令

```bash
# H5 开发模式
npm run dev:h5

# 微信小程序开发模式
npm run dev:mp-weixin

# H5 生产构建
npm run build:h5

# 微信小程序生产构建
npm run build:mp-weixin
```

uni-app 的平台通过 `-p` 参数指定，所有可用平台见 `package.json` 的 scripts 部分。

## 架构

- **框架**: uni-app 3.x + Vue 3 (Options API)
- **构建**: Vite 5.2，通过 `@dcloudio/vite-plugin-uni` 插件驱动
- **数据层**: `src/utils/storage.js` — 本地存储封装，V2 加入 serverId/createdAt/updatedAt/deletedAt 字段和软删除
- **认证**: `src/utils/auth.js` — JWT token 管理、登录态判断、退出登录
- **API 调用**: `src/utils/api.js` — 封装 sendCode/login/upload/download 四个接口，Base URL 为配置常量
- **同步逻辑**: `src/utils/sync.js` — syncUpload (逐条上传)、syncDownload (增量下载)、mergeOnFirstLogin (首次合并)、doFullSync (双向同步)
- **页面路由**: `src/pages.json` 定义路由，已开启 `enablePullDownRefresh`
- **全局样式**: `src/App.vue` 的 `<style>` 定义 CSS 变量（配色、间距、毛玻璃效果等），`src/uni.scss` 定义 uni-app 主题 SCSS 变量
- **平台条件编译**: 日期选择器使用了 `#ifdef APP-PLUS` / `#ifdef H5` 条件编译，修改跨平台逻辑时注意保持两个分支的同步

## 设计语言

UI 采用薄荷绿 + 米色配色方案，毛玻璃（Liquid Glass）风格。关键 CSS 变量定义在 `App.vue` 的 `:root` 中：
- `--expense` / `--income`: 支出/收入颜色
- `--glass-bg` / `--card-bg`: 毛玻璃背景
- `--accent`: 主强调色（薄荷绿 `#73C7A8`）

## V2 交互流程

- **极致极简**：未登录状态下界面和 V1 完全一致，零侵入
- **登录入口**：下拉页面 → 未登录弹出登录弹窗 → 邮箱验证码登录（登录即注册）
- **同步入口**：下拉页面 → 已登录执行双向同步 → toast 提示结果
- **账户管理**：月份选择器底部显示邮箱+退出按钮（仅登录后可见）
- **自动同步**：保存/编辑/删除操作后自动触发 syncUpload，异步不阻塞
- **冲突策略**：Last-write-wins，updatedAt 大的覆盖小的

## 注意事项

- `src/manifest.json` 中的 `appid` 为 `__UNI__FC3C77D`，修改时需与 DCloud 开发者中心同步
- 交易金额存储约定：支出为负数，收入为正数；用户输入无符号数字时默认为支出（代码在 `saveTransaction` 中处理）
- API Base URL 在 `src/utils/api.js` 中配置，部署时需替换为实际域名
- 软删除的记录本地保留（带 deletedAt 时间戳），`getTransactions()` 自动过滤，`getAllTransactions()` 返回全部（供同步模块）