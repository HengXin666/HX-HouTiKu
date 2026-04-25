# HX-HouTiKu — Cloudflare Email Worker SDK

将 Cloudflare 免费邮件转发与 HX-HouTiKu 集成: 收到邮件时自动推送通知, 然后继续转发到目标邮箱。

## 工作原理

```
发件人 → Cloudflare Email Routing → Email Worker (hook) → HX-HouTiKu API
                                          ↓
                                    转发到目标邮箱
```

- 使用 Cloudflare Email Routing 的 **Email Worker** 功能 (免费)
- 每封邮件触发一次 Worker 调用, 计入 Workers 免费额度 (10 万/天)
- 使用 `/api/test-push` 接口 (服务端加密), 因为 CF Workers 的 Web Crypto API 不支持 secp256k1 曲线

## 前置条件

- 一个已绑定到 Cloudflare 的域名 (用于 Email Routing)
- 已部署的 HX-HouTiKu Worker 后端 (提供 `/api/test-push` 接口)
- Node.js 18+ 和 pnpm

## 快速开始

### 1. 安装依赖

```bash
cd sdk/cf-email-worker
pnpm install
```

### 2. 配置

```bash
cp wrangler.example.toml wrangler.toml
```

编辑 `wrangler.toml`:

```toml
[vars]
HOUTIKU_API_BASE = "https://houtiku.api.example.com"  # 你的 HX-HouTiKu API 地址
FORWARD_TO = "your-real-email@gmail.com"               # 转发目标邮箱
EMAIL_GROUP = "email"                                   # 消息分组名 (可选, 默认 "email")
EMAIL_PRIORITY = "default"                              # 默认优先级 (可选, 默认 "default")
EMAIL_CHANNEL = "email"                                 # 频道 ID (可选, 默认 "email")
```

设置密钥 (不要写在 wrangler.toml 中):

```bash
npx wrangler secret put HOUTIKU_TOKEN
# → 输入你的 HX-HouTiKu ADMIN_TOKEN
```

### 3. 部署

```bash
npx wrangler deploy
```

### 4. 绑定 Email Routing

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → 你的域名 → **Email Routing**
2. 确保 Email Routing 已启用
3. 进入 **Email Workers** 标签页
4. 点击 **Create** 或选择已部署的 `hx-houtiku-email` Worker
5. 在 **Routing rules** 中添加规则:
   - **Custom address**: 填入你想接收邮件的地址 (如 `notify@yourdomain.com`)
   - **Action**: 选择 **Send to a Worker** → 选择 `hx-houtiku-email`

## 优先级规则配置

通过 `PRIORITY_RULES` 环境变量, 可以根据发件人、主题等自动分类邮件的优先级和分组。

### 配置方式

在 `wrangler.toml` 的 `[vars]` 中添加:

```toml
PRIORITY_RULES = '[{"match":"from:alert@","priority":"urgent","group":"alerts"},{"match":"subject:CI","priority":"high","group":"ci-cd"}]'
```

或通过 Cloudflare Dashboard → Workers → 你的 Worker → Settings → Variables 设置。

### 规则格式

```json
[
  {
    "match": "from:alertmanager@example.com",
    "priority": "urgent",
    "group": "alerts"
  },
  {
    "match": "subject:build failed",
    "priority": "high",
    "group": "ci-cd"
  }
]
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `match` | `string` | ✅ | 匹配模式 |
| `priority` | `string` | ✅ | 命中后的优先级: `urgent` / `high` / `default` / `low` / `debug` |
| `group` | `string` | — | 命中后的分组名, 不填则使用默认 `EMAIL_GROUP` |

### 匹配模式

| 前缀 | 说明 | 示例 |
|------|------|------|
| `from:` | 匹配发件人地址 (包含匹配) | `from:alert@example.com` |
| `subject:` | 匹配邮件主题 (包含匹配) | `subject:build failed` |
| `to:` | 匹配收件人地址 (包含匹配) | `to:ops@` |
| (无前缀) | 默认匹配邮件主题 | `CI passed` |

所有匹配均为**大小写不敏感**的包含匹配。规则按顺序匹配, **命中第一条即停止**。

### 实际场景示例

```json
[
  {"match": "from:alertmanager@", "priority": "urgent", "group": "alerts"},
  {"match": "from:grafana@", "priority": "high", "group": "monitoring"},
  {"match": "subject:build failed", "priority": "high", "group": "ci-cd"},
  {"match": "subject:build succeeded", "priority": "low", "group": "ci-cd"},
  {"match": "from:noreply@github.com", "priority": "default", "group": "github"},
  {"match": "from:notifications@", "priority": "low", "group": "notifications"}
]
```

这样配置后:
- Alertmanager 的告警邮件 → 🔴 紧急, 分组 `alerts`
- Grafana 的监控邮件 → 🟠 重要, 分组 `monitoring`
- CI 构建失败 → 🟠 重要, 分组 `ci-cd`
- CI 构建成功 → 🟢 低优, 分组 `ci-cd`
- GitHub 通知 → 🔵 普通, 分组 `github`
- 其他邮件 → 使用默认优先级和分组

## 环境变量参考

| 变量 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `HOUTIKU_API_BASE` | `string` | ✅ | — | HX-HouTiKu Worker API 地址 |
| `HOUTIKU_TOKEN` | `secret` | ✅ | — | ADMIN_TOKEN (通过 `wrangler secret put` 设置) |
| `FORWARD_TO` | `string` | ✅ | — | 邮件转发目标地址 |
| `EMAIL_GROUP` | `string` | — | `"email"` | 默认消息分组名 |
| `EMAIL_PRIORITY` | `string` | — | `"default"` | 默认消息优先级 |
| `EMAIL_CHANNEL` | `string` | — | `"email"` | 默认频道 ID |
| `PRIORITY_RULES` | `string` | — | — | 优先级规则 JSON 数组 (见上方说明) |

## 推送消息格式

每封邮件推送到 HX-HouTiKu 后, 消息格式为:

- **标题**: `📧 {邮件主题}`
- **正文** (HTML):
  - 头部信息: 发件人 (可点击 mailto 链接)、收件人 (可点击 mailto 链接)、时间
  - 分隔线后为邮件原文 (HTML 邮件原样保留, 纯文本邮件用 `<pre>` 包裹)
- **分组键** (`group_key`): `email-{发件人地址}` (同一发件人的邮件会归为一组)

## CF 免费额度说明

| 资源 | 免费额度 | Email Worker 消耗 |
|------|---------|-------------------|
| Email Routing | 无限转发 | 0 (转发本身免费) |
| Workers 请求 | 10 万/天 | 每封邮件 1 次 |
| Workers CPU | 10ms/请求 | 约 2-5ms/封邮件 |

> 即使每天收 100 封邮件, 也只消耗 0.1% 的免费额度。

## 技术说明

### 为什么使用 `/api/test-push` 而不是 `/api/push`?

HX-HouTiKu 使用 ECIES secp256k1 端到端加密。`/api/push` 接口要求客户端自行加密消息。但 Cloudflare Workers 的 Web Crypto API **不支持 secp256k1 曲线**, 因此无法在 Email Worker 中执行 ECIES 加密。

`/api/test-push` 接口接受明文, 由 HX-HouTiKu 后端负责加密后推送。这意味着消息在 Email Worker → HX-HouTiKu 后端这段链路上是明文传输的 (通过 HTTPS 加密), 但存储和推送到客户端时仍然是 E2E 加密的。

### 邮件转发不受影响

推送通知是通过 `ctx.waitUntil()` 异步执行的, 不会阻塞邮件转发。即使 HX-HouTiKu API 不可用, 邮件仍然会正常转发到目标邮箱。

## 本地开发

```bash
# 启动本地开发服务器 (注意: Email Worker 无法在本地完整测试)
npx wrangler dev

# 查看生产日志
npx wrangler tail
```
