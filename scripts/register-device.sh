#!/usr/bin/env bash
# ============================================================
#  register-device.sh — 注册新设备为消息接收者
#
#  使用场景：
#    手机 App 首次设置后，生成了公钥，需要把设备注册到 Worker 后端。
#    注册成功后会返回 recipient_token，在 App 设置页面填入即可。
#
#  用法：
#    交互式（推荐首次使用）:
#      ./register-device.sh
#
#    命令行参数:
#      ./register-device.sh --name "my-phone" --pubkey "04abcdef..."
#
#  环境变量：
#    HX_HOUTIKU_ENDPOINT  — Worker API 地址（必填）
#    HX_HOUTIKU_TOKEN     — 管理员 Token（必填）
#
#  示例 .env 配置：
#    export HX_HOUTIKU_ENDPOINT="https://hx-houtiku-api.你的域名.workers.dev"
#    export HX_HOUTIKU_TOKEN="ak-hx-houtiku-你的Token"
# ============================================================

set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── 参数解析 ──────────────────────────────────────────────────
DEVICE_NAME=""
PUBLIC_KEY=""
GROUPS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name|-n)     DEVICE_NAME="$2"; shift 2 ;;
    --pubkey|-k)   PUBLIC_KEY="$2";  shift 2 ;;
    --groups|-g)   GROUPS="$2";      shift 2 ;;
    --help|-h)
      echo -e "${BOLD}register-device.sh${NC} — 注册新设备为消息接收者"
      echo ""
      echo "用法:"
      echo "  $0                                  # 交互式"
      echo "  $0 --name NAME --pubkey PUBLIC_KEY  # 命令行"
      echo ""
      echo "选项:"
      echo "  --name,   -n   设备名称（如 my-phone, home-mac）"
      echo "  --pubkey, -k   App 生成的公钥（十六进制字符串）"
      echo "  --groups, -g   消息分组，逗号分隔（默认: general）"
      echo "  --help,   -h   显示帮助"
      echo ""
      echo "环境变量:"
      echo "  HX_HOUTIKU_ENDPOINT  Worker API 地址"
      echo "  HX_HOUTIKU_TOKEN     管理员 Token"
      exit 0
      ;;
    *) echo -e "${RED}❌ 未知选项: $1${NC}"; exit 1 ;;
  esac
done

# ── 检查环境变量 ──────────────────────────────────────────────
if [[ -z "${HX_HOUTIKU_ENDPOINT:-}" ]]; then
  echo -e "${RED}❌ 未设置 HX_HOUTIKU_ENDPOINT${NC}"
  echo -e "   请运行: ${CYAN}export HX_HOUTIKU_ENDPOINT=\"https://你的worker地址\"${NC}"
  exit 1
fi

if [[ -z "${HX_HOUTIKU_TOKEN:-}" ]]; then
  echo -e "${RED}❌ 未设置 HX_HOUTIKU_TOKEN${NC}"
  echo -e "   请运行: ${CYAN}export HX_HOUTIKU_TOKEN=\"ak-hx-houtiku-你的token\"${NC}"
  exit 1
fi

# ── 交互式输入（如果没有通过参数传入） ────────────────────────
if [[ -z "$DEVICE_NAME" ]]; then
  echo -e "${BOLD}📱 注册新设备到 HX-HouTiKu${NC}"
  echo -e "   后端: ${CYAN}${HX_HOUTIKU_ENDPOINT}${NC}"
  echo ""
  read -rp "$(echo -e "${YELLOW}设备名称${NC}（如 my-phone）: ")" DEVICE_NAME
  if [[ -z "$DEVICE_NAME" ]]; then
    echo -e "${RED}❌ 设备名称不能为空${NC}"
    exit 1
  fi
fi

if [[ -z "$PUBLIC_KEY" ]]; then
  echo ""
  echo -e "${YELLOW}请粘贴 App 中显示的公钥（十六进制字符串）:${NC}"
  read -rp "> " PUBLIC_KEY
  if [[ -z "$PUBLIC_KEY" ]]; then
    echo -e "${RED}❌ 公钥不能为空${NC}"
    exit 1
  fi
fi

# ── 构建请求体 ────────────────────────────────────────────────
if [[ -n "$GROUPS" ]]; then
  # 把 "ci-cd,alerts" 转为 ["ci-cd","alerts"]
  GROUPS_JSON=$(echo "$GROUPS" | tr ',' '\n' | sed 's/^/"/;s/$/"/' | paste -sd',' - | sed 's/^/[/;s/$/]/')
  BODY="{\"name\":\"${DEVICE_NAME}\",\"public_key\":\"${PUBLIC_KEY}\",\"groups\":${GROUPS_JSON}}"
else
  BODY="{\"name\":\"${DEVICE_NAME}\",\"public_key\":\"${PUBLIC_KEY}\"}"
fi

# ── 发送注册请求 ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}⏳ 正在注册设备...${NC}"

RESPONSE_FILE=$(mktemp)
HTTP_CODE=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST "${HX_HOUTIKU_ENDPOINT}/api/recipients" \
  -H "Authorization: Bearer ${HX_HOUTIKU_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY")

RESPONSE=$(cat "$RESPONSE_FILE")
rm -f "$RESPONSE_FILE"

# ── 处理结果 ──────────────────────────────────────────────────
if [[ "$HTTP_CODE" == "201" ]]; then
  # 提取关键信息
  RECIPIENT_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['recipient_token'])" 2>/dev/null || echo "")
  RECIPIENT_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

  echo ""
  echo -e "${GREEN}✅ 注册成功！${NC}"
  echo ""
  echo -e "  ${BOLD}设备名称:${NC}       $DEVICE_NAME"
  echo -e "  ${BOLD}Recipient ID:${NC}   $RECIPIENT_ID"
  echo -e "  ${BOLD}Recipient Token:${NC} ${CYAN}${RECIPIENT_TOKEN}${NC}"
  echo ""
  echo -e "${YELLOW}════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}📋 接下来你需要做两件事:${NC}"
  echo ""
  echo -e "  ${GREEN}1.${NC} 在手机 App 的 设置 → 填入 Recipient Token:"
  echo -e "     ${CYAN}${RECIPIENT_TOKEN}${NC}"
  echo ""
  echo -e "  ${GREEN}2.${NC} 在你的推送脚本/SDK 配置中添加此设备的公钥:"
  echo -e "     name:       ${DEVICE_NAME}"
  echo -e "     public_key: ${PUBLIC_KEY:0:32}..."
  echo -e "${YELLOW}════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  完成后，就可以向 ${BOLD}${DEVICE_NAME}${NC} 推送消息了 🎉"

  # 如果 SDK .env 文件存在，提示更新
  echo ""
  echo -e "  ${BOLD}SDK Python 配置示例:${NC}"
  echo -e "  ${CYAN}HX_HOUTIKU_NAME=${DEVICE_NAME}${NC}"
  echo -e "  ${CYAN}HX_HOUTIKU_PUBKEY=${PUBLIC_KEY:0:32}...${NC}"

elif [[ "$HTTP_CODE" == "409" ]]; then
  echo ""
  echo -e "${YELLOW}⚠️  设备名称或公钥已存在 (HTTP 409)${NC}"
  echo -e "   如需重新注册，请先删除旧的 recipient，或使用不同的名称。"
  echo ""
  echo -e "   查看已注册设备:"
  echo -e "   ${CYAN}curl -s '${HX_HOUTIKU_ENDPOINT}/api/recipients' -H 'Authorization: Bearer ${HX_HOUTIKU_TOKEN}' | python3 -m json.tool${NC}"

elif [[ "$HTTP_CODE" == "401" ]]; then
  echo ""
  echo -e "${RED}❌ 认证失败 (HTTP 401)${NC}"
  echo -e "   请检查 HX_HOUTIKU_TOKEN 是否正确。"

else
  echo ""
  echo -e "${RED}❌ 注册失败 (HTTP $HTTP_CODE)${NC}"
  echo -e "   响应: $RESPONSE"
fi
