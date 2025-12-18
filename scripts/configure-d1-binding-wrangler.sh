#!/bin/bash
# 使用 wrangler CLI 配置 D1 绑定（推荐方案）
# 这个方案通过临时修改 wrangler.toml 来配置绑定

set -e

# 确保在项目根目录执行
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

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
echo "   Project root: $PROJECT_ROOT"

# 备份原始的 wrangler.toml
WRANGLER_TOML="$PROJECT_ROOT/wrangler.toml"
WRANGLER_BACKUP="${WRANGLER_TOML}.backup"

if [ ! -f "$WRANGLER_TOML" ]; then
  echo "❌ Error: wrangler.toml not found at $WRANGLER_TOML"
  exit 1
fi

# 备份原文件
cp "$WRANGLER_TOML" "$WRANGLER_BACKUP"

# 检查是否已经有 D1 绑定配置
if grep -q "\[\[d1_databases\]\]" "$WRANGLER_TOML"; then
  echo "⚠️  D1 binding already exists in wrangler.toml, updating..."
  # 使用 sed 更新现有的 database_id
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS 版本的 sed
    sed -i '' "/database_id =/c\\
database_id = \"$D1_DATABASE_ID\"
" "$WRANGLER_TOML"
  else
    # Linux 版本的 sed
    sed -i "s/database_id = .*/database_id = \"$D1_DATABASE_ID\"/" "$WRANGLER_TOML"
  fi
else
  echo "📝 Adding D1 binding to wrangler.toml..."
  # 在文件末尾添加 D1 绑定配置
  cat >> "$WRANGLER_TOML" <<EOF

[[d1_databases]]
binding = "DB"
database_name = "$D1_DATABASE_NAME"
database_id = "$D1_DATABASE_ID"
EOF
fi

# 使用 wrangler 部署（这会更新绑定配置）
echo "📦 Deploying with D1 binding configuration..."
if npx wrangler deploy --name "$WORKER_NAME"; then
  echo "✅ Successfully configured D1 binding"
  echo "   Binding: DB -> $D1_DATABASE_NAME ($D1_DATABASE_ID)"
  # 恢复原始文件（移除 D1 绑定配置，保持代码仓库干净）
  cp "$WRANGLER_BACKUP" "$WRANGLER_TOML"
  rm -f "$WRANGLER_BACKUP"
else
  echo "❌ Failed to configure D1 binding via wrangler"
  # 恢复原始文件
  cp "$WRANGLER_BACKUP" "$WRANGLER_TOML"
  rm -f "$WRANGLER_BACKUP"
  exit 1
fi

