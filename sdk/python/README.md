# hx-houtiku — Python SDK

End-to-end encrypted push notification SDK for [HX-HouTiKu](../../README.md).

## Installation

```bash
pip install hx-houtiku
# or with uv
uv add hx-houtiku
```

## Quick Start

```python
from hx_houtiku import push

# Only needs ENDPOINT + TOKEN — recipients are auto-fetched from Worker API
push("Task Done", "Crawled 1200 items in 3m22s", priority="low", group="crawler")
```

## CLI Usage

```bash
hx-houtiku "Deploy Complete" -b "v2.1.0 deployed" -p high -g ci-cd

# Specify content type (text / markdown / html / json)
hx-houtiku "Log Output" -b "$(cat /tmp/output.log)" -t text -p low
```

## Configuration

### Environment Variables (minimal)

```bash
export HX_HOUTIKU_ENDPOINT="https://houtiku.api.woa.qzz.io"
export HX_HOUTIKU_TOKEN="your-api-token"
# HX_HOUTIKU_RECIPIENTS is optional — auto-fetched from Worker API if omitted
```

### Config File

```yaml
# ~/.hx-houtiku.yaml
endpoint: https://houtiku.api.woa.qzz.io
api_token: your-api-token
# recipients: optional, auto-fetched if omitted
defaults:
  priority: default
  group: general
```

```python
from hx_houtiku import HxHoutikuClient

client = HxHoutikuClient.from_config("~/.hx-houtiku.yaml")
client.send("Hello", "World", priority="high")
```

## Content Type

Specify how the message body should be rendered:

| Type | Description |
|------|-------------|
| `text` | Plain text, no formatting |
| `markdown` | Markdown (default) |
| `html` | HTML content |
| `json` | Raw JSON data |

```python
push("Alert", "CPU **95%**", content_type="markdown")
push("Log", raw_output, content_type="text")
```

## Auto-fetch Recipients

The SDK automatically fetches registered recipients from the Worker API.
No need to manually maintain public key lists:

```python
client = HxHoutikuClient(
    endpoint="https://houtiku.api.woa.qzz.io",
    api_token="your-token",
    # No recipients needed! Auto-fetched on first send.
)
client.send("Hello", "World")

# Manually refresh after adding new devices:
client.fetch_recipients()
```
