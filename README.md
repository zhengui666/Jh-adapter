## Jh-adapter
一个把 **Jihu CodeRider** 的聊天能力封装成 **OpenAI / Claude 兼容 API** 的小型网关，同时内置用户体系、API Key 管理和简单管理界面，方便自建或团队内部使用。

---

## 目录

- **项目概览**
- **功能特点**
- **整体架构**
- **快速启动**
- **部署方案**
- 使用 Docker
- Node.js + Vercel + GitHub Pages
- Cloudflare Workers + D1
- **配置说明（环境变量）**
- **前端使用说明**
- **在 Claude Code 中使用**
- **常见问题**

---

## 项目概览

- **目标**：提供一层兼容 OpenAI Chat Completions / Claude Messages 的 HTTP API，将请求转发到 Jihu CodeRider，方便各种客户端直接对接。
- **后端形态**
- `backend`：Node.js + Express + SQLite，适合本机 / Docker / Vercel 部署。
- `backend-cloudflare`：Cloudflare Workers + D1，适合直接跑在 Cloudflare 边缘节点。
- **前端**：`frontend`，基于 Vue 3 + Vite 的管理面板，用于注册、登录、API Key 管理以及简单对话调试。

---

## 功能特点

- **OpenAI 风格接口**
- `/v1/chat/completions`
- `/v1/models`
- `/v1/models/full`（包含模型元信息和部分静态扩展模型）

- **Claude 风格接口**
- `/v1/messages`

- **账号与权限**
- 注册 / 登录 / 退出登录
- 管理员审核注册请求
- 用户维度的 Session 管理

- **API Key 管理**
- 用户自助创建 / 启用 / 停用 API Key
- 通过请求头 `X-API-Key` 使用

- **用量统计**
- 按 API Key 记录请求次数与 token 用量，便于后续配额和审计。

- **多种部署方式**
- 本机 / Docker 一键启动
- Vercel（Node 后端）+ GitHub Pages（前端）
- Cloudflare Workers + D1（无服务器部署）

---

## 整体架构

项目根目录大致结构如下（只列出关键目录）：

```text
Jh-adapter/
backend/                 # Node.js + Express 后端（SQLite）
backend-cloudflare/      # Cloudflare Workers 版本后端（D1）
frontend/                # Vue 3 前端
docker-compose.yml       # 一键启动（生产/演示）
docker-compose.dev.yml   # 一键启动（开发联调）
wrangler.toml            # Cloudflare Workers & D1 配置
package.json             # Cloudflare 部署相关脚本
```

### 后端（Node.js + SQLite，`backend/`）

- 使用 Express 提供 HTTP API。
- 使用 SQLite 持久化用户、API Key、用量统计与 OAuth 配置（默认数据库文件为根目录 `jihu_proxy.db`）。
- `src/scripts/oauth-setup.ts` 提供本地 OAuth 初始化脚本，帮助获取访问 CodeRider 的 Access Token。

### 后端（Cloudflare Workers + D1，`backend-cloudflare/`）

- 使用 Hono 封装 Cloudflare Worker 路由。
- 使用 D1 存储数据，表结构由 `schema.sql` 定义。
- 覆盖与 Node 版一致的主要接口：
- 认证与 API Key 管理
- `/v1/models`、`/v1/models/full`
- `/v1/chat/completions`（支持流式）
- `/v1/messages`
- OAuth Web 流程：`/auth/oauth-start`、`/auth/oauth-callback`

### 前端（Vue 3 + Vite，`frontend/`）

- 使用 Vue 3 + TypeScript 开发的单页应用。
- 主要模块：
- 登录 / 注册 / 登出
- API Key 列表与创建
- 模型列表与聊天调试面板

---

## 快速启动（本地）

### 使用 Docker（推荐体验完整功能）

前置条件：本机安装 Docker（Docker Desktop 即可）。

```bash
git clone <你的仓库地址>
cd Jh-adapter

# 启动前后端 + SQLite
docker compose up -d
```

典型默认端口（以实际配置为准）：

- 后端 API：`http://127.0.0.1:8000/v1`
- 前端页面：`http://127.0.0.1:5173`

停止服务：

```bash
docker compose down
```

如需只启动部分组件或用于开发联调，可以参考 `docker-compose.dev.yml`。

---

### 直接启动 Node 后端 + 前端

#### 1. 启动 Node 后端

```bash
cd Jh-adapter/backend
npm install
npm run build
npm run start   # 默认监听 8000 端口
```

#### 2. 初始化 OAuth（建议执行一次）

```bash
cd Jh-adapter/backend
npm run oauth-setup
```

脚本会引导你完成 GitLab / Jihu 授权，并在本地写入配置文件，后端启动时会自动读取。

#### 3. 启动前端

```bash
cd Jh-adapter/frontend
npm install
npm run dev
```

浏览器访问 `http://127.0.0.1:5173` 即可进入管理界面。

前端调用的后端地址由 `VITE_API_BASE_URL` 控制，开发环境可以在 `frontend/.env.local` 里设置，例如：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000/v1
```

---

## 部署方案

### 使用 Docker（自建服务器）

在服务器上执行与本地类似的步骤：

```bash
git clone <你的仓库地址>
cd Jh-adapter
docker compose up -d
```

可按需修改 `docker-compose.yml` 中的端口映射、数据卷等配置。

---

### Node 后端部署到 Vercel，前端部署到 GitHub Pages

#### 1. 将 `backend` 部署到 Vercel

- 在 Vercel 控制台中新建项目，Git 仓库指向本项目。
- Root directory 选择 `backend`。
- 构建命令可设置为：
- `npm install`
- `npm run build && npm run start`

部署完成后，记下 Vercel 提供的域名，例如：

```text
https://<your-backend>.vercel.app
```

后端 API 前缀即为 `https://<your-backend>.vercel.app/v1`。

#### 2. 使用 GitHub Pages 部署前端

仓库中包含 GitHub Actions 工作流（例如 `.github/workflows/frontend-pages.yml`），会在推送到 `main` 时自动：

- 安装前端依赖
- 构建前端
- 将 `frontend/dist` 发布到 GitHub Pages

只需在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 中设置：

```text
VITE_API_BASE_URL=https://<your-backend>.vercel.app/v1
```

之后前端重新部署即可指向 Vercel 上的后端。

---

### Cloudflare Workers + D1

Cloudflare 方案使用 `backend-cloudflare` 中的 Worker 代码和 D1 数据库，整体行为尽量与 Node 版本保持一致。

#### 1. 创建并配置 D1 数据库

可以使用 Cloudflare Dashboard 或 `wrangler` CLI 创建：

```bash
wrangler d1 create JH_ADAPTER_DB
```

创建完成后，在 Dashboard 中复制该数据库的 **Database ID**，并在项目根目录的 `wrangler.toml` 中填写：

```toml
[[d1_databases]]
binding = "DB"
database_name = "JH_ADAPTER_DB"
database_id = "<你的 D1 Database ID>"
```

初始化表结构：

```bash
wrangler d1 execute JH_ADAPTER_DB --file=backend-cloudflare/schema.sql
```

#### 2. 部署到 Cloudflare

本地执行：

```bash
cd Jh-adapter
npm install
npx wrangler deploy
```

部署成功后会得到一个 Workers 域名，例如：

```text
https://<your-worker>.workers.dev
```

此时后端 API 前缀为 `https://<your-worker>.workers.dev/v1`。

> 出于安全考虑，请不要在公开仓库或文档中写入你的真实 Worker 域名，可在私有配置或 CI 变量中维护。

#### 3. 自动部署（可选）

你可以：

- 在 Cloudflare 控制台中使用 “连接到 Git 仓库”，让 Cloudflare 直接监控 `main` 分支并自动构建 / 部署；或
- 使用 `.github/workflows/deploy-cloudflare.yml`，通过 GitHub Actions 在每次 `push` 到 `main` 时执行 `wrangler deploy`。

---

## 配置说明（环境变量）

### Node 后端（`backend`）

常用环境变量示例：

- `PORT`：监听端口，默认 `8000`。
- `DATABASE_PATH`：SQLite 文件路径，默认根目录 `jihu_proxy.db`。
- `CODERIDER_HOST`：CodeRider 服务地址（一般为官方域名）。
- OAuth 相关的 Client ID / Secret，可以放在 `.env` 中，由后端配置模块读取。

### Cloudflare 后端（`backend-cloudflare`）

在 Cloudflare Dashboard → 你的 Worker → **Settings → Variables** 中配置：

- `CODERIDER_HOST`：CodeRider 服务地址（可选，默认使用官方地址）。
- `GITLAB_OAUTH_CLIENT_ID`、`GITLAB_OAUTH_CLIENT_SECRET`：用于网页 OAuth 授权。
- `GITLAB_OAUTH_ACCESS_TOKEN`：如果不想走网页流程，可以直接填入 Access Token。

Cloudflare Worker 会：

1. 优先从 D1 数据库的 `settings` 表中读取 Access Token。
2. 如果数据库中不存在，则回退到环境变量。
3. 发现 token 失效时，返回结构化错误 JSON，引导你重新授权或更新配置。

---

## 前端使用说明

### 本地开发

```bash
cd Jh-adapter/frontend
npm install
npm run dev
```

浏览器访问 `http://127.0.0.1:5173`，即可使用：

- 登录 / 注册 / 登出
- 申请 / 管理 API Key
- 在聊天面板中测试后端接口

### 构建与部署

```bash
cd Jh-adapter/frontend
npm run build
```

构建产物位于 `frontend/dist`，可部署到任意静态托管（Nginx、GitHub Pages 等）。

在构建前设置：

```bash
VITE_API_BASE_URL=<你的后端地址>/v1
```

即可让前端连接到对应的后端实例。

---

## 在 Claude Code 中使用

本项目可以作为 Claude Code 的自定义 OpenAI 兼容后端，典型使用流程如下：

1. 选择一种部署方式启动后端（Node / Cloudflare 均可）。
2. 在前端界面中创建一个 API Key，并妥善保存。
3. 在 Claude Code 的模型配置中：
- 将 Base URL 设置为你的后端地址（例如 `https://<your-backend>/v1`）。
- 将 API Key 设置为刚才创建的值（在请求中会被映射为 `X-API-Key`）。
- 模型名称使用 `/v1/models` 或 `/v1/models/full` 返回的任一模型 ID。
4. 保存配置后，即可通过本代理在 Claude Code 中调用 Jihu CodeRider。

请确保不要在公开仓库、截图或日志中泄露你的后端地址和 API Key。

---

## 常见问题（FAQ）

- **Cloudflare 日志中出现 D1 相关的 10021 错误？**  
通常是 `wrangler.toml` 中的 `database_id` 仍为占位符，请到 Cloudflare D1 控制台复制真实 ID 后填入。

- **前端总是请求 `localhost`？**  
请检查构建前是否正确设置 `VITE_API_BASE_URL`，尤其是使用 GitHub Actions 构建 GitHub Pages 时，需要在仓库变量中设置该值。

- **调用 `/v1/models/full` 或聊天接口返回认证过期错误？**  
说明 GitLab / Jihu 的 Access Token 失效或未配置，请重新运行 OAuth 脚本或在环境变量 / D1 中更新 token。

---

## 贡献与许可

- 欢迎通过 Issue / Pull Request 提交 Bug 反馈或功能改进建议。
- 具体许可信息以仓库根目录中的 `LICENSE` 文件为准；如未提供，则默认保留作者所有权利。


