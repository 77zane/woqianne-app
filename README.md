# 我钱呢（woqianne-app）

“我钱呢”是一个基于 UniApp 和 Vue 3 开发的轻量记账应用。项目采用本地优先的数据体验，并支持邮箱验证码登录和云端同步。

## 主要功能

- 快速记录收入和支出
- 使用标签归类账目
- 查看按月汇总的收支统计
- 本地保存数据，无需登录即可使用
- 邮箱验证码登录
- 登录后在多设备间同步账目
- 通过软删除和时间戳处理增量同步

## 技术栈

- UniApp 3
- Vue 3
- Vite 5
- JavaScript

## 本地开发

环境要求：Node.js 和 npm。

```bash
npm install
npm run dev:h5
```

H5 开发环境会将 `/api` 请求代理到 `http://localhost:8080`。需要登录和同步功能时，请同时启动后端服务。

## 构建

构建 H5 版本：

```bash
npm run build:h5
```

项目还提供多个小程序和 App 平台脚本，完整命令可查看 [`package.json`](./package.json)。

## 项目结构

```text
src/
├── pages/       # 页面
├── static/      # 静态资源
├── utils/       # API、认证、本地存储和同步逻辑
├── App.vue      # 应用入口组件
├── main.js      # JavaScript 入口
├── manifest.json
└── pages.json
```

## 相关文档

- [`DEVELOPMENT.md`](./DEVELOPMENT.md)：开发与打包说明
- [`docs/frontend.md`](./docs/frontend.md)：前端设计说明
- [`docs/backend.md`](./docs/backend.md)：后端设计说明
- [`docs/api.md`](./docs/api.md)：接口说明
- [woqianne-app-backend](https://github.com/77zane/woqianne-app-backend)：配套后端服务

## 安全说明

请勿在仓库中提交签名密码、邮箱服务凭证、JWT 密钥或其他生产环境秘密。发布前应使用安全的环境变量或密钥管理服务，并妥善保管应用签名文件。
