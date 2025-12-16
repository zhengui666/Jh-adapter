# Jihu CodeRider OpenAI Proxy

一个将 **Jihu CodeRider** 插件背后的聊天能力，以 **OpenAI Chat Completions 兼容接口** 暴露出来的代理服务，同时兼容 Claude Messages API，并提供用户管理和管理后台。

## ✨ 特性

- 🚀 **OpenAI API 兼容**：支持标准的 `/v1/chat/completions` 和 `/v1/models` 接口
- 🤖 **Claude API 兼容**：支持 `/v1/messages`（Claude Messages 格式）
- 🔐 **用户体系**：注册 / 登录 / Session / API Key 管理 + 管理员审核
- 📊 **用量统计**：按 API Key 记录 prompt / completion tokens 和请求次数
- 🧱 **双后端实现**：
  - `backend`：Node.js + Express + SQLite（适合自建或 Vercel 部署）
  - `backend-cloudflare`：Cloudflare Workers + D1（适合 Cloudflare 部署）
- 🎨 **前端管理界面**：Vue 3 + Vite + TypeScript
- 🐳 **Docker 支持**：一键部署前后端服务
- ☁️ **多平台部署**：支持 Docker、Vercel、Cloudflare Workers

## 🏗️ 项目结构

```
Jh-adapter/
├── backend/                    # Node.js + SQLite 后端（Express，DDD）
│   ├── src/
│   │   ├── domain/            # 领域层（实体、值对象、异常）
│   │   ├── application/       # 应用层（业务服务）
│   │   ├── infrastructure/    # 基础设施层（Repository、外部服务、OAuth 脚本）
│   │   ├── presentation/      # 表现层（Express 路由）
│   │   └── index.ts           # 主入口
│   ├── package.json
│   └── tsconfig.json
├── backend-cloudflare/         # Cloudflare Workers 版本后端
│   ├── src/
│   │   ├── d1-repositories.ts # 使用 D1 的 Repository 实现
│   │   └── worker.ts          # Cloudflare Worker 主入口（Hono）
│   ├── CLOUDFLARE_DEPLOY.md   # Cloudflare 部署配置指南
│   ├── D1_DEPLOY.md           # D1 数据库部署指南
│   ├── schema.sql             # D1 数据库初始化 SQL
│   └── package.json
├── frontend/                   # Vue 3 管理前端
│   ├── src/
│   │   ├── components/
│   │   └── App.vue
│   ├── index.html
│   └── package.json
├── docker-compose.yml          # 一键启动前后端（本地 + SQLite）
├── docker-compose.dev.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── wrangler.toml               # Cloudflare Workers 配置（入口：backend-cloudflare/src/worker.ts）
├── package.json                # 根目录 package.json（用于 Cloudflare 部署）
├── jihu_proxy.db               # SQLite 数据库（本地 / Docker 自动创建）
├── jihu_oauth_config.json      # 本地 OAuth 配置（后端会同步到 SQLite）
└── README.md
```

## ⚙️ 技术栈

- **后端（Node 版）**：Node.js 20+、TypeScript、Express、SQLite、DDD
- **后端（Cloudflare 版）**：Cloudflare Workers、D1、Hono、TypeScript
- **前端**：Vue 3、Vite、TypeScript

---

## 📦 快速开始（本地运行）

### 1. 安装依赖

```bash
# 后端（Node + SQLite）
cd backend
npm install

# 前端（可选：如果需要改动前端界面）
cd ../frontend
npm install
```

### 2. OAuth 配置（首次使用）

```bash
cd backend
npm run oauth-setup
```

脚本会引导你：

1. 在 [Jihu GitLab](https://jihulab.com/-/user_settings/applications) 创建 OAuth 应用
2. 填写 Application ID 和 Secret
3. 自动打开浏览器完成授权
4. 将配置写入 `jihu_oauth_config.json`，并同步到 SQLite

### 3. 启动服务

**后端（Node 版）**：

```bash
cd backend
npm run dev        # 开发模式
# 或
npm run build && npm start   # 生产模式
```

**前端（管理界面）**：

```bash
cd frontend
npm run dev
```

默认端口：

- 后端 API：`http://127.0.0.1:8000`
- 前端界面：`http://127.0.0.1:5173`

---

## 🐳 方式一：Docker 一键部署（推荐自建）

```bash
# 在项目根目录
docker compose up -d
```

启动后：

- 后端 API：`http://127.0.0.1:8000`
- 前端界面：`http://127.0.0.1:5173`

持久化文件：

- `./jihu_proxy.db` - 用户 / API Key / 使用统计
- `./jihu_oauth_config.json` - OAuth 配置和令牌

查看日志：

```bash
docker compose logs -f         # 全部
# 或
docker compose logs -f backend
```

停止：

```bash
docker compose down
```

---

## ☁️ 方式二：后端部署到 Vercel，前端部署到 GitHub Pages

**1. 一键部署后端到 Vercel（Node + SQLite）**

[![Deploy Backend to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&project-name=jh-adapter-backend&repository-name=Jh-adapter&root-directory=backend)

部署完成后，记下 Vercel 域名，例如：

- `https://jh-adapter-backend-xxx.vercel.app`

**2. 前端部署到 GitHub Pages**

- 使用 GitHub Actions（例如 `frontend-pages.yml`）构建前端
- 在构建时注入环境变量 `VITE_API_BASE_URL` 为 Vercel 后端地址的 `/v1`：
  - 例如：`https://jh-adapter-backend-xxx.vercel.app/v1`

前端重新部署后，GitHub Pages 上的页面会直接请求 Vercel 上的后端。

> ⚠️ **注意**：Vercel 上的 SQLite 存储不适合高强度长时间使用，推荐用作演示或轻负载环境。

---

## ☁️ 方式三：后端部署到 Cloudflare Workers（D1）

本仓库根目录提供 `wrangler.toml`，入口为 `backend-cloudflare/src/worker.ts`，已经实现完整的：

- 认证：`/auth/register`、`/auth/login`、`/auth/logout`
- API Key：`/auth/api-keys`（用户）、`/admin/api-keys`（管理员）
- 注册审核：`/admin/registrations` 系列接口
- OAuth：`/auth/oauth-start`、`/auth/oauth-callback`
- LLM：`/v1/models`、`/v1/models/full`、`/v1/chat/completions`、`/v1/messages`
- 健康检查：`/health`

### 1. 创建并初始化 Cloudflare D1 数据库

**详细步骤请参考：[D1 部署指南](./backend-cloudflare/D1_DEPLOY.md)**

快速步骤：

1. **创建 D1 数据库**（在 Cloudflare Dashboard 或使用 CLI）：
   ```bash
   wrangler d1 create JH_ADAPTER_DB
   ```

2. **更新 `wrangler.toml`**，填入 `database_id`：
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "JH_ADAPTER_DB"
   database_id = "你的 D1 ID"  # 从步骤 1 获取
   ```

3. **初始化数据库 Schema**：
   ```bash
   wrangler d1 execute JH_ADAPTER_DB --file=backend-cloudflare/schema.sql
   ```

### 2. 一键部署到 Cloudflare

[![Deploy Backend to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&projectName=jh-adapter-backend-cloudflare)

**⚠️ 重要：配置构建命令和根目录**

Cloudflare 一键部署默认不会自动安装依赖。部署后，需要在 Cloudflare Dashboard 中配置：

1. 进入 **Workers & Pages** → 你的项目 → **Settings** → **Builds & deployments**
2. **检查 Root directory**：确保设置为 **空** 或 **`.`**（仓库根目录），**不要**设置为 `backend-cloudflare`
3. **配置 Build command**：设置为 `npm install && npx wrangler deploy`
4. 保存并重新触发部署

**详细说明请参考：[Cloudflare 部署配置指南](./backend-cloudflare/CLOUDFLARE_DEPLOY.md)**

Cloudflare 会以仓库根目录为项目根，自动读取 `wrangler.toml`，入口是 `backend-cloudflare/src/worker.ts`。

### 3. 配置环境变量

在 Cloudflare Workers 的 **Settings → Variables** 中配置：

- `CODERIDER_HOST`（可选，默认 `https://coderider.jihulab.com`）
- `GITLAB_OAUTH_CLIENT_ID`（可选，配合 `/auth/oauth-start` 使用）
- `GITLAB_OAUTH_CLIENT_SECRET`（可选）
- `GITLAB_OAUTH_ACCESS_TOKEN`（可选，若不走网页 OAuth，可直接填入）

> Cloudflare 版会优先使用你配置的 GitLab OAuth 令牌，无法使用本地文件系统。

### 4. 让前端指向 Cloudflare 后端

假设 Worker 域名为：

- `https://your-worker.your-subdomain.workers.dev`

则在前端构建时设置：

```bash
VITE_API_BASE_URL="https://your-worker.your-subdomain.workers.dev/v1"
```

---

## 🔌 API 使用示例

### OpenAI Chat Completions

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8000/v1",  # 或 Cloudflare / Vercel 地址
    api_key="your-api-key",
)

resp = client.chat.completions.create(
    model="maas-minimax-m2",  # 或 maas-deepseek-v3.1, maas-glm-4.6
    messages=[{"role": "user", "content": "你好，请介绍一下自己"}],
    stream=False,
)

print(resp.choices[0].message.content)
```

### Claude Messages 兼容接口

```bash
curl -X POST http://127.0.0.1:8000/v1/messages \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 512,
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'
```

### 模型列表

```bash
# 简单列表
curl http://127.0.0.1:8000/v1/models

# 完整列表
curl http://127.0.0.1:8000/v1/models/full
```

---

## 🤖 搭配 Claude Code 使用

可以把本项目作为 Claude Code 的“自托管代理后端”。

### 环境变量

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:8000"      # 或 Cloudflare/Vercel 地址
export ANTHROPIC_API_KEY="your-api-key"               # 在本项目中创建的 API Key

claude  # 启动 Claude Code
```

### 支持的模型别名

在 Claude Code 中可以使用：

- `claude-sonnet-4-5-20250929` → `maas-minimax-m2`
- `claude-haiku-4-5-20251001` → `maas-deepseek-v3.1`
- `claude-opus-4-5-20251101` → `maas-glm-4.6`

---

## 🔐 用户与权限

- 第一个注册的用户自动成为管理员
- 之后的注册需要管理员审核（通过 `/admin/registrations` 接口或前端管理界面）
- 管理员可查看所有 API Key，用于团队共享 / 限流

---

## 📚 相关文档

- [Cloudflare D1 数据库部署指南](./backend-cloudflare/D1_DEPLOY.md) - 详细的 D1 创建和初始化步骤
- [Cloudflare 部署配置指南](./backend-cloudflare/CLOUDFLARE_DEPLOY.md) - 构建命令和环境变量配置
- [后端 README](./backend/README.md) - Node.js 后端的详细说明

---

## ⚠️ 安全提示

- 生产环境务必使用 HTTPS
- 不要将真实的 GitLab OAuth Client Secret / Access Token 提交到 Git 仓库
- 定期轮换 API Key，限制其权限和可见范围
- 备份 SQLite 数据库（`jihu_proxy.db`）或在 D1 上做好备份策略

---

## 🐛 故障排查

### OAuth 认证失败

1. 检查 `jihu_oauth_config.json` 是否存在且格式正确
2. 运行 `npm run oauth-setup` 重新配置
3. 确认 GitLab 应用的 Redirect URI 设置正确

### 数据库连接问题

- 确保 `jihu_proxy.db` 文件有读写权限
- 在 Docker 环境中，检查 volume 挂载是否正确
- Cloudflare D1：确认 `wrangler.toml` 中的 `database_id` 正确

### 前端无法连接后端

- 检查 `VITE_API_BASE_URL` 环境变量是否正确
- 在 Docker 环境中，确保前端容器能访问 `backend` 服务
- 检查浏览器控制台的网络请求错误

### Cloudflare 部署问题

- 参考 [Cloudflare 部署配置指南](./backend-cloudflare/CLOUDFLARE_DEPLOY.md)
- 确认 Root directory 和 Build command 配置正确
- 检查部署日志中的错误信息

---

## 📄 许可证

本项目使用 MIT 许可证，欢迎 Fork 和二次开发。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**注意**：本项目仅用于学习和研究目的，请遵守 Jihu CodeRider 的使用条款。
