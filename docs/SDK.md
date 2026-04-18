# SDK 参考手册

> 本文档详细介绍 HX-HouTiKu 的所有推送方式: Python SDK、CLI 命令行、Shell 脚本、cURL。

---

## 目录

- [Python SDK](#python-sdk)
  - [安装](#安装)
  - [快速上手](#快速上手)
  - [客户端 API](#客户端-api)
  - [配置方式](#配置方式)
  - [CLI 命令行](#cli-命令行)
- [Shell 脚本](#shell-脚本)
- [cURL 直接调用](#curl-直接调用)
- [实际场景示例](#实际场景示例)
- [优先级说明](#优先级说明)
- [API 接口参考](#api-接口参考)

---

## Python SDK

### 安装

```bash
# 推荐使用 uv
uv add hx-houtiku

# 或者 pip
pip install hx-houtiku
```

要求 Python 3.10+。SDK 依赖: `eciespy`(ECIES 加密)、`httpx`(HTTP 客户端)、`pyyaml`(配置文件解析)。

### 快速上手

最简单的用法——一行代码发送消息: 

```python
from hx_houtiku import push

# 前提: 已设置环境变量 HX_HOUTIKU_ENDPOINT、HX_HOUTIKU_TOKEN、HX_HOUTIKU_RECIPIENTS
push("任务完成", "已处理 1200 条记录", priority="low", group="crawler")
```

`push()` 函数会自动: 
1. 从环境变量读取配置
2. 用 ECIES 加密消息内容
3. 通过 HTTPS 发送到你的 Worker 后端
4. 触发 Web Push 通知

### 客户端 API

如果需要更多控制, 使用 `HxHoutikuClient` 类: 

```python
from hx_houtiku import HxHoutikuClient

# ============= 三种创建方式 =============

# 方式一: 从环境变量创建
client = HxHoutikuClient.from_env()

# 方式二: 从配置文件创建
client = HxHoutikuClient.from_config("~/.hx-houtiku.yaml")

# 方式三: 手动指定参数
client = HxHoutikuClient(
    endpoint="https://hx-houtiku-api.xxx.workers.dev",
    api_token="sk-hx-houtiku-xxx",
    recipients=[
        {"name": "alice", "public_key": "04a1b2c3d4e5f6..."},
        {"name": "bob", "public_key": "04d4e5f6a7b8c9..."},
    ],
)

# ============= 发送消息 =============

result = client.send(
    "数据库告警",                    # 标题(必填)
    "CPU 95.2%, 内存 78.1%",        # 正文(支持 Markdown)
    priority="urgent",              # 优先级: urgent | high | default | low | debug
    group="alerts",                 # 分组名(自定义)
    recipients=["alice"],           # 发给谁(None = 全部接收者)
    tags=["production", "db"],      # 标签(可选)
)

print(result)
# {"status": "ok", "id": "...", "pushed_to": ["alice"], "web_push_sent": ["alice"]}

# ============= 资源管理 =============

# 用完需要关闭(释放 HTTP 连接池)
client.close()

# 推荐用 with 语句自动管理: 
with HxHoutikuClient.from_env() as client:
    client.send("Hello", "World!")
    client.send("再发一条", "没问题")
# 离开 with 块自动 close
```

#### `send()` 方法参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | `str` | ✅ | — | 消息标题 |
| `body` | `str` | — | `""` | 消息正文, 支持 Markdown |
| `priority` | `str` | — | `"default"` | 优先级, 见[优先级说明](#优先级说明) |
| `group` | `str` | — | `"general"` | 分组名, 用于前端归类显示 |
| `recipients` | `list[str]` | — | `None` | 接收者名称列表, `None` = 发给所有人 |
| `tags` | `list[str]` | — | `[]` | 可选标签 |

### 配置方式

SDK 支持三种配置来源, 按优先级从高到低: 

#### 1. 手动传参(最高优先级)

```python
client = HxHoutikuClient(
    endpoint="https://...",
    api_token="sk-...",
    recipients=[...],
)
```

#### 2. 环境变量

```bash
# 必填
export HX_HOUTIKU_ENDPOINT="https://hx-houtiku-api.xxx.workers.dev"
export HX_HOUTIKU_TOKEN="sk-hx-houtiku-xxx"

# 接收者列表(JSON 数组格式)
export HX_HOUTIKU_RECIPIENTS='[{"name":"alice","public_key":"04a1b2c3..."}]'
```

Windows PowerShell: 

```powershell
$env:HX_HOUTIKU_ENDPOINT = "https://hx-houtiku-api.xxx.workers.dev"
$env:HX_HOUTIKU_TOKEN = "sk-hx-houtiku-xxx"
$env:HX_HOUTIKU_RECIPIENTS = '[{"name":"alice","public_key":"04a1b2c3..."}]'
```

如果想持久化, 加到 `$PROFILE` 文件(PowerShell)或 `~/.bashrc`(Linux/macOS)。

#### 3. YAML/JSON 配置文件

```yaml
# ~/.hx-houtiku.yaml
endpoint: https://hx-houtiku-api.xxx.workers.dev
api_token: sk-hx-houtiku-xxx
recipients:
  - name: alice
    public_key: "04a1b2c3d4e5f6..."
  - name: bob
    public_key: "04d4e5f6a7b8c9..."
defaults:
  priority: default    # 默认优先级
  group: general       # 默认分组
```

使用: 

```python
client = HxHoutikuClient.from_config("~/.hx-houtiku.yaml")
# 或 JSON 格式也行
client = HxHoutikuClient.from_config("~/.hx-houtiku.json")
```

> **安全提示**: 配置文件包含 API Token, 确保文件权限为 `600`: 
> ```bash
> chmod 600 ~/.hx-houtiku.yaml
> ```

### CLI 命令行

安装 SDK 后自动获得 `hx-houtiku` 命令: 

```bash
# 基本用法
hx-houtiku "部署完成" -b "v2.1.0 已部署到生产环境" -p high -g ci-cd

# 指定配置文件
hx-houtiku "告警" -b "CPU 过高" -p urgent -g alerts -c ~/.hx-houtiku.yaml

# 发送给指定接收人
hx-houtiku "测试消息" -b "仅发给 alice" -r alice

# 查看帮助
hx-houtiku --help
```

#### CLI 参数

| 参数 | 缩写 | 说明 |
|------|------|------|
| `title` | (位置参数) | 消息标题(必填) |
| `--body` | `-b` | 消息正文 |
| `--priority` | `-p` | 优先级: urgent/high/default/low/debug |
| `--group` | `-g` | 分组名 |
| `--recipients` | `-r` | 接收者(空格分隔多个) |
| `--config` | `-c` | 配置文件路径 |

---

## Shell 脚本

适用于没有 Python 环境或想在纯 Bash 脚本中使用的场景。

> ⚠️ Shell 脚本仍然需要 Python3 来执行 ECIES 加密(以及 `eciespy` 库), 但不需要安装完整的 SDK。

### 配置

```bash
export HX_HOUTIKU_ENDPOINT="https://hx-houtiku-api.xxx.workers.dev"
export HX_HOUTIKU_TOKEN="sk-hx-houtiku-xxx"
export HX_HOUTIKU_PUBKEY="04a1b2c3d4e5f6..."   # 接收者公钥(hex 格式)
export HX_HOUTIKU_NAME="alice"                   # 接收者名称
```

### 使用

```bash
./scripts/hx-houtiku.sh \
  --title "备份完成" \
  --body "每日备份耗时 3m22s" \
  --priority low \
  --group backup
```

#### 脚本参数

| 参数 | 缩写 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--title` | `-t` | ✅ | — | 消息标题 |
| `--body` | `-b` | — | `""` | 消息正文 |
| `--priority` | `-p` | — | `default` | 优先级 |
| `--group` | `-g` | — | `general` | 分组名 |

---

## cURL 直接调用

如果你想自行处理加密, 可以直接调用 API: 

```bash
curl -X POST https://hx-houtiku-api.xxx.workers.dev/api/push \
  -H "Authorization: Bearer sk-hx-houtiku-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "自定义消息ID(UUID格式)",
    "recipients": ["alice"],
    "encrypted_payloads": {
      "alice": "base64编码的ECIES密文"
    },
    "priority": "default",
    "group": "general",
    "timestamp": 1714000000000
  }'
```

> ⚠️ `encrypted_payloads` 中的值必须是 ECIES 加密后 base64 编码的密文。
> 明文格式为 JSON: `{"title": "标题", "body": "正文", "tags": []}`
> 如果你不想自己处理加密, **强烈推荐使用 Python SDK**。

---

## 实际场景示例

### GitHub Actions — 部署成功通知

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... 部署步骤 ...
      - name: 推送通知
        if: success()
        env:
          HX_HOUTIKU_ENDPOINT: ${{ secrets.PUSH_ENDPOINT }}
          HX_HOUTIKU_TOKEN: ${{ secrets.PUSH_TOKEN }}
          HX_HOUTIKU_RECIPIENTS: ${{ secrets.PUSH_RECIPIENTS }}
        run: |
          pip install hx-houtiku
          python -c "
          from hx_houtiku import push
          push('部署完成 ✅', '提交 ${{ github.sha }} 已部署', priority='default', group='ci-cd')
          "
      - name: 部署失败通知
        if: failure()
        env:
          HX_HOUTIKU_ENDPOINT: ${{ secrets.PUSH_ENDPOINT }}
          HX_HOUTIKU_TOKEN: ${{ secrets.PUSH_TOKEN }}
          HX_HOUTIKU_RECIPIENTS: ${{ secrets.PUSH_RECIPIENTS }}
        run: |
          pip install hx-houtiku
          python -c "
          from hx_houtiku import push
          push('部署失败 ❌', '分支 ${{ github.ref }}', priority='urgent', group='ci-cd')
          "
```

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加: 
- `PUSH_ENDPOINT`: 你的 Worker URL
- `PUSH_TOKEN`: 你的 ADMIN_TOKEN
- `PUSH_RECIPIENTS`: JSON 格式的接收者列表

### Cron 定时任务 — 日报通知

```bash
# crontab -e
# 每天早上 8 点发送日报
0 8 * * * HX_HOUTIKU_ENDPOINT="https://..." HX_HOUTIKU_TOKEN="sk-..." \
  /usr/local/bin/hx-houtiku "📊 日报" \
  -b "$(python3 /path/to/generate_report.py)" \
  -p default -g daily
```

### Python 脚本 — 异常自动告警

```python
import sys
from hx_houtiku import push

try:
    result = run_important_task()
    push("任务完成 ✅", f"结果: {result}", priority="low", group="tasks")
except Exception as e:
    push("任务失败 ❌", f"错误: {e}\n\n```\n{traceback.format_exc()}\n```", priority="urgent", group="alerts")
    sys.exit(1)
```

### 监控脚本 — 阈值告警

```python
import psutil
from hx_houtiku import push

cpu = psutil.cpu_percent(interval=5)
mem = psutil.virtual_memory().percent

if cpu > 90 or mem > 85:
    push(
        "⚠️ 服务器资源告警",
        f"CPU: {cpu}%\n内存: {mem}%",
        priority="urgent" if cpu > 95 else "high",
        group="monitoring",
    )
```

---

## 优先级说明

| 级别 | 图标 | Web Push 行为 | 适用场景 |
|------|------|--------------|----------|
| `urgent` | 🔴 | 持续震动, 不自动消失 | 系统宕机、安全事件、数据丢失 |
| `high` | 🟠 | 普通震动通知 | 部署失败、阈值超标、告警 |
| `default` | 🔵 | 静默通知(有通知但不震动) | 日报、任务完成、常规通知 |
| `low` | 🟢 | 不推送通知 | 爬虫结果、后台任务、信息记录 |
| `debug` | ⚪ | 不推送通知 | 开发日志、调试信息 |

> `low` 和 `debug` 级别的消息不会触发 Web Push, 只能在 PWA 中主动查看。

---

## API 接口参考

后端 Worker 提供以下 API: 

### `GET /` — 健康检查

```bash
curl https://hx-houtiku-api.xxx.workers.dev/
# {"name":"hx-houtiku-api","version":"1.0.0","status":"ok"}
```

### `GET /api/config` — 获取公共配置

无需认证。返回 VAPID 公钥等信息。

```bash
curl https://hx-houtiku-api.xxx.workers.dev/api/config
# {"vapid_public_key":"BD...","version":"1.0.0","encryption_curve":"secp256k1"}
```

### `POST /api/push` — 推送消息

需要 `Authorization: Bearer <ADMIN_TOKEN 或 API Token>`。

```json
{
  "id": "uuid",
  "recipients": ["alice"],
  "encrypted_payloads": {"alice": "base64密文"},
  "priority": "default",
  "group": "general",
  "timestamp": 1714000000000
}
```

### `GET /api/messages` — 获取消息列表

需要 `Authorization: Bearer <recipient_token>`。

查询参数: `since`(时间戳)、`limit`(条数)、`group`(分组过滤)、`priority`(优先级过滤)。

### `POST /api/messages/read` — 标记已读

```json
{"message_ids": ["id1", "id2"]}
```

### `POST /api/recipients` — 注册接收者

需要 `Authorization: Bearer <ADMIN_TOKEN>`。

```json
{"name": "alice", "public_key": "04...", "groups": ["alerts", "daily"]}
```

### `POST /api/subscribe` — 注册 Web Push 订阅

需要 `Authorization: Bearer <recipient_token>`。

```json
{"endpoint": "https://fcm.googleapis.com/...", "keys": {"p256dh": "...", "auth": "..."}}
```
