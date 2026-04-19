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
              │  HX-HouTiKu    │  SDK(ECIES 加密)
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
npx wrangler d1 create hx-houtiku
```

执行后终端会输出类似: 

```
✅ Successfully created DB 'hx-houtiku'

[[d1_databases]]
binding = "DB"
database_name = "hx-houtiku"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← 复制这个 ID! 
```

**⚠️ 记下这个 `database_id`, 下一步要用。**

```bash
# 3. 创建配置文件
cp wrangler.example.toml wrangler.toml
```

然后编辑 `wrangler.toml`, 把 `database_id` 替换为你刚才得到的值: 

```toml
name = "hx-houtiku-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[triggers]
crons = ["0 2 * * *"]          # 每天凌晨 2 点自动清理过期消息

[[d1_databases]]
binding = "DB"
database_name = "hx-houtiku"
database_id = "你的-database-id"  # ← 替换这里! 

[vars]
ENCRYPTION_CURVE = "secp256k1"
```

```bash
# 4. 初始化数据库表(⚠️ --remote 表示在线上 D1 执行, 不加则只在本地)
npx wrangler d1 execute hx-houtiku --remote --file=schema.sql

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
# 输入一个强密码, 比如: sk-hx-houtiku-2024-xxxxxxxx
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
Published hx-houtiku-api (x.xx sec)
  https://hx-houtiku-api.你的子域名.workers.dev
```

**🎉 后端已上线! ** 访问这个 URL 应该能看到: 
```json
{"name": "hx-houtiku-api", "version": "1.0.0", "status": "ok"}
```

### 第四步: 部署前端(PWA)

```bash
# 1. 进入前端目录
cd ../frontend
pnpm install

# 2. 配置 API 地址
#    创建 .env.production 文件, 写入你的后端地址
echo 'VITE_API_BASE=https://hx-houtiku-api.你的子域名.workers.dev' > .env.production

# 3. 构建
pnpm build

# 4. 部署到 Cloudflare Pages
npx wrangler pages deploy dist --project-name hx-houtiku
```

首次部署会提示创建项目, 选 `Create a new project` 即可。

部署成功后输出: 

```
✨ Deployment complete! https://hx-houtiku.你的pages域名.pages.dev
```

**🎉 前端已上线! ** 手机浏览器打开这个 URL, 按提示"添加到主屏幕"即可安装。

### 第五步: 首次设置(在 PWA 中)

1. 用手机/电脑浏览器打开前端 URL
2. 按照"设置向导"一步步操作: 
   - **设置主密码**: 用于加密你的私钥, 至少 8 个字符
   - **生成密钥对**: 自动生成 ECIES 密钥对
   - **复制公钥**: 这个公钥要配置到推送 SDK 中
3. 启用 Web Push 通知(可选, 浏览器会弹出授权请求)

**⚠️ 妥善保管你的主密码! ** 密钥由密码保护, 忘记密码 = 无法解密历史消息。

### 第六步: 注册设备(关键步骤! )

App 生成密钥后, 你还需要把设备注册到 Worker 后端, 否则收不到任何消息。

**方式一: 使用注册脚本(推荐)**

```bash
# 1. 设置环境变量
export HX_HOUTIKU_ENDPOINT="https://hx-houtiku-api.你的子域名.workers.dev"
export HX_HOUTIKU_TOKEN="你设置的ADMIN_TOKEN"

# 2. 运行注册脚本(交互式, 按提示输入设备名和公钥)
bash scripts/register-device.sh

# 或者一行命令搞定:
bash scripts/register-device.sh --name "my-phone" --pubkey "04a1b2c3...App显示的公钥"
```

注册成功后, 脚本会输出 **Recipient Token** (格式: `rt_xxxx-xxxx-xxxx`), 你需要:

1. 在 App 的 **设置页** 填入这个 Recipient Token
2. 在推送 SDK 的配置中添加这台设备的**公钥**

**方式二: 手动 cURL**

```bash
curl -X POST https://hx-houtiku-api.你的子域名.workers.dev/api/recipients \
  -H "Authorization: Bearer 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-phone", "public_key": "04a1b2c3...App显示的公钥"}'
```

**查看已注册的设备:**

```bash
bash scripts/list-devices.sh
```

> 💡 **为什么需要这一步?** 这是安全设计——只有你(掌握管理员 Token 的人)才能把设备注册为消息接收者。任何人都可以下载 App, 但没有你的管理员 Token, 就无法注册, 也就收不到任何消息。

---

## 发送第一条消息

### 方式一: Python SDK(推荐)

```bash
# 安装 SDK
pip install hx-houtiku
# 或者用 uv
uv add hx-houtiku
```

```python
from hx_houtiku import push

# 一行搞定(会自动从 Worker 拉取已注册的接收者列表)
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
export HX_HOUTIKU_ENDPOINT="https://hx-houtiku-api.你的子域名.workers.dev"
export HX_HOUTIKU_TOKEN="你设置的ADMIN_TOKEN"
# HX_HOUTIKU_RECIPIENTS 是可选的! 不配置则自动从 Worker API 拉取已注册设备

# Windows PowerShell
$env:HX_HOUTIKU_ENDPOINT = "https://hx-houtiku-api.你的子域名.workers.dev"
$env:HX_HOUTIKU_TOKEN = "你设置的ADMIN_TOKEN"
```

> 💡 **不再需要手动配置 recipients!** SDK 会自动从 Worker 获取已注册设备的公钥。
> 新增设备、删除设备, 都由 Worker 端管理, SDK 自动同步。

### 方式二: Shell 脚本

```bash
export HX_HOUTIKU_ENDPOINT="https://hx-houtiku-api.你的子域名.workers.dev"
export HX_HOUTIKU_TOKEN="你的ADMIN_TOKEN"
export HX_HOUTIKU_PUBKEY="04a1b2c3...你的公钥(hex格式)"
export HX_HOUTIKU_NAME="你的用户名"

./scripts/hx-houtiku.sh \
  --title "备份完成" \
  --body "每日备份耗时 3m22s" \
  --priority low \
  --group backup
```

### 方式三: cURL(任何环境)

```bash
# 注意: cURL 方式需要你自行加密消息体
# 推荐使用 Python SDK 或 Shell 脚本, 它们会自动处理 ECIES 加密
curl -X POST https://hx-houtiku-api.你的子域名.workers.dev/api/push \
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
from hx_houtiku import HxHoutikuClient

# 方式一: 环境变量(最简单, 只需 ENDPOINT + TOKEN)
client = HxHoutikuClient.from_env()

# 方式二: 配置文件
client = HxHoutikuClient.from_config("~/.hx-houtiku.yaml")

# 方式三: 手动指定(recipients 可选, 不传则自动从 Worker API 拉取)
client = HxHoutikuClient(
    endpoint="https://hx-houtiku-api.xxx.workers.dev",
    api_token="sk-xxx",
)

# 发送消息
result = client.send(
    "数据库告警",
    "CPU 使用率 **95.2%**, 内存 78.1%",
    priority="urgent",           # urgent | high | default | low | debug
    content_type="markdown",     # text | markdown | html | json
    group="alerts",              # 自定义分组名
    recipients=["alice"],        # 指定接收人(None = 全部)
    tags=["production", "database"],
)
print(result)
# {"status": "ok", "id": "...", "pushed_to": ["alice"], "web_push_sent": ["alice"]}

# 手动刷新接收者列表(新增设备后)
client.fetch_recipients()

# 用完关闭
client.close()

# 或者用 with 语句自动管理
with HxHoutikuClient.from_env() as client:
    client.send("Hello", "World")
```

### 配置文件格式

```yaml
# ~/.hx-houtiku.yaml
endpoint: https://hx-houtiku-api.xxx.workers.dev
api_token: sk-xxx
# recipients 是可选的! 不写则自动从 Worker API 拉取
# 如果你希望固定列表, 可以写上:
# recipients:
#   - name: alice
#     public_key: "04a1b2c3d4e5f6..."
defaults:
  priority: default
  group: general
```

### 内容类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `text` | 纯文本, 不解析格式 | 日志输出、简单通知 |
| `markdown` | Markdown 格式(**默认**) | 大多数通知、告警 |
| `html` | HTML 格式 | 富文本邮件内容 |
| `json` | JSON 数据, 前端自行渲染 | 结构化数据、表格 |

```python
# 发送 Markdown
push("部署完成", "- ✅ 前端\n- ✅ 后端\n- ❌ SDK", content_type="markdown")

# 发送纯文本日志
push("Cron 输出", raw_log_output, content_type="text", priority="low")

# 发送 JSON 数据
import json
push("监控数据", json.dumps(metrics), content_type="json", group="metrics")
```

### CLI 命令行

```bash
# 基本用法
hx-houtiku "部署完成" -b "v2.1.0 已部署到生产环境" -p high -g ci-cd

# 指定内容类型
hx-houtiku "日志" -b "$(cat /var/log/cron.log)" -t text -p low

# 指定配置文件
hx-houtiku "告警" -b "CPU 过高" -p urgent -g alerts -c ~/.hx-houtiku.yaml

# 发送给指定接收人
hx-houtiku "测试" -b "测试消息" -r alice bob
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
    HX_HOUTIKU_ENDPOINT: ${{ secrets.PUSH_ENDPOINT }}
    HX_HOUTIKU_TOKEN: ${{ secrets.PUSH_TOKEN }}
    HX_HOUTIKU_RECIPIENTS: ${{ secrets.PUSH_RECIPIENTS }}
  run: |
    pip install hx-houtiku
    python -c "
    from hx_houtiku import push
    push('部署完成 ✅', '提交 ${{ github.sha }} 已部署到生产环境', priority='default', group='ci-cd')
    "
```

### 定时任务 Cron 通知

```bash
# crontab -e
0 8 * * * HX_HOUTIKU_ENDPOINT=https://... HX_HOUTIKU_TOKEN=sk-... \
  /usr/local/bin/hx-houtiku "日报" -b "$(python3 generate_report.py)" -g daily
```

### Python 脚本异常告警

```python
import sys
from hx_houtiku import push

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
│   ├── hx_houtiku/
│   │   ├── client.py        # 推送客户端
│   │   ├── crypto.py        # ECIES 加密
│   │   ├── config.py        # 配置加载
│   │   ├── models.py        # 数据模型
│   │   └── cli.py           # 命令行入口
│   └── pyproject.toml
├── scripts/             # Shell 工具脚本
│   ├── hx-houtiku.sh       # Bash 推送脚本
│   ├── register-device.sh  # 设备注册脚本
│   └── list-devices.sh     # 查看已注册设备
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

## GitHub Actions 自动部署(CI/CD)

项目内置了 3 条 GitHub Actions 流水线, push 到 `main` 分支时**自动构建 + 部署**: 

| 流水线 | 文件 | 触发条件 | 功能 |
|--------|------|----------|------|
| 🚀 部署后端 | `.github/workflows/deploy-worker.yml` | `worker/` 目录变更 | 类型检查 → 部署 Worker |
| 🌐 部署前端 | `.github/workflows/deploy-frontend.yml` | `frontend/` 目录变更 | 类型检查 → 构建 PWA → 部署到 Pages |
| 📱 构建 App | `.github/workflows/build-android.yml` | 推送 `v*` 标签 / 手动触发 | 构建签名 APK → 上传到 GitHub Release |
| 🔍 CI 检查 | `.github/workflows/ci.yml` | 所有 push / PR | 后端+前端+SDK 代码质量检查 |
| 🔑 管理接收者 | `.github/workflows/manage-recipients.yml` | **仅手动触发** | 注册新设备 / 列出已注册设备 |
| 📦 发布 SDK | `.github/workflows/publish-sdk.yml` | 推送 `sdk-v*` 标签 / 手动触发 | 构建 Python SDK → 发布到 PyPI |

### 配置步骤(5 分钟)

#### 1. 获取 Cloudflare API Token

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 点击 **Create Token**
3. 选择 **Edit Cloudflare Workers** 模板
4. 权限确认包含: 
   - `Account → Cloudflare Pages → Edit`
   - `Account → Workers Scripts → Edit`
   - `Account → D1 → Edit`
5. 点击 **Continue to summary → Create Token**
6. **复制生成的 Token**(只显示一次! )

#### 2. 获取 Account ID

打开 Cloudflare Dashboard 任意页面, URL 中 `https://dash.cloudflare.com/<这就是你的AccountID>` 就是你的 Account ID。

或者运行: 

```bash
npx wrangler whoami
```

#### 3. 配置 GitHub Secrets

打开 GitHub 仓库 → **Settings → Secrets and variables → Actions**: 

| 类型 | 名称 | 值 |
|------|------|-----|
| **Secret** | `CLOUDFLARE_API_TOKEN` | 第 1 步拿到的 API Token |
| **Secret** | `CLOUDFLARE_ACCOUNT_ID` | 第 2 步拿到的 Account ID |
| **Secret** | `ADMIN_TOKEN` | Worker 管理员 Token (与 `wrangler secret put ADMIN_TOKEN` 同值) |
| **Secret** | `ANDROID_KEYSTORE_BASE64` | 签名密钥库 Base64 (见下方生成方式) |
| **Secret** | `ANDROID_KEYSTORE_PASSWORD` | 密钥库密码 |
| **Secret** | `ANDROID_KEY_ALIAS` | 签名密钥别名 |
| **Secret** | `ANDROID_KEY_PASSWORD` | 签名密钥密码 |
| **Variable** | `VITE_API_BASE` | 后端 Worker URL, 如 `https://hx-houtiku-api.xxx.workers.dev` |

> ⚠️ `VITE_API_BASE` 是 **Variable**(明文), 不是 Secret, 因为它会编译进前端代码。
> 在 **Settings → Secrets and variables → Actions → Variables** 页签中添加。

#### 4. 验证

配置完成后, 随便修改一个文件 push 到 main, 观察 GitHub → **Actions** 页签: 

- ✅ 绿色 = 部署成功
- ❌ 红色 = 点进去看日志排查

### 流水线功能说明

**Web 端 + 手机端 = 同一次构建**: 本项目是 PWA(渐进式 Web 应用), 前端构建一次就同时生成: 
- 🖥️ **Web 端**: 浏览器直接访问 Pages URL
- 📱 **手机端**: 手机浏览器打开 → "添加到主屏幕" → 全屏运行, 等同原生 App

**Android 原生 App**: 除了 PWA, 还可以通过 Capacitor 打包成真正的 Android APK: 
- 🤖 **自动发版**: 推送 `v1.0.0` 格式的 tag → 自动构建签名 APK → 上传到 GitHub Releases
- 📥 **手动触发**: GitHub Actions 页面手动触发, 可选 debug/release 模式
- 📦 **下载安装**: 在 [Releases](../../releases) 页面下载 APK, 手机直接安装

部署后全球 300+ CDN 节点加速, 自带 HTTPS 证书。

### 生成 Android 签名密钥

打包 Release APK 需要签名密钥。**只需生成一次**, 妥善保管: 

```bash
# 1. 生成签名密钥库 (会提示输入密码和信息)
keytool -genkeypair -v \
  -keystore hx-houtiku.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias hx-houtiku \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD

# 2. 转为 Base64 (用于 GitHub Secrets)
base64 -i hx-houtiku.keystore -o keystore-base64.txt

# Windows PowerShell:
# [Convert]::ToBase64String([IO.File]::ReadAllBytes("hx-houtiku.keystore")) > keystore-base64.txt
```

然后把 `keystore-base64.txt` 的内容复制到 GitHub Secret `ANDROID_KEYSTORE_BASE64` 中。

> ⚠️ **密钥库文件 (`hx-houtiku.keystore`) 不要提交到 Git!** 丢失 = 无法更新已安装的 App。

### 发版流程

```bash
# 打 tag 自动触发构建 + 发布到 GitHub Releases
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions 会自动:  构建前端 → Capacitor 同步 → Gradle 编译 → 签名 APK → 创建 Release 页面 → 上传 APK。

## 手动更新部署

如果不使用 GitHub Actions, 也可以手动部署: 

```bash
# 更新后端
cd worker && npx wrangler deploy

# 更新前端
cd frontend && pnpm build && npx wrangler pages deploy dist --project-name hx-houtiku
```

## 发布 Python SDK 到 PyPI

项目内置了 GitHub Actions 自动发布流水线, 推送 tag 即可发包。

### 首次发布配置(一次性)

PyPI 推荐使用 **Trusted Publisher**(基于 OIDC), 不需要手动管理 API Token, 更安全。

#### 1. 注册 PyPI 账号

1. 打开 https://pypi.org/account/register/
2. 注册并验证邮箱
3. **强烈建议**启用两步验证(2FA)

#### 2. 在 PyPI 配置 Trusted Publisher

> 💡 如果是全新的包(从未发布过), 使用 "Pending Publisher" 预注册。

1. 登录 https://pypi.org/
2. 进入 **Account Settings → Publishing → Add a new pending publisher**
3. 填写: 

   | 字段 | 值 |
   |------|-----|
   | PyPI Project Name | `hx-houtiku` |
   | Owner | 你的 GitHub 用户名或组织名 |
   | Repository name | `HX-HouTiKu` |
   | Workflow name | `publish-sdk.yml` |
   | Environment name | `pypi` |

4. 点击 **Add**

#### 3. 在 GitHub 创建 Environment

1. 打开仓库 → **Settings → Environments**
2. 点击 **New environment**, 名称填 `pypi`
3. 可选: 勾选 **Required reviewers** 添加审批人(发布前需要人工确认)
4. 点击 **Save protection rules**

> 如果你还想支持 TestPyPI 测试发布, 重复上述步骤: 
> - 在 https://test.pypi.org/ 配置同名 Trusted Publisher
> - GitHub 上再创建一个 `testpypi` Environment

#### 4. 发版! 

```bash
# 修改版本号
# 编辑 sdk/python/pyproject.toml 中的 version = "1.0.0"

# 提交并打 tag
git add sdk/python/pyproject.toml
git commit -m "release: sdk v1.0.0"
git tag sdk-v1.0.0
git push && git push origin sdk-v1.0.0
```

GitHub Actions 会自动: `uv build` → 上传到 PyPI。

发布成功后, 用户就可以: 

```bash
pip install hx-houtiku
# 或
uv add hx-houtiku
```

#### 手动测试发布(TestPyPI)

在 GitHub Actions 页面手动触发 `📦 发布 Python SDK` 流水线, 会同时发布到 TestPyPI: 

```bash
# 从 TestPyPI 安装测试
pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ hx-houtiku
```

#### 本地手动发布(备用方案)

如果不想用 GitHub Actions, 也可以用 uv 本地发布: 

```bash
cd sdk/python

# 构建
uv build

# 发布到 PyPI (需要 API Token)
# 在 https://pypi.org/manage/account/token/ 创建 Token
uv publish --token pypi-xxxxxxxxxxxx

# 或发布到 TestPyPI
uv publish --publish-url https://test.pypi.org/legacy/ --token pypi-xxxxxxxxxxxx
```

## 协议

[MIT](./LICENSE) © HX-HouTiKu Contributors
