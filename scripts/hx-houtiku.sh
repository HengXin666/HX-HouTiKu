#!/usr/bin/env bash
# ============================================================
#  hx-houtiku.sh — Shell wrapper for sending push notifications
#
#  Usage:
#    ./hx-houtiku.sh --title "Deploy Done" --body "v2.1.0" --priority high --group ci-cd
#
#  Environment variables:
#    HX_HOUTIKU_ENDPOINT  — API base URL
#    HX_HOUTIKU_TOKEN     — API bearer token
#    HX_HOUTIKU_PUBKEY    — Recipient public key (hex)
#    HX_HOUTIKU_NAME      — Recipient name
# ============================================================

set -euo pipefail

# Defaults
TITLE=""
BODY=""
PRIORITY="default"
GROUP="general"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title|-t)  TITLE="$2";    shift 2 ;;
    --body|-b)   BODY="$2";     shift 2 ;;
    --priority|-p) PRIORITY="$2"; shift 2 ;;
    --group|-g)  GROUP="$2";    shift 2 ;;
    --help|-h)
      echo "Usage: $0 --title TITLE [--body BODY] [--priority urgent|high|default|low|debug] [--group GROUP]"
      echo ""
      echo "Environment variables:"
      echo "  HX_HOUTIKU_ENDPOINT  API base URL"
      echo "  HX_HOUTIKU_TOKEN     API bearer token"
      echo "  HX_HOUTIKU_PUBKEY    Recipient public key (hex)"
      echo "  HX_HOUTIKU_NAME      Recipient name"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate
if [[ -z "$TITLE" ]]; then
  echo "❌ Error: --title is required" >&2
  exit 1
fi

: "${HX_HOUTIKU_ENDPOINT:?Set HX_HOUTIKU_ENDPOINT}"
: "${HX_HOUTIKU_TOKEN:?Set HX_HOUTIKU_TOKEN}"
: "${HX_HOUTIKU_PUBKEY:?Set HX_HOUTIKU_PUBKEY}"
: "${HX_HOUTIKU_NAME:?Set HX_HOUTIKU_NAME}"

# Check for Python (needed for ECIES encryption)
if ! command -v python3 &>/dev/null; then
  echo "❌ Error: python3 is required for ECIES encryption" >&2
  exit 1
fi

# Encrypt the payload using Python
PLAINTEXT=$(python3 -c "
import json, sys
print(json.dumps({'title': sys.argv[1], 'body': sys.argv[2], 'tags': []}, ensure_ascii=False))
" "$TITLE" "$BODY")

ENCRYPTED=$(python3 -c "
import base64, sys
try:
    from ecies import encrypt
except ImportError:
    print('ERROR: pip install eciespy', file=sys.stderr)
    sys.exit(1)
pk = bytes.fromhex(sys.argv[1])
ct = encrypt(pk, sys.argv[2].encode('utf-8'))
print(base64.b64encode(ct).decode())
" "$HX_HOUTIKU_PUBKEY" "$PLAINTEXT")

if [[ -z "$ENCRYPTED" ]]; then
  echo "❌ Error: Encryption failed" >&2
  exit 1
fi

# Build JSON payload
MSG_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
TIMESTAMP=$(python3 -c "import time; print(int(time.time() * 1000))")

PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'id': sys.argv[1],
    'recipients': [sys.argv[2]],
    'encrypted_payloads': {sys.argv[2]: sys.argv[3]},
    'priority': sys.argv[4],
    'group': sys.argv[5],
    'timestamp': int(sys.argv[6])
}))
" "$MSG_ID" "$HX_HOUTIKU_NAME" "$ENCRYPTED" "$PRIORITY" "$GROUP" "$TIMESTAMP")

# Send
HTTP_CODE=$(curl -s -o /tmp/hx-houtiku-response.json -w "%{http_code}" \
  -X POST "${HX_HOUTIKU_ENDPOINT}/api/push" \
  -H "Authorization: Bearer ${HX_HOUTIKU_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [[ "$HTTP_CODE" == "201" ]]; then
  echo "✅ Sent: $(cat /tmp/hx-houtiku-response.json)"
else
  echo "❌ Failed (HTTP $HTTP_CODE): $(cat /tmp/hx-houtiku-response.json)" >&2
  exit 1
fi
