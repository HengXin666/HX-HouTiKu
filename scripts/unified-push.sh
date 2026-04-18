#!/usr/bin/env bash
# ============================================================
#  unified-push.sh — Shell wrapper for sending push notifications
#
#  Usage:
#    ./unified-push.sh --title "Deploy Done" --body "v2.1.0" --priority high --group ci-cd
#
#  Environment variables:
#    UNIFIED_PUSH_ENDPOINT  — API base URL
#    UNIFIED_PUSH_TOKEN     — API bearer token
#    UNIFIED_PUSH_PUBKEY    — Recipient public key (hex)
#    UNIFIED_PUSH_NAME      — Recipient name
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
      echo "  UNIFIED_PUSH_ENDPOINT  API base URL"
      echo "  UNIFIED_PUSH_TOKEN     API bearer token"
      echo "  UNIFIED_PUSH_PUBKEY    Recipient public key (hex)"
      echo "  UNIFIED_PUSH_NAME      Recipient name"
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

: "${UNIFIED_PUSH_ENDPOINT:?Set UNIFIED_PUSH_ENDPOINT}"
: "${UNIFIED_PUSH_TOKEN:?Set UNIFIED_PUSH_TOKEN}"
: "${UNIFIED_PUSH_PUBKEY:?Set UNIFIED_PUSH_PUBKEY}"
: "${UNIFIED_PUSH_NAME:?Set UNIFIED_PUSH_NAME}"

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
" "$UNIFIED_PUSH_PUBKEY" "$PLAINTEXT")

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
" "$MSG_ID" "$UNIFIED_PUSH_NAME" "$ENCRYPTED" "$PRIORITY" "$GROUP" "$TIMESTAMP")

# Send
HTTP_CODE=$(curl -s -o /tmp/unified-push-response.json -w "%{http_code}" \
  -X POST "${UNIFIED_PUSH_ENDPOINT}/api/push" \
  -H "Authorization: Bearer ${UNIFIED_PUSH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [[ "$HTTP_CODE" == "201" ]]; then
  echo "✅ Sent: $(cat /tmp/unified-push-response.json)"
else
  echo "❌ Failed (HTTP $HTTP_CODE): $(cat /tmp/unified-push-response.json)" >&2
  exit 1
fi
