# Cloudflare Workers 部署配置说明

## ⚠️ 重要：构建命令配置

Cloudflare 一键部署按钮默认执行 `npx wrangler deploy`，但**不会自动安装依赖**。你需要在 Cloudflare Dashboard 中配置构建命令。

## 📋 配置步骤

### 1. 在 Cloudflare Dashboard 中配置构建命令

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 你的 Worker 项目
3. 进入 **Settings** → **Builds & deployments**
4. **重要**：检查 **Root directory** 设置
   - 应该设置为：**空** 或 **`.`**（表示仓库根目录）
   - **不要**设置为 `backend-cloudflare`
5. 找到 **Build command** 或 **Build configuration**
6. 将构建命令设置为：

```bash
npm install && npx wrangler deploy
```

如果仍然找不到 `package.json`，尝试：

```bash
cd /opt/buildhome/repo && npm install && npx wrangler deploy
```

或者检查实际的工作目录：

```bash
pwd && ls -la && npm install && npx wrangler deploy
```

或者，如果你使用的是 **Pages** 部署：

1. 进入 **Workers & Pages** → **Pages**
2. 选择你的项目
3. 进入 **Settings** → **Builds & deployments**
4. 在 **Build command** 中填入：

```bash
npm install && npx wrangler deploy
```

### 2. 环境变量配置

在 **Settings** → **Variables** 中配置：

- `CODERIDER_HOST`（可选，默认 `https://coderider.jihulab.com`）
- `GITLAB_OAUTH_CLIENT_ID`（可选）
- `GITLAB_OAUTH_CLIENT_SECRET`（可选）
- `GITLAB_OAUTH_ACCESS_TOKEN`（可选）

### 3. D1 数据库配置

确保 `wrangler.toml` 中的 D1 数据库配置正确：

```toml
[[d1_databases]]
binding = "DB"
database_name = "JH_ADAPTER_DB"
database_id = "你的 D1 数据库 ID"
```

详细步骤请参考：[D1 部署指南](./D1_DEPLOY.md)

## 🔄 重新部署

配置完成后，重新触发部署：

1. 在 Cloudflare Dashboard 中点击 **Retry deployment** 或
2. 推送新的代码到 GitHub（如果启用了自动部署）

## ✅ 验证部署

部署成功后，测试健康检查：

```bash
curl https://your-worker.your-subdomain.workers.dev/health
```

应该返回：

```json
{"status":"ok","backend":"cloudflare-worker"}
```

## 🐛 故障排查

### 问题：仍然提示 "Could not resolve 'hono'"

**解决方案**：

1. 确认构建命令已正确配置为 `npm install && npx wrangler deploy`
2. 检查 `package.json` 中是否包含 `hono` 依赖
3. 查看部署日志，确认 `npm install` 是否成功执行
4. 如果使用 GitHub 自动部署，检查 GitHub Actions 的构建配置

### 问题：构建命令配置找不到

**解决方案**：

- 某些 Cloudflare 项目类型可能不支持自定义构建命令
- 尝试使用 **Workers** 而不是 **Pages** 部署
- 或者使用本地 `wrangler deploy` 命令手动部署

## 📚 参考

- [Cloudflare Workers 构建配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare Pages 构建配置](https://developers.cloudflare.com/pages/platform/build-configuration/)

