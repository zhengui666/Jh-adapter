# 部署后自动配置 D1 绑定

本目录包含部署后自动配置 Cloudflare Workers D1 数据库绑定的脚本。

## 问题背景

为了避免在 `wrangler.toml` 中硬编码 D1 数据库 ID，我们使用部署后脚本自动配置绑定。

## 使用方法

### 方案 1：GitHub Actions 自动配置（推荐）

在 GitHub Secrets 中配置以下变量：

- `CLOUDFLARE_API_TOKEN`: Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID  
- `CLOUDFLARE_D1_DATABASE_ID`: D1 数据库 ID

GitHub Actions 会在部署后自动运行 `configure-d1-binding-wrangler.sh` 来配置绑定。

### 方案 2：手动运行脚本

```bash
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export D1_DATABASE_ID="your-database-id"
export WORKER_NAME="jh-adapter-backend"
export D1_DATABASE_NAME="JH_ADAPTER_DB"

chmod +x scripts/configure-d1-binding-wrangler.sh
./scripts/configure-d1-binding-wrangler.sh
```

### 方案 3：在 Cloudflare Dashboard 中手动配置

如果自动配置失败，可以在 Cloudflare Dashboard 中手动配置：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 你的 Worker (`jh-adapter-backend`)
3. 进入 **Settings** → **Variables**
4. 在 **D1 Database Bindings** 部分，点击 **Add binding**
5. 配置：
   - **Variable name**: `DB`
   - **Database**: 选择 `JH_ADAPTER_DB`
6. 点击 **Save**

## 脚本说明

- `configure-d1-binding-wrangler.sh`: 使用 wrangler CLI 配置绑定（推荐）
- `configure-d1-binding.js`: 使用 Cloudflare API 配置绑定（备用方案）
- `configure-d1-binding.sh`: Bash 版本的 API 配置脚本（备用方案）

## 故障排查

如果绑定配置失败：

1. 检查 GitHub Secrets 是否正确配置
2. 检查 Cloudflare API Token 是否有足够的权限
3. 检查 D1 数据库 ID 是否正确
4. 查看 GitHub Actions 日志中的错误信息
5. 如果自动配置失败，使用方案 3 手动配置

