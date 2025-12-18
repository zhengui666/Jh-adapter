#!/bin/bash
# 部署后自动配置 D1 数据库绑定
# 使用 Cloudflare API 更新 Worker 的绑定配置，避免在 wrangler.toml 中硬编码

set -e

# 从环境变量读取配置
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID}"
WORKER_NAME="${WORKER_NAME:-jh-adapter-backend}"
D1_DATABASE_NAME="${D1_DATABASE_NAME:-JH_ADAPTER_DB}"
D1_DATABASE_ID="${D1_DATABASE_ID}"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ Error: CLOUDFLARE_API_TOKEN is not set"
  exit 1
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "❌ Error: CLOUDFLARE_ACCOUNT_ID is not set"
  exit 1
fi

if [ -z "$D1_DATABASE_ID" ]; then
  echo "❌ Error: D1_DATABASE_ID is not set"
  exit 1
fi

echo "🔧 Configuring D1 binding for Worker: $WORKER_NAME"
echo "   Database: $D1_DATABASE_NAME (ID: $D1_DATABASE_ID)"

# 获取当前 Worker 的配置
CURRENT_CONFIG=$(curl -s -X GET \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json")

# 检查 Worker 是否存在
if echo "$CURRENT_CONFIG" | grep -q '"success":false'; then
  echo "❌ Error: Worker '$WORKER_NAME' not found"
  exit 1
fi

# 获取当前的绑定配置
CURRENT_BINDINGS=$(echo "$CURRENT_CONFIG" | jq -r '.result.bindings // []')

# 检查 D1 绑定是否已存在
D1_BINDING_EXISTS=$(echo "$CURRENT_BINDINGS" | jq -r '.[] | select(.type == "d1") | select(.name == "DB") | .database_id // empty')

if [ "$D1_BINDING_EXISTS" = "$D1_DATABASE_ID" ]; then
  echo "✅ D1 binding already configured correctly"
  exit 0
fi

# 移除旧的 D1 绑定（如果存在）
NEW_BINDINGS=$(echo "$CURRENT_BINDINGS" | jq '[.[] | select(.type != "d1" or .name != "DB")]')

# 添加新的 D1 绑定
NEW_BINDINGS=$(echo "$NEW_BINDINGS" | jq ". += [{\"type\": \"d1\", \"name\": \"DB\", \"database_id\": \"$D1_DATABASE_ID\"}]")

# 更新 Worker 的绑定配置
UPDATE_RESPONSE=$(curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/bindings" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"bindings\": $NEW_BINDINGS}")

if echo "$UPDATE_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Successfully configured D1 binding"
  echo "   Binding: DB -> $D1_DATABASE_NAME ($D1_DATABASE_ID)"
else
  echo "❌ Error: Failed to configure D1 binding"
  echo "$UPDATE_RESPONSE" | jq '.'
  exit 1
fi

