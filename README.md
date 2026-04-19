<p align="center">
  <img src="docs/assets/logo.svg" width="120" alt="HX-HouTiKu Logo" />
</p>

<h1 align="center">HX-HouTiKu</h1>

<p align="center">
  <strong>🔐 端到端加密的统一消息推送聚合平台</strong>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="./docs/DEPLOYMENT.md">部署教程</a> •
  <a href="./docs/SDK.md">SDK 手册</a> •
  <a href="./docs/ANDROID.md">Android App</a> •
  <a href="./docs/SECURITY.md">安全模型</a> •
  <a href="./docs/CONTRIBUTING.md">参与贡献</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" />
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-orange.svg" />
</p>

---

## 这是什么

AI 定时任务、CI/CD、监控告警、工作流通知……消息来源越来越多，散落在各个平台，平铺无优先级。

**HX-HouTiKu** 把它们统一到一个 App：

- 🔀 **统一聚合** — 一次 SDK 调用，所有来源汇聚到同一个入口
- 🏷️ **优先级 + 分组** — urgent / high / default / low / debug 五级 + 自定义分组
- 🔐 **端到端加密** — ECIES 混合加密，服务端只存密文，私钥永远不离开你的设备
- 📱 **多端接收** — PWA (iOS/Android/桌面浏览器) + Android 原生 App
- 🆓 **零成本** — 运行在 Cloudflare 免费套餐上，完全自托管

## 架构

```
 推送来源 (Python SDK / Shell / GitHub Actions / cURL)
         │  ECIES 加密
         ▼
 ┌─── Cloudflare ─────────────────────┐
 │  Worker (API)  ←→  D1 (数据库)     │
 │  Pages  (PWA 静态站)               │
 └────────────────────────────────────┘
         │  Web Push / FCM
         ▼
 ┌─── 用户设备 ──────────────────────┐
 │  PWA / Android App → 解密 → 渲染  │
 │  系统通知: 状态栏 + 锁屏 + 震动   │
 └───────────────────────────────────┘
```

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Cloudflare Workers + Hono |
| 数据库 | Cloudflare D1 (SQLite) |
| 前端 | React 19 + Vite + Tailwind v4 |
| 加密 | ECIES (secp256k1 + AES-256-GCM) |
| 推送 SDK | Python (eciespy + httpx) |
| Android 原生推送 | Firebase Cloud Messaging (FCM) |

---

## 快速开始

> 完整步骤见 [部署教程](./docs/DEPLOYMENT.md)，这里是极简版。

### 1. 部署后端

```bash
cd worker && pnpm install
npx wrangler d1 create hx-houtiku        # 创建数据库，记下 database_id
cp wrangler.example.toml wrangler.toml    # 填入 database_id
npx wrangler d1 execute hx-houtiku --remote --file=schema.sql
npx web-push generate-vapid-keys          # 生成 VAPID 密钥对
npx wrangler secret put ADMIN_TOKEN       # 设置管理员令牌
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler deploy                       # 部署!
```

### 2. 部署前端

```bash
cd frontend && pnpm install
echo 'VITE_API_BASE=https://hx-houtiku-api.你的子域名.workers.dev' > .env.production
pnpm build
npx wrangler pages deploy dist --project-name hx-houtiku
```

### 3. 发送第一条消息

```bash
uv add hx-houtiku  # 或 pip install hx-houtiku
```

```python
from hx_houtiku import push

push("Hello World", "第一条加密推送 🎉", priority="high", group="test")
```

环境变量：

```bash
export HX_HOUTIKU_ENDPOINT="https://hx-houtiku-api.你的子域名.workers.dev"
export HX_HOUTIKU_TOKEN="你的ADMIN_TOKEN"
```

---

## 文档目录

| 文档 | 内容 |
|------|------|
| [部署教程](./docs/DEPLOYMENT.md) | 从零部署全套系统 (Worker + D1 + Pages + CI/CD) |
| [Android App](./docs/ANDROID.md) | 原生 APK 构建、Firebase/FCM 配置、系统通知 |
| [SDK 手册](./docs/SDK.md) | Python SDK / CLI / Shell / cURL 用法 |
| [安全模型](./docs/SECURITY.md) | ECIES 加密方案、威胁分析、私钥保护 |
| [参与贡献](./docs/CONTRIBUTING.md) | 开发环境搭建、代码规范、PR 流程 |

## 项目结构

```
HX-HouTiKu/
├── worker/           # Cloudflare Worker (API 后端)
├── frontend/         # React PWA + Capacitor (前端客户端)
├── sdk/              # Python 推送 SDK
├── scripts/          # Shell 工具脚本
├── docs/             # 文档
└── examples/         # 使用示例
```

## 本地开发

```bash
# 后端
cd worker && pnpm install && pnpm dev

# 前端
cd frontend && pnpm install && pnpm dev

# Python SDK
cd sdk && uv sync && uv run pytest
```

## 协议

[MIT](./LICENSE) © HX-HouTiKu Contributors
