<p align="center">
  <img src="docs/assets/logo.svg" width="120" alt="HX-HouTiKu Logo" />
</p>

<h1 align="center">HX-HouTiKu</h1>

<p align="center">
  <strong>🔐 端到端加密的统一消息推送聚合平台</strong>
</p>

<p align="center">
  <a href="#痛点">痛点</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#架构总览">架构</a> •
  <a href="#从零开始部署">部署教程</a> •
  <a href="#发送第一条消息">发消息</a> •
  <a href="#sdk-使用">SDK</a> •
  <a href="./docs/SECURITY.md">安全模型</a> •
  <a href="./docs/CONTRIBUTING.md">参与贡献</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" />
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-orange.svg" />
  <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" />
</p>

---

## 痛点

AI 定时任务、CI/CD 流水线、监控告警、工作流通知……消息来源越来越多, 散落在各个平台。它们平铺、无优先级、混杂在一起——你甚至不会再看第二眼。

**HX-HouTiKu** 解决这个问题: 

- 🔀 **统一聚合** — 一次 SDK 调用, 所有来源的消息汇聚到同一个 App
- 🏷️ **优先级 + 分组** — urgent / high / default / low / debug 五级优先级 + 自定义分组
- 🔐 **端到端加密** — ECIES 混合加密, 服务端只存密文, 私钥永远不离开你的设备
- 📱 **PWA** — 安装到手机主屏幕, 地铁上、排队时随手浏览
- 🆓 **零成本** — 部署在 Cloudflare 免费套餐上, 完全自托管

## 功能特性

| 特性 | 说明 |
|------|------|
| **端到端加密** | ECIES (ECDH + AES-256-GCM), 代码开源也不怕泄密 |
| **多来源推送** | Python SDK / Shell / cURL / GitHub Actions, 任何工作流都能接入 |
| **智能通知** | 按优先级区分策略: 紧急震动 / 普通静默 / 调试不推 |
| **离线可用** | Service Worker 离线缓存, 断网也能查看历史消息 |
| **自适应布局** | 移动端底部导航 + 桌面端侧边栏 |
| **深色模式** | 跟随系统或手动切换, OLED 友好 |
| **零成本** | Workers 10万请求/天 + D1 500MB + Pages 无限带宽, 全部免费 |

## 架构总览

```
┌──────────────┐  ┌──────────┐  ┌──────────┐
│  AI 定时任务  │  │ CI/CD    │  │ Cron Job │
│  (Python)    │  │ (GitHub) │  │ (Shell)  │
└──────┬───────┘  └────┬─────┘  └────┬─────┘
       └───────────────┼─────────────┘
                       ▼
              ┌────────────────┐
              │  unified-push  │  SDK(ECIES 加密)
              │  Python/Shell  │
              └───────┬────────┘
                      │ HTTPS POST(密文)
                      ▼
         ┌─── Cloudflare ───────────────────┐
         │  Worker(API 后端) ←→ D1(数据库)   │
         │  Pages(PWA 前端静态站)            │
         └──────────────────────────────────┘
                      │ Web Push 通知信号
                      ▼
         ┌─── 用户设备 ────────────────────┐
         │  Service Worker → 系统通知      │
         │  PWA → 解密 → 渲染              │
         │  IndexedDB(加密的私钥)          │
         └────────────────────────────────┘
```

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| **后端** | Cloudflare Workers + Hono | 边缘计算, 全球 300+ 节点, 冷启动 < 5ms |
| **数据库** | Cloudflare D1 (SQLite) | 免费 500MB, 读 5M/天, 写 100K/天 |
| **前端** | React 19 + Vite + Tailwind v4 | PWA, 可安装到主屏幕 |
| **加密** | ECIES (secp256k1 + AES-256-GCM) | 每条消息独立临时密钥 |
| **推送SDK** | Python (eciespy + httpx) | pip install 一行搞定 |

---

## 从零开始部署

> 整套系统部署在 **Cloudflare 免费套餐**上, 不需要信用卡, 不需要服务器。
> 预计耗时 **15~20 分钟**。

### 前置要求

| 工具 | 版本 | 安装方式 |
|------|------|----------|
| Node.js | 20+ | https://nodejs.org/ |
| pnpm | 9+ | `npm install -g pnpm` |
| Cloudflare 账号 | 免费 | https://dash.cloudflare.com/sign-up |

### 第一步: 注册 Cloudflare 账号

1. 打开 https://dash.cloudflare.com/sign-up
2. 邮箱注册, 验证邮箱
3. 免费套餐即可, 不需要绑定域名, 不需要信用卡

### 第二步: 安装 Wrangler(Cloudflare CLI 工具)

```bash
# 全局安装 wrangler
pnpm add -g wrangler

# 登录你的 Cloudflare 账号(会打开浏览器授权)
npx wrangler login
```

> 登录后终端会显示 `Successfully logged in`。

### 第三步: 部署后端(Worker + D1 数据库)

```bash
# 1. 进入 worker 目录
cd worker
pnpm install

# 2. 创建 D1 数据库
npx wrangler d1 create unified-push
```

执行后终端会输出类似: 

```
✅ Successfully created DB 'unified-push'

[[d1_databases]]
binding = "DB"
database_name = "unified-push"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← 复制这个 ID! 
```

**⚠️ 记下这个 `database_id`, 下一步要用。**

```bash
# 3. 创建配置文件
cp wrangler.example.toml wrangler.toml
```

然后编辑 `wrangler.toml`, 把 `database_id` 替换为你刚才得到的值: 

```toml
name = "unified-push-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[triggers]
crons = ["0 2 * * *"]          # 每天凌晨 2 点自动清理过期消息

[[d1_databases]]
binding = "DB"
database_name = "unified-push"
database_id = "你的-database-id"  # ← 替换这里! 

[vars]
ENCRYPTION_CURVE = "secp256k1"
```

```bash
# 4. 初始化数据库表
npx wrangler d1 execute unified-push --file=schema.sql

# 5. 生成 Web Push 用的 VAPID 密钥对
npx web-push generate-vapid-keys
```

执行后会输出: 

```
=======================================
Public Key:  BDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
=======================================
```

**⚠️ 把这两个 Key 记下来! **

```bash
# 6. 设置密钥(每个命令会提示你输入值)
npx wrangler secret put ADMIN_TOKEN
# 输入一个强密码, 比如: sk-unified-push-2024-xxxxxxxx
# 这是你的管理员令牌, SDK 推送消息时要用

npx wrangler secret put VAPID_PUBLIC_KEY
# 粘贴上面生成的 Public Key

npx wrangler secret put VAPID_PRIVATE_KEY
# 粘贴上面生成的 Private Key
```

```bash
# 7. 部署! 
npx wrangler deploy
```

部署成功后会输出: 

```
Published unified-push-api (x.xx sec)
  https://unified-push-api.你的子域名.workers.dev
```

**🎉 后端已上线! ** 访问这个 URL 应该能看到: 
```json
{"name": "unified-push-api", "version": "1.0.0", "status": "ok"}
```

### 第四步: 部署前端(PWA)

```bash
# 1. 进入前端目录
cd ../frontend
pnpm install

# 2. 配置 API 地址
#    创建 .env.production 文件, 写入你的后端地址
echo 'VITE_API_BASE=https://unified-push-api.你的子域名.workers.dev' > .env.production

# 3. 构建
pnpm build

# 4. 部署到 Cloudflare Pages
npx wrangler pages deploy dist --project-name unified-push
```

首次部署会提示创建项目, 选 `Create a new project` 即可。

部署成功后输出: 

```
✨ Deployment complete! https://unified-push.你的pages域名.pages.dev
```

**🎉 前端已上线! ** 手机浏览器打开这个 URL, 按提示"添加到主屏幕"即可安装。

### 第五步: 首次设置(在 PWA 中)

1. 用手机/电脑浏览器打开前端 URL
2. 按照"设置向导"一步步操作: 
   - **设置主密码**: 用于加密你的私钥, 至少 12 个字符
   - **生成密钥对**: 自动生成 ECIES 密钥对
   - **复制公钥**: 这个公钥要配置到推送 SDK 中
   - **注册接收者**: 输入你的用户名, 把公钥注册到后端
3. 启用 Web Push 通知(可选, 浏览器会弹出授权请求)

**⚠️ 妥善保管你的主密码! ** 密钥由密码保护, 忘记密码 = 无法解密历史消息。

---

## 发送第一条消息

### 方式一: Python SDK(推荐)

```bash
# 安装 SDK
pip install unified-push
# 或者用 uv
uv add unified-push
```

```python
from unified_push import push

# 一行搞定
push(
    "Hello World",
    "这是你的第一条加密推送消息! 🎉",
    priority="high",
    group="test"
)
```

运行前需要设置环境变量: 

```bash
# Linux/macOS
export UNIFIED_PUSH_ENDPOINT="https://unified-push-api.你的子域名.workers.dev"
export UNIFIED_PUSH_TOKEN="你设置的ADMIN_TOKEN"
export UNIFIED_PUSH_RECIPIENTS='[{"name":"你的用户名","public_key":"04a1b2c3...你的公钥"}]'

# Windows PowerShell
$env:UNIFIED_PUSH_ENDPOINT = "https://unified-push-api.你的子域名.workers.dev"
$env:UNIFIED_PUSH_TOKEN = "你设置的ADMIN_TOKEN"
$env:UNIFIED_PUSH_RECIPIENTS = '[{"name":"你的用户名","public_key":"04a1b2c3...你的公钥"}]'
```

### 方式二: Shell 脚本

```bash
export UNIFIED_PUSH_ENDPOINT="https://unified-push-api.你的子域名.workers.dev"
export UNIFIED_PUSH_TOKEN="你的ADMIN_TOKEN"
export UNIFIED_PUSH_PUBKEY="04a1b2c3...你的公钥(hex格式)"
export UNIFIED_PUSH_NAME="你的用户名"

./scripts/unified-push.sh \
  --title "备份完成" \
  --body "每日备份耗时 3m22s" \
  --priority low \
  --group backup
```

### 方式三: cURL(任何环境)

```bash
# 注意: cURL 方式需要你自行加密消息体
# 推荐使用 Python SDK 或 Shell 脚本, 它们会自动处理 ECIES 加密
curl -X POST https://unified-push-api.你的子域名.workers.dev/api/push \
  -H "Authorization: Bearer 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["你的用户名"],
    "encrypted_payloads": {"你的用户名": "base64编码的密文"},
    "priority": "default",
    "group": "general"
  }'
```

---

## SDK 使用

### Python SDK 完整用法

```python
from unified_push import UnifiedPushClient

# 方式一: 环境变量(最简单)
client = UnifiedPushClient.from_env()

# 方式二: 配置文件
client = UnifiedPushClient.from_config("~/.unified-push.yaml")

# 方式三: 手动指定
client = UnifiedPushClient(
    endpoint="https://unified-push-api.xxx.workers.dev",
    api_token="sk-xxx",
    recipients=[
        {"name": "alice", "public_key": "04a1b2c3..."},
        {"name": "bob", "public_key": "04d4e5f6..."},
    ],
)

# 发送消息
result = client.send(
    "数据库告警",
    "CPU 使用率 95.2%, 内存 78.1%",
    priority="urgent",       # urgent | high | default | low | debug
    group="alerts",          # 自定义分组名
    recipients=["alice"],    # 指定接收人(None = 全部)
    tags=["production", "database"],
)
print(result)
# {"status": "ok", "id": "...", "pushed_to": ["alice"], "web_push_sent": ["alice"]}

# 用完关闭
client.close()

# 或者用 with 语句自动管理
with UnifiedPushClient.from_env() as client:
    client.send("Hello", "World")
```

### 配置文件格式

```yaml
# ~/.unified-push.yaml
endpoint: https://unified-push-api.xxx.workers.dev
api_token: sk-xxx
recipients:
  - name: alice
    public_key: "04a1b2c3d4e5f6..."
  - name: bob
    public_key: "04d4e5f6a7b8c9..."
defaults:
  priority: default
  group: general
```

### CLI 命令行

```bash
# 基本用法
unified-push "部署完成" -b "v2.1.0 已部署到生产环境" -p high -g ci-cd

# 指定配置文件
unified-push "告警" -b "CPU 过高" -p urgent -g alerts -c ~/.unified-push.yaml

# 发送给指定接收人
unified-push "测试" -b "测试消息" -r alice bob
```

### 优先级说明

| 级别 | 图标 | Web Push 行为 | 适用场景 |
|------|------|--------------|----------|
| `urgent` | 🔴 | 持续震动, 不自动消失 | 系统宕机、安全事件 |
| `high` | 🟠 | 普通震动 | 部署失败、阈值超标 |
| `default` | 🔵 | 静默通知 | 日报、任务完成 |
| `low` | 🟢 | 不推送 | 爬虫结果、后台任务 |
| `debug` | ⚪ | 不推送 | 开发日志、调试信息 |

---

## 实际场景示例

### GitHub Actions 部署通知

```yaml
# .github/workflows/deploy.yml
- name: 推送部署通知
  env:
    UNIFIED_PUSH_ENDPOINT: ${{ secrets.PUSH_ENDPOINT }}
    UNIFIED_PUSH_TOKEN: ${{ secrets.PUSH_TOKEN }}
    UNIFIED_PUSH_RECIPIENTS: ${{ secrets.PUSH_RECIPIENTS }}
  run: |
    pip install unified-push
    python -c "
    from unified_push import push
    push('部署完成 ✅', '提交 ${{ github.sha }} 已部署到生产环境', priority='default', group='ci-cd')
    "
```

### 定时任务 Cron 通知

```bash
# crontab -e
0 8 * * * UNIFIED_PUSH_ENDPOINT=https://... UNIFIED_PUSH_TOKEN=sk-... \
  /usr/local/bin/unified-push "日报" -b "$(python3 generate_report.py)" -g daily
```

### Python 脚本异常告警

```python
import sys
from unified_push import push

try:
    result = do_something_important()
    push("任务完成 ✅", f"结果: {result}", priority="low", group="tasks")
except Exception as e:
    push("任务失败 ❌", f"错误: {e}", priority="urgent", group="alerts")
    sys.exit(1)
```

---

## 项目结构

```
HX-HouTiKu/
├── worker/              # Cloudflare Worker(API 后端)
│   ├── src/
│   │   ├── index.ts         # 入口(Hono 路由)
│   │   ├── auth.ts          # 认证中间件
│   │   ├── cron.ts          # 定时清理任务
│   │   ├── types.ts         # TypeScript 类型
│   │   └── routes/          # API 路由
│   │       ├── push.ts          # POST /api/push — 推送消息
│   │       ├── messages.ts      # GET/POST /api/messages — 查询/标记已读
│   │       ├── recipients.ts    # POST /api/recipients — 注册接收者
│   │       ├── subscribe.ts     # POST /api/subscribe — Web Push 订阅
│   │       └── config.ts        # GET /api/config — 公开配置
│   ├── schema.sql           # D1 数据库 Schema
│   └── wrangler.example.toml # Wrangler 配置模板
├── frontend/            # React PWA(前端客户端)
│   ├── src/
│   │   ├── lib/             # 核心库(加密、API、数据库)
│   │   ├── stores/          # Zustand 状态管理
│   │   ├── pages/           # 页面组件
│   │   ├── components/      # 可复用 UI 组件
│   │   └── hooks/           # 自定义 React Hooks
│   └── vite.config.ts
├── sdk/python/          # Python 推送 SDK
│   ├── unified_push/
│   │   ├── client.py        # 推送客户端
│   │   ├── crypto.py        # ECIES 加密
│   │   ├── config.py        # 配置加载
│   │   ├── models.py        # 数据模型
│   │   └── cli.py           # 命令行入口
│   └── pyproject.toml
├── scripts/             # Shell 工具脚本
│   └── unified-push.sh     # Bash 推送脚本
└── docs/                # 文档
    ├── DEPLOYMENT.md        # 详细部署教程
    ├── SDK.md               # SDK 参考手册
    ├── SECURITY.md          # 安全模型
    └── CONTRIBUTING.md      # 贡献指南
```

## Cloudflare 免费套餐限额

| 服务 | 免费额度 | 个人使用够吗?  |
|------|----------|----------------|
| Workers | 10万 请求/天 | ✅ 每天推100条 + 读100次 = 绰绰有余 |
| D1 | 500MB 存储, 500万 读/天, 10万 写/天 | ✅ 约 50万条消息(每条 ~1KB) |
| Pages | 无限带宽, 500次 构建/月 | ✅ 完全够用 |
| Web Push | 无额外费用(标准协议) | ✅ 免费 |

## 本地开发

```bash
# 后端
cd worker && pnpm install && pnpm dev

# 前端(新开终端)
cd frontend && pnpm install && pnpm dev

# Python SDK
cd sdk/python && uv sync && uv run pytest
```

## GitHub Actions 自动部署（CI/CD）

项目内置了 3 条 GitHub Actions 流水线，push 到 `main` 分支时**自动构建 + 部署**：

| 流水线 | 文件 | 触发条件 | 功能 |
|--------|------|----------|------|
| 🚀 部署后端 | `.github/workflows/deploy-worker.yml` | `worker/` 目录变更 | 类型检查 → 部署 Worker |
| 🌐 部署前端 | `.github/workflows/deploy-frontend.yml` | `frontend/` 目录变更 | 类型检查 → 构建 PWA → 部署到 Pages |
| 🔍 CI 检查 | `.github/workflows/ci.yml` | 所有 push / PR | 后端+前端+SDK 代码质量检查 |

### 配置步骤（5 分钟）

#### 1. 获取 Cloudflare API Token

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 点击 **Create Token**
3. 选择 **Edit Cloudflare Workers** 模板
4. 权限确认包含：
   - `Account → Cloudflare Pages → Edit`
   - `Account → Workers Scripts → Edit`
   - `Account → D1 → Edit`
5. 点击 **Continue to summary → Create Token**
6. **复制生成的 Token**（只显示一次！）

#### 2. 获取 Account ID

打开 Cloudflare Dashboard 任意页面，URL 中 `https://dash.cloudflare.com/<这就是你的AccountID>` 就是你的 Account ID。

或者运行：

```bash
npx wrangler whoami
```

#### 3. 配置 GitHub Secrets

打开 GitHub 仓库 → **Settings → Secrets and variables → Actions**：

| 类型 | 名称 | 值 |
|------|------|-----|
| **Secret** | `CLOUDFLARE_API_TOKEN` | 第 1 步拿到的 API Token |
| **Secret** | `CLOUDFLARE_ACCOUNT_ID` | 第 2 步拿到的 Account ID |
| **Variable** | `VITE_API_BASE` | 后端 Worker URL，如 `https://unified-push-api.xxx.workers.dev` |

> ⚠️ `VITE_API_BASE` 是 **Variable**（明文），不是 Secret，因为它会编译进前端代码。
> 在 **Settings → Secrets and variables → Actions → Variables** 页签中添加。

#### 4. 验证

配置完成后，随便修改一个文件 push 到 main，观察 GitHub → **Actions** 页签：

- ✅ 绿色 = 部署成功
- ❌ 红色 = 点进去看日志排查

### 流水线功能说明

**Web 端 + 手机端 = 同一次构建**：本项目是 PWA（渐进式 Web 应用），前端构建一次就同时生成：
- 🖥️ **Web 端**：浏览器直接访问 Pages URL
- 📱 **手机端**：手机浏览器打开 → "添加到主屏幕" → 全屏运行，等同原生 App

部署后全球 300+ CDN 节点加速，自带 HTTPS 证书。

## 手动更新部署

如果不使用 GitHub Actions，也可以手动部署：

```bash
# 更新后端
cd worker && npx wrangler deploy

# 更新前端
cd frontend && pnpm build && npx wrangler pages deploy dist --project-name unified-push
```

## 协议

[MIT](./LICENSE) © HX-HouTiKu Contributors
