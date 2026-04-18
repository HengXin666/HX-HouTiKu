# unified-push — Python SDK

End-to-end encrypted push notification SDK for [HX-HouTiKu](../../README.md).

## Installation

```bash
pip install unified-push
# or with uv
uv add unified-push
```

## Quick Start

```python
from unified_push import push

# Configure via environment variables
# UNIFIED_PUSH_ENDPOINT, UNIFIED_PUSH_TOKEN, UNIFIED_PUSH_RECIPIENTS
push("Task Done", "Crawled 1200 items in 3m22s", priority="low", group="crawler")
```

## CLI Usage

```bash
unified-push "Deploy Complete" -b "v2.1.0 deployed" -p high -g ci-cd
```

## Configuration

### Environment Variables

```bash
export UNIFIED_PUSH_ENDPOINT="https://your-worker.workers.dev"
export UNIFIED_PUSH_TOKEN="your-api-token"
export UNIFIED_PUSH_RECIPIENTS='[{"name":"alice","public_key":"04a1b2..."}]'
```

### Config File

```yaml
# ~/.unified-push.yaml
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
from unified_push import UnifiedPushClient
client = UnifiedPushClient.from_config("~/.unified-push.yaml")
client.send("Hello", "World", priority="high")
```
