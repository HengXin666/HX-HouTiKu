# 部署指南

> 本文档是 HX-HouTiKu 的完整部署教程。
> 整套系统运行在 **Cloudflare 免费套餐**上, 不需要信用卡, 不需要自己的服务器。

---

## 目录

- [前置要求](#前置要求)
- [Cloudflare 免费额度说明](#cloudflare-免费额度说明)
- [第一步: 注册 Cloudflare](#第一步注册-cloudflare)
- [第二步: 安装命令行工具](#第二步安装命令行工具)
- [第三步: 部署后端(Worker + D1)](#第三步部署后端worker--d1)
- [第四步: 部署前端(Pages PWA)](#第四步部署前端pages-pwa)
- [第五步: 首次设置](#第五步首次设置)
- [第六步: 配置推送来源](#第六步配置推送来源)
- [可选: 绑定自定义域名](#可选绑定自定义域名)
- [可选: GitHub Actions 自动部署（推荐）](#可选github-actions-自动部署推荐)
- [更新与维护](#更新与维护)
- [常见问题](#常见问题)

---

## 前置要求

| 工具 | 版本要求 | 安装方式 |
|------|----------|----------|
| **Node.js** | 20+ | https://nodejs.org/ 下载 LTS 版本 |
| **pnpm** | 9+ | `npm install -g pnpm` |
| **Cloudflare 账号** | 免费套餐 | https://dash.cloudflare.com/sign-up |
| **Python**(可选) | 3.10+ | SDK 需要, 前后端部署不需要 |

验证安装: 

```bash
node --version    # 应显示 v20.x.x 或更高
pnpm --version    # 应显示 9.x.x 或更高
```

---

## Cloudflare 免费额度说明

HX-HouTiKu 用到 Cloudflare 的三个服务, 全部包含在免费套餐中: 

| 服务 | 是什么 | 免费额度 | 够用吗 |
|------|--------|----------|--------|
| **Workers** | 边缘计算函数, 用来跑 API 后端 | 10万 请求/天 | ✅ 每天推100条+读100次 = 绰绰有余 |
| **D1** | SQLite 数据库, 用来存消息 | 500MB 存储, 500万 读/天 | ✅ 约50万条消息 |
| **Pages** | 静态站托管, 用来放前端 PWA | 无限带宽, 500 构建/月 | ✅ 完全够用 |

> 💡 即使是免费套餐, 也包含全球 300+ CDN 节点、HTTPS 证书、DDoS 防护。
> 对个人使用来说, 你可能永远不会触及限额。

---

## 第一步: 注册 Cloudflare

1. 打开 https://dash.cloudflare.com/sign-up
2. 输入邮箱和密码, 完成注册
3. 验证邮箱(点击邮件中的链接)
4. 登录 Dashboard

> **不需要**绑定域名、不需要信用卡。注册完直接跳到第二步。

---

## 第二步: 安装命令行工具

Wrangler 是 Cloudflare 的官方 CLI 工具, 用来管理 Workers、D1、Pages 等服务。

```bash
# 全局安装
pnpm add -g wrangler

# 登录 Cloudflare(会自动打开浏览器)
npx wrangler login
```

浏览器会弹出授权页面, 点击"Allow"即可。终端会显示: 

```
✅ Successfully logged in.
```

> **验证登录状态**: 运行 `npx wrangler whoami`, 能看到你的账号名就说明成功了。

---

## 第三步: 部署后端(Worker + D1)

### 3.1 安装依赖

```bash
cd worker
pnpm install
```

### 3.2 创建 D1 数据库

```bash
npx wrangler d1 create hx-houtiku
```

输出类似: 

```
✅ Successfully created DB 'hx-houtiku' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "hx-houtiku"
database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**⚠️ 把 `database_id` 复制下来, 下面要用! **

### 3.3 编写配置文件

```bash
cp wrangler.example.toml wrangler.toml
```

用编辑器打开 `wrangler.toml`, 替换 `database_id`: 

```toml
# wrangler.toml — Worker 配置文件
# 详细文档: https://developers.cloudflare.com/workers/wrangler/configuration/

name = "hx-houtiku-api"     # Worker 名称, 会出现在 URL 中
main = "src/index.ts"         # 入口文件
compatibility_date = "2024-12-01"

[triggers]
crons = ["0 2 * * *"]         # 定时任务: 每天凌晨2点(UTC)自动清理过期消息

[[d1_databases]]
binding = "DB"                # 代码中通过 env.DB 访问
database_name = "hx-houtiku"
database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"  # ← 替换为你的 ID! 

[vars]
ENCRYPTION_CURVE = "secp256k1"  # 加密曲线, 不要修改

# 以下密钥通过 `wrangler secret put` 设置, 不要写在文件里: 
# ADMIN_TOKEN       — 管理员令牌(SDK 推送消息时用)
# VAPID_PRIVATE_KEY — Web Push 私钥
# VAPID_PUBLIC_KEY  — Web Push 公钥
```

> **⚠️ `wrangler.toml` 已经在 `.gitignore` 中, 不会被提交到 Git。**
> **不要把 secrets 写在这个文件里**, 用 `wrangler secret put` 命令设置。

### 3.4 初始化数据库

```bash
# --remote 表示在线上 D1 执行; 不加 --remote 则只在本地 dev 数据库执行
npx wrangler d1 execute hx-houtiku --remote --file=schema.sql
```

> 💡 **`--remote` vs 本地**: Wrangler 默认操作的是本地 SQLite 副本(用于 `wrangler dev` 本地开发)。
> 部署到生产环境时, **必须加 `--remote`** 才会写入 Cloudflare 线上的 D1 数据库。
> 如果你只是在本地开发调试, 去掉 `--remote` 即可。

这会在 D1 中创建 4 张表: 

| 表名 | 用途 |
|------|------|
| `recipients` | 接收者(存公钥和分组) |
| `messages` | 消息(存密文和元数据) |
| `push_subscriptions` | Web Push 订阅信息 |
| `api_tokens` | API 令牌(存 SHA-256 哈希) |

### 3.5 生成 VAPID 密钥

VAPID(Voluntary Application Server Identification)是 Web Push 协议要求的密钥对, 用于标识你的推送服务器。

```bash
# 安装 web-push 工具(如果没有)
pnpm add -g web-push

# 生成密钥对
npx web-push generate-vapid-keys
```

输出: 

```
=======================================

Public Key:
BDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Private Key:
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

=======================================
```

**⚠️ 把两个 Key 都记下来! **

### 3.6 设置 Secrets

Secrets 是加密存储在 Cloudflare 上的环境变量, 不会出现在代码或日志中。

```bash
# 设置管理员令牌
# 推荐格式: sk-hx-houtiku-随机字符串
# 这个令牌会用在 SDK 配置中
npx wrangler secret put ADMIN_TOKEN
# 提示: Enter a secret value: → 输入你的令牌, 回车

# 设置 VAPID 公钥
npx wrangler secret put VAPID_PUBLIC_KEY
# 粘贴上一步生成的 Public Key

# 设置 VAPID 私钥
npx wrangler secret put VAPID_PRIVATE_KEY
# 粘贴上一步生成的 Private Key

# [可选] 设置 FCM 服务账号 (仅 Android 原生 App 需要)
# 详见 docs/ANDROID.md
npx wrangler secret put FCM_SERVICE_ACCOUNT
# 粘贴 Firebase 服务账号 JSON 的 Base64 编码
```

> **ADMIN_TOKEN 怎么选? **
> - 推荐使用长随机字符串, 如 `sk-hx-houtiku-a1b2c3d4e5f6g7h8`
> - 不要用简单密码
> - 可以用 `openssl rand -hex 32` 生成随机串

### 3.7 部署

```bash
npx wrangler deploy
```

成功输出: 

```
Total Upload: 42.15 KiB / gzip: 12.34 KiB
Published hx-houtiku-api (1.23 sec)
  https://hx-houtiku-api.你的子域名.workers.dev
```

**验证**: 浏览器打开这个 URL, 应该看到: 

```json
{
  "name": "hx-houtiku-api",
  "version": "1.0.0",
  "status": "ok"
}
```

> 🎉 **后端部署完成! ** 把这个 URL 记下来, 下面部署前端要用。

---

## 第四步: 部署前端(Pages PWA)

### 4.1 安装依赖

```bash
cd ../frontend
pnpm install
```

### 4.2 配置 API 地址

创建 `.env.production` 文件, 填入后端地址: 

```bash
# Linux/macOS
echo 'VITE_API_BASE=https://hx-houtiku-api.你的子域名.workers.dev' > .env.production

# Windows PowerShell
"VITE_API_BASE=https://hx-houtiku-api.你的子域名.workers.dev" | Out-File -Encoding utf8 .env.production
```

> 把 `你的子域名` 替换为你的 Cloudflare Workers 子域名。

### 4.3 构建

```bash
pnpm build
```

构建产物在 `dist/` 目录。

### 4.4 部署到 Cloudflare Pages

```bash
npx wrangler pages deploy dist --project-name hx-houtiku
```

首次部署会提示: 

```
No project found. Would you like to create one?
❯ Create a new project
```

选择 `Create a new project`, 然后选择 `dist` 目录。

部署成功: 

```
✨ Deployment complete!
  https://hx-houtiku.你的pages域名.pages.dev
```

**验证**: 浏览器打开这个 URL, 应该能看到锁屏界面或设置向导。

> 🎉 **前端部署完成! ** 在手机浏览器中打开, 可以"添加到主屏幕"。

---

## 第五步: 首次设置

用手机或电脑浏览器打开前端 URL, 按照设置向导操作: 

### 5.1 设置主密码

- 输入一个强密码(至少 12 个字符)
- 这个密码用来加密你的私钥
- **忘记密码 = 无法解密历史消息, 无法恢复! **

### 5.2 生成密钥对

- 向导会自动生成 ECIES 密钥对
- 公钥会显示在界面上(一串很长的 hex 字符串, 以 `04` 开头)
- **复制这个公钥**, 下面配置 SDK 时要用

### 5.3 注册接收者

- 输入你的用户名(比如 `alice`)
- 填入后端地址和管理员令牌
- 点击注册

也可以用 cURL 手动注册: 

```bash
curl -X POST https://hx-houtiku-api.你的子域名.workers.dev/api/recipients \
  -H "Authorization: Bearer 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "alice",
    "public_key": "04a1b2c3d4e5f6...你的完整公钥",
    "groups": ["alerts", "daily", "ci-cd"]
  }'
```

返回: 

```json
{
  "id": "xxxx-xxxx-xxxx",
  "name": "alice",
  "recipient_token": "rt_xxxx-xxxx-xxxx"
}
```

> **`recipient_token`** 是接收者令牌, PWA 用它来拉取消息。

### 5.4 启用 Web Push(可选)

- 在设置中打开"推送通知"
- 浏览器会弹出授权请求, 点击"允许"
- 之后新消息会通过系统通知推送

---

## 第六步: 配置推送来源

现在后端和前端都部署好了, 接下来配置 SDK 来推送消息。

### 环境变量方式(最简单)

```bash
# Linux/macOS — 加到 ~/.bashrc 或 ~/.zshrc
export HX_HOUTIKU_ENDPOINT="https://hx-houtiku-api.你的子域名.workers.dev"
export HX_HOUTIKU_TOKEN="你设置的ADMIN_TOKEN"
# HX_HOUTIKU_RECIPIENTS 不需要配置! SDK 会自动从 Worker API 拉取已注册设备

# Windows PowerShell — 加到 $PROFILE
$env:HX_HOUTIKU_ENDPOINT = "https://hx-houtiku-api.你的子域名.workers.dev"
$env:HX_HOUTIKU_TOKEN = "你设置的ADMIN_TOKEN"
```

> 💡 SDK 会自动调用 `GET /api/recipients` 获取已注册设备的公钥列表。
> 新增/删除设备后, SDK 自动同步, 不需要改任何配置。

### 配置文件方式(可选)

创建 `~/.hx-houtiku.yaml`: 

```yaml
endpoint: https://hx-houtiku-api.你的子域名.workers.dev
api_token: sk-hx-houtiku-你的令牌
# recipients 可选, 不写则自动从 Worker API 拉取
defaults:
  priority: default
  group: general
```

然后使用: 

```python
from hx_houtiku import HxHoutikuClient
client = HxHoutikuClient.from_config("~/.hx-houtiku.yaml")
client.send("测试", "Hello World!")
```

### 发送测试消息

```bash
# 安装 SDK
pip install hx-houtiku

# 发一条测试消息
python -c "
from hx_houtiku import push
push('🎉 部署成功', '恭喜! HX-HouTiKu 已经配置完成。', priority='high', group='test')
"
```

如果一切正常, 你应该在 PWA 中看到这条消息。

---

## 可选: 绑定自定义域名

如果你有自己的域名, 可以绑定更好看的地址: 

### Worker 自定义域名

1. 打开 Cloudflare Dashboard → **Workers & Pages**
2. 点击你的 Worker(`hx-houtiku-api`)
3. 进入 **Settings → Triggers → Custom Domains**
4. 添加域名, 如 `push-api.example.com`

> 前提: 域名的 DNS 要在 Cloudflare 管理。

### Pages 自定义域名

1. 打开 Cloudflare Dashboard → **Workers & Pages**
2. 点击你的 Pages 项目(`hx-houtiku`)
3. 进入 **Custom domains**
4. 添加域名, 如 `push.example.com`

绑定后记得更新前端的 `VITE_API_BASE` 环境变量并重新构建。

---

## 可选: GitHub Actions 自动部署（推荐）

项目已内置 3 条 GitHub Actions 流水线，配置好 Secrets 后，push 到 main 就自动部署。

### 流水线一览

```
.github/workflows/
├── deploy-worker.yml     # 🚀 后端：worker/ 变更时自动部署 Worker
├── deploy-frontend.yml   # 🌐 前端：frontend/ 变更时自动构建 PWA 并部署到 Pages
└── ci.yml                # 🔍 检查：所有 push/PR 运行类型检查 + 构建验证
```

| 流水线 | 触发条件 | 做的事情 |
|--------|----------|----------|
| **部署后端** | push 到 main，`worker/` 有变更 | pnpm install → 类型检查 → wrangler deploy |
| **部署前端** | push 到 main，`frontend/` 有变更 | pnpm install → 类型检查 → pnpm build → pages deploy |
| **CI 检查** | 所有 push + PR | 后端类型检查 + 前端类型检查+构建 + SDK 包构建 |

> **Web 端 + 手机端是同一次构建**：本项目是 PWA，构建产物同时支持：
> - 🖥️ 浏览器直接访问（Web 端）
> - 📱 手机浏览器"添加到主屏幕"后全屏运行（等同原生 App）

### 第 1 步: 获取 Cloudflare API Token

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 点击 **Create Token**
3. 选择 **Edit Cloudflare Workers** 模板
4. 确认权限包含（如果缺少请手动添加）：

   | 权限范围 | 权限 | 级别 |
   |---------|------|------|
   | Account → Cloudflare Workers Scripts | Edit | ✅ 模板自带 |
   | Account → Cloudflare Pages | Edit | ⚠️ 手动添加 |
   | Account → D1 | Edit | ⚠️ 手动添加 |

5. **Account Resources** 选择 `All accounts` 或指定你的账号
6. 点击 **Continue to summary → Create Token**
7. **复制 Token**（⚠️ 只显示一次，关掉就看不到了！）

### 第 2 步: 获取 Account ID

方法一：URL 里找
- 打开 https://dash.cloudflare.com/
- URL 变成 `https://dash.cloudflare.com/abc123def456` 
- `abc123def456` 就是你的 Account ID

方法二：命令行

```bash
npx wrangler whoami
# 输出中的 account_id 就是
```

### 第 3 步: 配置 GitHub Secrets 和 Variables

打开你的 GitHub 仓库页面：

**配置 Secrets**（`Settings → Secrets and variables → Actions → Secrets`）：

| 名称 | 值 | 说明 |
|------|-----|------|
| `CLOUDFLARE_API_TOKEN` | 第 1 步拿到的 Token | 加密存储，日志中不可见 |
| `CLOUDFLARE_ACCOUNT_ID` | 第 2 步拿到的 ID | 加密存储 |
| `GOOGLE_SERVICES_JSON` | Firebase `google-services.json` 的 Base64 | Android 原生推送必需，详见 [Android App](./ANDROID.md) |

**配置 Variables**（同一页面，切换到 `Variables` 页签）：

| 名称 | 值 | 说明 |
|------|-----|------|
| `VITE_API_BASE` | `https://hx-houtiku-api.xxx.workers.dev` | 后端地址，会编译进前端代码 |

> ⚠️ `VITE_API_BASE` 是 Variable（明文），不是 Secret。
> 因为前端是静态站，这个值会被打包进 JS 文件中，放 Secret 里也没用。

### 第 4 步: 验证流水线

```bash
# 随便改点什么，push 到 main
git add .
git commit -m "ci: 启用 GitHub Actions 自动部署"
git push
```

然后打开 GitHub → **Actions** 页签观察：

- ✅ **绿色对勾** = 部署成功
- ❌ **红色叉号** = 点进去看日志，常见原因：
  - `Authentication error` → Token 权限不够或过期
  - `Account not found` → Account ID 填错了
  - `Project not found` → 首次用 Pages 需要先手动 `wrangler pages deploy` 创建项目

### 手动触发部署

如果不想改代码也能触发部署：

1. 打开 GitHub → **Actions**
2. 选择要触发的流水线
3. 点击 **Run workflow** → 选择分支 → 确认

这在"只改了 Secrets 想验证"的场景下很有用。

### 替代方案: Cloudflare Pages 直连 GitHub

如果你更喜欢 Cloudflare 原生的 Git 集成（不用配 Token），也可以：

1. Dashboard → **Workers & Pages** → 创建 → **Pages** → 连接到 Git
2. 选择你的仓库
3. 构建设置：
   - **构建命令**: `cd frontend && pnpm install && pnpm build`
   - **输出目录**: `frontend/dist`
   - **环境变量**: 添加 `VITE_API_BASE=https://...`
4. 每次 push 到 main 自动部署

> 但这种方式只能管前端，后端 Worker 的自动部署还是需要 GitHub Actions。

---

## 更新与维护

### 更新后端

```bash
cd worker
npx wrangler deploy
```

### 更新前端

```bash
cd frontend
pnpm build
npx wrangler pages deploy dist --project-name hx-houtiku
```

### 数据库迁移

如果 `schema.sql` 有更新, 需要手动执行: 

```bash
# 注意: D1 目前不支持自动迁移
# 如果只是加新表/索引, 直接执行新的 SQL
npx wrangler d1 execute hx-houtiku --remote --command="CREATE TABLE IF NOT EXISTS ..."

# 如果涉及修改已有表, 可能需要备份+重建
npx wrangler d1 export hx-houtiku --remote --output=backup.sql

# 示例: 从旧版本升级, 给 messages 表加 content_type 列
npx wrangler d1 execute hx-houtiku --remote --command="ALTER TABLE messages ADD COLUMN content_type TEXT NOT NULL DEFAULT 'markdown'"
```

### 查看日志

```bash
# 实时查看 Worker 日志
npx wrangler tail
```

---

## 常见问题

### Q: 部署 Worker 时提示 "no account id"

运行 `npx wrangler whoami` 确认已登录。如果刚注册的新号, 等几分钟再试。

### Q: D1 数据库创建失败

确保你的 Cloudflare 账号已经激活。新注册的账号可能需要几分钟生效。

### Q: 前端打开白屏

检查 `.env.production` 中的 `VITE_API_BASE` 是否正确。在浏览器开发者工具的 Console 里看有没有报错。

### Q: Web Push 通知不工作

1. 确认浏览器允许了通知权限
2. 确认 VAPID 密钥配置正确
3. iOS Safari 从 16.4 开始支持 Web Push, 但需要先"添加到主屏幕"

### Q: 消息解密失败

确认 SDK 中配置的公钥和 PWA 中显示的公钥一致。公钥以 `04` 开头, 是一个很长的 hex 字符串。

### Q: 如何查看 D1 数据库内容

```bash
# 在线查看(加 --remote 查线上数据; 不加查本地 dev 数据)
npx wrangler d1 execute hx-houtiku --remote --command="SELECT * FROM recipients"
npx wrangler d1 execute hx-houtiku --remote --command="SELECT id, priority, group_name, timestamp FROM messages ORDER BY timestamp DESC LIMIT 10"
```

### Q: 如何重置所有数据

```bash
# ⚠️ 危险操作: 会删除所有数据
npx wrangler d1 execute hx-houtiku --remote --command="DELETE FROM messages"
npx wrangler d1 execute hx-houtiku --remote --command="DELETE FROM push_subscriptions"
npx wrangler d1 execute hx-houtiku --remote --command="DELETE FROM api_tokens"
npx wrangler d1 execute hx-houtiku --remote --command="DELETE FROM recipients"
```
