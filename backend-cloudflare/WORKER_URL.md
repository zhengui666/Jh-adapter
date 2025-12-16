# Cloudflare Worker 部署信息

## Worker 域名

**开发环境（Dev）**：
- `https://jh-adapter-backend.pergrouhixjwpauletteznp35.workers.dev`

## 测试 Worker

### 健康检查

```bash
curl https://jh-adapter-backend.pergrouhixjwpauletteznp35.workers.dev/health
```

预期返回：
```json
{"status":"ok","backend":"cloudflare-worker"}
```

### 测试 API

```bash
# 获取模型列表
curl https://jh-adapter-backend.pergrouhixjwpauletteznp35.workers.dev/v1/models

# 完整模型列表（需要 OAuth token）
curl https://jh-adapter-backend.pergrouhixjwpauletteznp35.workers.dev/v1/models/full
```

## 前端配置

如果要将前端指向这个 Worker，在构建前端时设置：

```bash
VITE_API_BASE_URL="https://jh-adapter-backend.pergrouhixjwpauletteznp35.workers.dev/v1"
```

## 环境变量

确保在 Cloudflare Dashboard 中配置了以下环境变量：

- `CODERIDER_HOST`（可选，默认 `https://coderider.jihulab.com`）
- `GITLAB_OAUTH_CLIENT_ID`（可选）
- `GITLAB_OAUTH_CLIENT_SECRET`（可选）
- `GITLAB_OAUTH_ACCESS_TOKEN`（可选）

## D1 数据库

确保 `wrangler.toml` 中的 D1 数据库配置正确，并且已经初始化了 Schema。

参考：[D1 部署指南](./D1_DEPLOY.md)

