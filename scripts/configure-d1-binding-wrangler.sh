#!/bin/bash
# 使用 wrangler CLI 配置 D1 绑定（推荐方案）
# 这个方案通过临时创建包含 D1 绑定的 wrangler.toml 来配置绑定

set -e

WORKER_NAME="${WORKER_NAME:-jh-adapter-backend}"
D1_DATABASE_NAME="${D1_DATABASE_NAME:-JH_ADAPTER_DB}"
D1_DATABASE_ID="${D1_DATABASE_ID}"

if [ -z "$D1_DATABASE_ID" ]; then
  echo "❌ Error: D1_DATABASE_ID is not set"
  exit 1
fi

echo "🔧 Configuring D1 binding using wrangler CLI"
echo "   Worker: $WORKER_NAME"
echo "   Database: $D1_DATABASE_NAME (ID: $D1_DATABASE_ID)"

# 创建临时的 wrangler.toml 用于配置绑定
TEMP_WRANGLER=$(mktemp)
cat > "$TEMP_WRANGLER" <<EOF
name = "$WORKER_NAME"
main = "backend-cloudflare/src/worker.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "$D1_DATABASE_NAME"
database_id = "$D1_DATABASE_ID"
EOF

# 使用 wrangler 部署（这会更新绑定配置，即使代码没有变化）
echo "📦 Deploying with D1 binding configuration..."
npx wrangler deploy --config "$TEMP_WRANGLER" --name "$WORKER_NAME" || {
  echo "❌ Failed to configure D1 binding via wrangler"
  rm -f "$TEMP_WRANGLER"
  exit 1
}

# 清理临时文件
rm -f "$TEMP_WRANGLER"

echo "✅ Successfully configured D1 binding"
echo "   Binding: DB -> $D1_DATABASE_NAME ($D1_DATABASE_ID)"

