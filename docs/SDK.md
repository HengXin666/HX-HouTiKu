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
- [内容类型说明](#内容类型说明)
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

# 只需设置 HX_HOUTIKU_ENDPOINT 和 HX_HOUTIKU_TOKEN
# 接收者列表会自动从 Worker API 获取，无需手动配置
push("任务完成", "已处理 1200 条记录", priority="low", group="crawler")
```

`push()` 函数会自动:
1. 从环境变量读取配置
2. 从 Worker API 自动获取接收者公钥列表
3. 用 ECIES 加密消息内容
4. 通过 HTTPS 发送到你的 Worker 后端
5. 触发 WebSocket 实时推送 + Web Push/FCM 离线通知

### 客户端 API

如果需要更多控制, 使用 `HxHoutikuClient` 类:

```python
from hx_houtiku import HxHoutikuClient

# ============= 三种创建方式 =============

# 方式一: 从环境变量创建（推荐）
client = HxHoutikuClient.from_env()

# 方式二: 从配置文件创建
client = HxHoutikuClient.from_config("~/.hx-houtiku.yaml")

# 方式三: 手动指定参数
client = HxHoutikuClient(
    endpoint="https://houtiku.api.woa.qzz.io",
    api_token="sk-hx-houtiku-xxx",
    # recipients 可选，省略则自动从 API 获取
    recipients=[
        {"name": "alice", "public_key": "04a1b2c3d4e5f6..."},
    ],
)

# ============= 发送消息 =============

result = client.send(
    "数据库告警",                    # 标题(必填)
    "CPU 95.2%, 内存 78.1%",        # 正文(支持 Markdown)
    priority="urgent",              # 优先级: urgent | high | default | low | debug
    content_type="markdown",        # 内容类型: text | markdown | html | json
    group="alerts",                 # 分组名(自定义)
    channel_id="monitoring",        # 频道 ID(默认 "default")
    group_key="server-01",          # 分组键, 用于关联相关消息
    recipients=["alice"],           # 发给谁(None = 全部接收者)
    tags=["production", "db"],      # 标签(可选)
)

print(result)
# {"status": "ok", "id": "...", "pushed_to": ["alice"], "ws_sent": ["alice"], "push_sent": ["alice"]}

# ============= 批量发送 =============

results = client.send_batch(
    [
        {"title": "第一条", "body": "内容 1", "priority": "low"},
        {"title": "第二条", "body": "内容 2", "group": "batch"},
    ],
    channel_id="notifications",
)

# ============= 接收者管理 =============

# 手动刷新接收者（添加新设备后调用）
client.fetch_recipients()

# 强制下次发送时重新拉取
client.invalidate_cache()

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
| `body` | `str` | — | `""` | 消息正文 |
| `priority` | `str` | — | `"default"` | 优先级, 见[优先级说明](#优先级说明) |
| `content_type` | `str` | — | `"markdown"` | 内容类型, 见[内容类型说明](#内容类型说明) |
| `group` | `str` | — | `"general"` | 分组名, 用于前端归类显示 |
| `channel_id` | `str` | — | `"default"` | 频道 ID, 用于频道过滤 |
| `group_key` | `str` | — | `""` | 分组键, 关联同一来源的消息(如 CI 构建号) |
| `recipients` | `list[str]` | — | `None` | 接收者名称列表, `None` = 发给所有人 |
| `tags` | `list[str]` | — | `[]` | 可选标签 |

#### 构造函数参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `endpoint` | `str` | — | Worker API 地址(必填) |
| `api_token` | `str` | — | Bearer Token(必填) |
| `recipients` | `list` | `None` | 接收者列表, 省略则自动从 API 获取 |
| `timeout` | `float` | `30.0` | HTTP 请求超时(秒) |
| `auto_fetch_recipients` | `bool` | `True` | 是否自动从 API 获取接收者 |
| `cache_ttl` | `float` | `3600.0` | 接收者缓存过期时间(秒) |
| `max_retries` | `int` | `3` | 请求失败重试次数(指数退避) |

> SDK 内置重试机制: 遇到 502/503/504/429 状态码或连接/超时错误时自动重试, 指数退避(1s, 2s, 4s), 支持 `Retry-After` 响应头。

### 配置方式

SDK 支持三种配置来源, 按优先级从高到低:

#### 1. 手动传参(最高优先级)

```python
client = HxHoutikuClient(
    endpoint="https://...",
    api_token="sk-...",
    recipients=[...],  # 可选
)
```

#### 2. 环境变量

```bash
# 必填
export HX_HOUTIKU_ENDPOINT="https://houtiku.api.woa.qzz.io"
export HX_HOUTIKU_TOKEN="sk-hx-houtiku-xxx"

# 可选: 接收者列表(JSON 数组格式)
# 省略则 SDK 自动调用 GET /api/recipients 获取
export HX_HOUTIKU_RECIPIENTS='[{"name":"alice","public_key":"04a1b2c3..."}]'
```

Windows PowerShell:

```powershell
$env:HX_HOUTIKU_ENDPOINT = "https://houtiku.api.woa.qzz.io"
$env:HX_HOUTIKU_TOKEN = "sk-hx-houtiku-xxx"
```

> 💡 **推荐做法**: 只设置 `ENDPOINT` 和 `TOKEN`, 不设置 `RECIPIENTS`。SDK 会自动从 Worker API 获取已注册设备的公钥列表。新增/删除设备后 SDK 自动同步, 无需改配置。

#### 3. YAML/JSON 配置文件

```yaml
# ~/.hx-houtiku.yaml
endpoint: https://houtiku.api.woa.qzz.io
api_token: sk-hx-houtiku-xxx
# recipients 可选, 不写则自动从 Worker API 拉取
recipients:
  - name: alice
    public_key: "04a1b2c3d4e5f6..."
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

# 指定内容类型
hx-houtiku "日志输出" -b "$(cat /tmp/output.log)" -t text -p low

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
| `--content-type` | `-t` | 内容类型: text/markdown/html/json |
| `--group` | `-g` | 分组名 |
| `--recipients` | `-r` | 接收者(空格分隔多个) |
| `--config` | `-c` | 配置文件路径 |

---

## Shell 脚本

适用于没有 Python 环境或想在纯 Bash 脚本中使用的场景。

> ⚠️ Shell 脚本仍然需要 Python3 来执行 ECIES 加密(以及 `eciespy` 库), 但不需要安装完整的 SDK。

### 配置

```bash
export HX_HOUTIKU_ENDPOINT="https://houtiku.api.woa.qzz.io"
export HX_HOUTIKU_TOKEN="sk-hx-houtiku-xxx"
export HX_HOUTIKU_PUBKEY="04a1b2c3d4e5f6..."   # 接收者公钥(hex 格式)
export HX_HOUTIKU_NAME="alice"                   # 接收者名称
```

> ⚠️ Shell 脚本使用单独的环境变量(`PUBKEY` + `NAME`), 仅支持单个接收者。多接收者场景请使用 Python SDK。

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
curl -X POST https://houtiku.api.woa.qzz.io/api/push \
  -H "Authorization: Bearer sk-hx-houtiku-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "自定义消息ID(UUID格式)",
    "recipients": ["alice"],
    "encrypted_payloads": {
      "alice": "base64编码的ECIES密文"
    },
    "priority": "default",
    "content_type": "markdown",
    "group": "general",
    "channel_id": "default",
    "group_key": "",
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

> 💡 不需要配置 `PUSH_RECIPIENTS` — SDK 会自动从 Worker API 获取。

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
import traceback
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

| 级别 | 图标 | 推送行为 | 适用场景 |
|------|------|---------|----------|
| `urgent` | 🔴 | WS 实时 + Web Push 持续震动 + FCM 高优先 | 系统宕机、安全事件、数据丢失 |
| `high` | 🟠 | WS 实时 + Web Push 普通震动 + FCM | 部署失败、阈值超标、告警 |
| `default` | 🔵 | WS 实时 + Web Push 静默通知 + FCM | 日报、任务完成、常规通知 |
| `low` | 🟢 | WS 实时, 不触发推送通知 | 爬虫结果、后台任务、信息记录 |
| `debug` | ⚪ | WS 实时, 不触发推送通知 | 开发日志、调试信息 |

> `low` 和 `debug` 级别的消息不会触发 Web Push/FCM, 但会通过 WebSocket 实时送达在线设备。

---

## 内容类型说明

| 类型 | 说明 | 前端渲染方式 |
|------|------|-------------|
| `text` | 纯文本 | 等宽字体, 自动识别链接 |
| `markdown` | Markdown(默认) | markdown-it 渲染 |
| `html` | HTML | DOMPurify 净化后渲染 |
| `json` | JSON 数据 | 树视图 / 表格 / 代码(可切换) |

```python
push("告警", "CPU **95%**", content_type="markdown")
push("日志", raw_output, content_type="text")
push("报表", html_content, content_type="html")
push("数据", json.dumps(data), content_type="json")
```

---

## API 接口参考

后端 Worker 提供以下 API:

### `GET /` — 健康检查

```bash
curl https://houtiku.api.woa.qzz.io/
# {"name":"hx-houtiku-api","version":"1.0.0","status":"ok"}
```

### `GET /api/config` — 获取公共配置

无需认证。返回 VAPID 公钥等信息。

```bash
curl https://houtiku.api.woa.qzz.io/api/config
# {"vapid_public_key":"BD...","version":"1.0.0","encryption_curve":"secp256k1"}
```

### `POST /api/push` — 推送加密消息

需要 `Authorization: Bearer <ADMIN_TOKEN 或 API Token>`。

**请求体**:

```json
{
  "id": "uuid(可选, 不传则自动生成)",
  "encrypted_payloads": {"any_key": "base64密文"},
  "priority": "default",
  "content_type": "markdown",
  "group": "general",
  "channel_id": "default",
  "group_key": "",
  "timestamp": 1714000000000
}
```

> `encrypted_payloads` 只需提供一个 key-value 对。服务端取第一个值作为消息密文，存一份全局消息，然后通知所有活跃设备。所有设备共享同一把密钥（通过「设备克隆」同步），因此都能解密。

**响应 201**:

```json
{
  "status": "ok",
  "id": "uuid",
  "pushed_to": ["alice", "bob"],
  "ws_sent": ["alice"],
  "push_sent": ["bob"]
}
```

消息投递流程: 存入 D1 → 通过 Durable Object WebSocket 实时推送 → Web Push/FCM 离线通知。

### `GET /api/messages` — 获取消息列表

需要 `Authorization: Bearer <recipient_token>`。

查询参数:

| 参数 | 说明 |
|------|------|
| `since` | 时间戳(毫秒), 只返回此时间之后的消息 |
| `limit` | 返回条数(最大 200, 默认 50) |
| `group` | 按分组过滤 |
| `priority` | 按优先级过滤 |
| `channel_id` | 按频道过滤 |

**响应**:

```json
{
  "messages": [{"id": "...", "encrypted_data": "...", "priority": "default", "content_type": "markdown", "group": "...", "channel_id": "default", "group_key": "", "timestamp": 1714000000000, "is_read": false}],
  "total_unread": 5,
  "has_more": false
}
```

### `POST /api/messages/read` — 标记已读

需要 `Authorization: Bearer <recipient_token>`。

```json
{"message_ids": ["id1", "id2"]}
```

### `POST /api/recipients` — 注册接收者

需要 `Authorization: Bearer <ADMIN_TOKEN>`。

```json
{"name": "alice", "public_key": "04...", "groups": ["alerts", "daily"]}
```

**响应 201**: `{"id": "uuid", "recipient_token": "rt_uuid", "name": "alice"}`

### `GET /api/recipients` — 列出所有接收者

需要 `Authorization: Bearer <ADMIN_TOKEN 或 API Token>`。

**响应**: `{"recipients": [{"id": "...", "name": "alice", "public_key": "04...", "is_active": true, ...}]}`

> SDK 在发送消息前会自动调用此接口获取公钥列表。

### `DELETE /api/recipients/:id` — 删除接收者

需要 `Authorization: Bearer <ADMIN_TOKEN>`。级联删除该接收者的订阅和消息。

### `POST /api/subscribe` — 注册推送订阅

需要 `Authorization: Bearer <recipient_token>`。

```json
{"endpoint": "https://fcm.googleapis.com/...", "keys": {"p256dh": "...", "auth": "..."}, "device_type": "web"}
```

### `DELETE /api/subscribe` — 取消推送订阅

需要 `Authorization: Bearer <recipient_token>`。

### `GET /api/ws` — WebSocket 实时连接

通过 query 参数认证:

```
wss://houtiku.api.woa.qzz.io/api/ws?token=rt_xxx
```

连接后服务端推送:
- `{"type": "connected", "device_count": 2}` — 连接成功
- `{"type": "new_message", "message": {...}}` — 新消息(加密的)
- `{"type": "pong"}` — 心跳回复

客户端发送:
- `{"type": "ping"}` — 心跳(建议 25s 间隔)

> WebSocket 是消息投递的第一优先级通道。PWA 前端会自动建立并维护 WS 连接, 实时接收消息。

### `POST /api/test-push` — 测试推送

需要 `Authorization: Bearer <ADMIN_TOKEN>`。**服务端自动加密**, 无需客户端处理。

```json
{"title": "测试", "body": "Hello!", "priority": "default", "group": "test"}
```

### `POST /api/test-push/self` — 自测推送

需要 `Authorization: Bearer <recipient_token>`。无需请求体, 发送固定测试消息给自己。

### 频道管理

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST /api/channels` | Body: `{name, display_name, description?, icon?, color?}` | ADMIN_TOKEN | 创建频道 |
| `GET /api/channels` | — | recipient_token | 列出所有频道 |
| `DELETE /api/channels/:id` | — | ADMIN_TOKEN | 删除频道(消息回落到 default) |

### `GET /api/image-proxy` — 图片反代

无需认证。用于绕过哔哩哔哩/微博/知乎/微信等站点的 Referer 防盗链。

```
GET /api/image-proxy?url=https://i0.hdslb.com/xxx.jpg
```

### 设备克隆

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST /api/clone/offer` | Body: `{encrypted_bundle}` | recipient_token | 旧设备上传加密密钥包, 返回 8 位配对码 (5 分钟有效) |
| `POST /api/clone/claim` | Body: `{code}` | 无 | 新设备用配对码下载密钥包 (单次有效) |

---

## 消息存储模型

消息采用**全局共享**模型:

- SDK 推送时, 只需用任一 recipient 的公钥加密**一份**密文
- 服务端存储一条全局消息记录, 不按 recipient 隔离
- 所有设备通过「设备克隆」共享同一把 ECIES 密钥对, 因此都能解密
- 新设备克隆后自动拥有完整历史消息

仍然使用 **ECIES secp256k1 非对称加密**, 私钥永远不离开设备。
