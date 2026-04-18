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

# Configure via environment variables
# HX_HOUTIKU_ENDPOINT, HX_HOUTIKU_TOKEN, HX_HOUTIKU_RECIPIENTS
push("Task Done", "Crawled 1200 items in 3m22s", priority="low", group="crawler")
```

## CLI Usage

```bash
hx-houtiku "Deploy Complete" -b "v2.1.0 deployed" -p high -g ci-cd
```

## Configuration

### Environment Variables

```bash
export HX_HOUTIKU_ENDPOINT="https://your-worker.workers.dev"
export HX_HOUTIKU_TOKEN="your-api-token"
export HX_HOUTIKU_RECIPIENTS='[{"name":"alice","public_key":"04a1b2..."}]'
```

### Config File

```yaml
# ~/.hx-houtiku.yaml
endpoint: https://your-worker.workers.dev
api_token: your-api-token
recipients:
  - name: alice
    public_key: "04a1b2c3d4e5f6..."
defaults:
  priority: default
  group: general
```

```python
from hx_houtiku import HxHoutikuClient
client = HxHoutikuClient.from_config("~/.hx-houtiku.yaml")
client.send("Hello", "World", priority="high")
```
