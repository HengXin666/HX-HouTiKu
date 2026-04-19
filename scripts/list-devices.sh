#!/usr/bin/env bash
# ============================================================
#  list-devices.sh — 列出所有已注册的接收设备
#
#  环境变量：
#    HX_HOUTIKU_ENDPOINT  — Worker API 地址
#    HX_HOUTIKU_TOKEN     — 管理员 Token
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

: "${HX_HOUTIKU_ENDPOINT:?请设置 HX_HOUTIKU_ENDPOINT}"
: "${HX_HOUTIKU_TOKEN:?请设置 HX_HOUTIKU_TOKEN}"

RESPONSE_FILE=$(mktemp)
HTTP_CODE=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" \
  "${HX_HOUTIKU_ENDPOINT}/api/recipients" \
  -H "Authorization: Bearer ${HX_HOUTIKU_TOKEN}")

RESPONSE=$(cat "$RESPONSE_FILE")
rm -f "$RESPONSE_FILE"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo -e "${RED}❌ 请求失败 (HTTP $HTTP_CODE)${NC}"
  echo "$RESPONSE"
  exit 1
fi

echo -e "${BOLD}📱 已注册的接收设备${NC}"
echo -e "${DIM}后端: ${HX_HOUTIKU_ENDPOINT}${NC}"
echo ""

# 用 Python 格式化输出
python3 -c "
import json, sys
from datetime import datetime

data = json.loads(sys.argv[1])
recipients = data.get('recipients', [])

if not recipients:
    print('  (暂无已注册设备)')
    sys.exit(0)

for i, r in enumerate(recipients):
    active = '🟢' if r.get('is_active') else '🔴'
    ts = r.get('created_at', 0)
    created = datetime.fromtimestamp(ts / 1000).strftime('%Y-%m-%d %H:%M') if ts else '未知'
    pk = r.get('public_key', '')
    pk_short = pk[:20] + '...' + pk[-8:] if len(pk) > 32 else pk
    groups = ', '.join(r.get('groups', ['general']))
    token = f\"rt_{r['id']}\"

    print(f\"  {active} {r['name']}\")
    print(f\"     ID:     {r['id']}\")
    print(f\"     Token:  {token}\")
    print(f\"     公钥:   {pk_short}\")
    print(f\"     分组:   {groups}\")
    print(f\"     注册于: {created}\")
    if i < len(recipients) - 1:
        print()
" "$RESPONSE"

echo ""

COUNT=$(echo "$RESPONSE" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('recipients',[])))")
echo -e "${DIM}共 ${COUNT} 个设备${NC}"
