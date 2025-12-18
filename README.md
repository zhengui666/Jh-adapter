## Jh-adapter

一个把 **Jihu CodeRider** 的聊天能力封装成 **OpenAI / Claude 兼容 API** 的小型网关，同时内置用户体系、API Key 管理和简单管理界面，方便自建或团队内部使用。

你可以像调用 OpenAI 一样调用本项目的 `/v1/chat/completions`、`/v1/messages` 等接口，底层则由 Jh-adapter 自动对接 Jihu CodeRider。

---

## 目录

- **项目简介**
- **功能特性**
- **整体架构与目录结构**
- **一键部署按钮**
  - 一键部署到 Vercel（Node.js 后端）
  - 一键部署到 Cloudflare Workers + D1
- **本地快速开始（含 Docker）**
- **部署方式详解**
  - 使用 Docker 自建（推荐新手）
  - Node.js 后端部署到 Vercel + 前端静态托管
  - Cloudflare Workers + D1 无服务器部署
- **环境变量与配置说明**
- **前端管理面板使用说明**
- **在 Claude Code / OpenAI 兼容客户端中使用**
- **常见问题（FAQ）**
- **贡献与许可证**

---

## 项目简介

- **目标**：提供一层兼容 OpenAI Chat Completions / Claude Messages 的 HTTP API，将请求转发到 Jihu CodeRider，方便各种客户端直接对接。
- **后端形态：**
  - `backend`：Node.js + Express + SQLite，适合本机 / Docker / Vercel 部署。
  - `backend-cloudflare`：Cloudflare Workers + D1，适合直接跑在 Cloudflare 边缘节点。
- **前端：** `frontend`，基于 Vue 3 + Vite 的管理面板，用于注册、登录、API Key 管理以及简单对话调试。

本 README 已将所有部署步骤按「保姆级」展开，只要按顺序照做，不需要额外查资料也能完成部署。

---

## 功能特性

- **OpenAI 风格接口**
  - `/v1/chat/completions`
  - `/v1/models`
  - `/v1/models/full`（包含模型元信息和部分静态扩展模型）

- **Claude 风格接口**
  - `/v1/messages`

- **账号与权限**
  - 注册 / 登录 / 退出登录
  - 管理员审核注册请求（首个注册用户自动成为管理员）
  - 用户维度的 Session 管理

- **API Key 管理**
  - 用户自助创建 / 启用 / 停用 API Key
  - 通过请求头 `X-API-Key` 使用
  - 支持按 API Key 记录用量

- **用量统计**
  - 统计每个 API Key 的：
    - 请求次数
    - 输入 / 输出 token 用量

- **多种部署方式**
  - 本机 / Docker 一键启动
  - Vercel（Node 后端）+ 任意静态托管（GitHub Pages、Vercel Static 等）部署前端
  - Cloudflare Workers + D1（无服务器部署，延迟低、维护成本小）

---

## 整体架构与目录结构

项目根目录结构（只列关键目录）：

```text
Jh-adapter/
  backend/                 # Node.js + Express 后端（SQLite）
  backend-cloudflare/      # Cloudflare Workers 版本后端（D1）
  frontend/                # Vue 3 前端管理面板
  docker-compose.yml       # 一键启动（生产/演示）
  docker-compose.dev.yml   # 一键启动（开发联调）
  wrangler.toml            # Cloudflare Workers & D1 配置
  package.json             # Cloudflare 部署相关脚本（wrangler）
```

### 后端（Node.js + SQLite，`backend/`）

- 使用 Express 提供 HTTP API。
- 使用 SQLite 持久化用户、API Key、用量统计与 OAuth 配置（默认数据库文件为根目录 `jihu_proxy.db`）。
- `src/scripts/oauth-setup.ts` 提供本地 OAuth 初始化脚本，帮助获取访问 CodeRider 的 Access Token。

### 后端（Cloudflare Workers + D1，`backend-cloudflare/`）

- 使用 Hono 封装 Cloudflare Worker 路由。
- 使用 D1 存储数据，表结构由 `backend-cloudflare/schema.sql` 定义。
- 覆盖与 Node 版一致的主要接口：
  - 认证与 API Key 管理
  - `/v1/models`、`/v1/models/full`
  - `/v1/chat/completions`
  - `/v1/messages`
  - OAuth Web 流程：`/auth/oauth-start`、`/auth/oauth-callback`

### 前端（Vue 3 + Vite，`frontend/`）

- 使用 Vue 3 + TypeScript 开发的单页应用。
- 主要模块：
  - 登录 / 注册 / 登出
  - API Key 列表与创建
  - 模型列表与聊天调试面板

---

## 一键部署按钮

### 一键部署到 Vercel（Node.js 后端）

> 该按钮会将本仓库克隆到你的 Vercel 账号下，并以 `backend/` 作为后端入口。你仍然需要在 Vercel 控制台里补充环境变量。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&project-name=jh-adapter-backend&repository-name=Jh-adapter)

使用步骤简述：

1. 点击上方按钮，用 GitHub 登录 Vercel 并授权访问你的仓库。
2. 进入创建项目向导：
   - **PROJECT NAME**：可保留默认或自定义。
   - **FRAMEWORK PRESET**：选择「Other」或默认（因为是自定义 Node 服务）。
3. **重要：Root Directory 选择 `backend`**。
4. 构建命令 / 输出目录可以使用默认（Vercel 会自动检测），如需显式设置：
   - Build Command：`npm run build`
   - Output Directory：留空（使用 Node 服务器模式）。
5. 创建完成后，在 Vercel 的「Settings → Environment Variables」中补充环境变量（见下文「环境变量与配置说明」）。

后端域名形如：

```text
https://<your-backend>.vercel.app
```

后端 API 前缀即为：

```text
https://<your-backend>.vercel.app/v1
```

> ⚠️ Vercel 的无状态特性意味着 SQLite 适合轻量使用 / 演示环境，如需稳定生产环境，更推荐 Docker 自建或 Cloudflare D1。

---

### 一键部署到 Cloudflare Workers + D1

> 该按钮会在 Cloudflare 上创建一个 Workers 项目，使用仓库根目录的 `wrangler.toml` 和 `backend-cloudflare/src/worker.ts` 作为入口。你仍然需要在 Cloudflare Dashboard 中补充 D1 数据库和环境变量。

[![Deploy Backend to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&projectName=jh-adapter-backend-cloudflare)

完成一键部署后，请继续阅读下面「Cloudflare Workers + D1 无服务器部署（保姆级）」一节，把 D1 数据库与环境变量配置完整。

---

## 本地快速开始（含 Docker）

### 方法一：使用 Docker 一键启动（推荐体验完整功能）

**前置条件：**

- 已安装 **Docker**（Docker Desktop 即可）。

**步骤：**

1. 克隆仓库：

   ```bash
   git clone https://github.com/zhengui666/Jh-adapter.git
   cd Jh-adapter
   ```

2. 启动前后端 + SQLite：

   ```bash
   docker compose up -d
   ```

3. 等待容器启动完成后，典型默认端口（如未改配置）：

   - **后端 API**：`http://127.0.0.1:8000/v1`
   - **前端页面**：`http://127.0.0.1:5173`

4. 访问前端：

   - 浏览器打开 `http://127.0.0.1:5173`
   - 第一次注册的账号会自动成为管理员，可登录后管理其他注册请求与 API Key。

5. 停止服务：

   ```bash
   docker compose down
   ```

如需只启动部分组件或用于开发联调，可以参考 `docker-compose.dev.yml` 调整服务和端口映射。

---

### 方法二：直接启动 Node 后端 + 前端

#### 1. 启动 Node 后端（`backend/`）

1. 安装依赖并构建：

   ```bash
   cd Jh-adapter/backend
   npm install
   npm run build
   ```

2. 启动服务：

   ```bash
   npm run start   # 默认监听 8000 端口
   ```

   - 后端地址默认是 `http://127.0.0.1:8000`
   - OpenAI 兼容接口前缀为 `http://127.0.0.1:8000/v1`

#### 2. 初始化 OAuth（强烈建议执行一次）

为避免手动配置 Jihu CodeRider 的 Access Token，可以使用内置脚本：

```bash
cd Jh-adapter/backend
npm run oauth-setup
```

脚本会：

1. 打开浏览器跳转到 Jihu GitLab 应用授权页面；
2. 指引你创建 / 使用一个 GitLab Application（注意 Redirect URI）；
3. 在本地写入访问 CodeRider 所需的 Access Token 配置；
4. 后端启动时自动读取配置并用于请求 Jihu CodeRider。

> 如果你在服务器上部署，建议先在本地完成一次 OAuth 初始化并带上生成的配置文件，或手动配置环境变量。

#### 3. 启动前端（`frontend/`）

1. 安装依赖并启动开发服务器：

   ```bash
   cd Jh-adapter/frontend
   npm install
   npm run dev
   ```

2. 浏览器访问：

   ```text
   http://127.0.0.1:5173
   ```

3. 配置前端连接的后端地址（开发环境）：

   在 `frontend/.env.local` 中新增或修改：

   ```bash
   VITE_API_BASE_URL=http://127.0.0.1:8000/v1
   ```

   保存后重新启动前端或让 Vite 自动热更新。

---

## 部署方式详解

### 方式一：使用 Docker 自建服务器（推荐）

**适用场景：**

- 有自己的服务器 / 云主机；
- 希望控制数据和网络环境；
- 对 Docker 有基本了解。

**步骤：**

1. 在服务器上安装 Docker（略）。
2. 克隆仓库：

   ```bash
   git clone https://github.com/zhengui666/Jh-adapter.git
   cd Jh-adapter
   ```

3. 根据需要调整 `docker-compose.yml` 中：

   - 端口映射（默认为 8000 / 5173）；
   - 数据卷（默认 SQLite 文件 `jihu_proxy.db` 会挂载在宿主机目录）。

4. 启动：

   ```bash
   docker compose up -d
   ```

5. 在浏览器中访问前端 / API，确认运行正常：

   - 前端：`http://你的服务器IP:5173`
   - API：`http://你的服务器IP:8000/v1`

6. 配合 Nginx / Caddy 等网关做反向代理与 HTTPS 即可投入使用。

---

### 方式二：Node.js 后端部署到 Vercel + 前端静态托管

#### 1. 将 `backend` 部署到 Vercel

1. 在 Vercel 控制台点击「New Project」，选择 Jh-adapter 仓库。
2. 选择 **Root Directory = `backend`**。
3. 构建命令建议设置为：

   - Install Command：`npm install`
   - Build Command：`npm run build`
   - Start Command：自动推导或使用 Vercel 的 Node 运行模式。

4. 部署完成后，记下后端域名：

   ```text
   https://<your-backend>.vercel.app
   ```

   对应的 API 前缀为：

   ```text
   https://<your-backend>.vercel.app/v1
   ```

5. 在 Vercel 项目「Settings → Environment Variables」中配置环境变量（详见后文）。

#### 2. 前端部署到任意静态托管（以 GitHub Pages 为例）

1. 本地构建前端：

   ```bash
   cd Jh-adapter/frontend
   npm install
   VITE_API_BASE_URL=https://<your-backend>.vercel.app/v1 npm run build
   ```

2. 将 `frontend/dist` 上传到：

   - GitHub Pages；
   - Vercel Static Site；
   - Cloudflare Pages；
   - 或任何静态文件服务器。

3. 前端部署完成后，即可通过浏览器访问前端 URL，前端会向 Vercel 后端发起 API 请求。

> 如你使用 GitHub Actions 自动部署，只需在仓库变量中设置 `VITE_API_BASE_URL`，然后让工作流在构建时读取即可。

---

### 方式三：Cloudflare Workers + D1 无服务器部署（保姆级）

Cloudflare 方案使用 `backend-cloudflare` 中的 Worker 代码和 D1 数据库，行为与 Node 版本尽量保持一致，但运行在 Cloudflare 边缘节点上，延迟更低。

#### 第 0 步：准备工作

- 一个 Cloudflare 账号；
- 本地安装 `Node.js`（建议 18+）；
- 本地安装 `wrangler`：

  ```bash
  npm install -g wrangler
  ```

- 使用 Cloudflare 登录：

  ```bash
  wrangler login
  ```

#### 第 1 步：创建 D1 数据库

**方式 A：Cloudflare Dashboard 创建（推荐）**

1. 打开 `https://dash.cloudflare.com/` 并登录。
2. 左侧菜单选择 **Workers & Pages → D1**。
3. 点击 **Create database**。
4. 填写：
   - **Database name**：`JH_ADAPTER_DB`（或任意名字，但要和配置保持一致）。
   - **Region**：选择离你用户最近的区域。
5. 创建成功后，进入该数据库的 **Settings** 页面，复制 **Database ID**（UUID 形式）。

**方式 B：使用 Wrangler CLI 创建**

```bash
cd Jh-adapter
wrangler d1 create JH_ADAPTER_DB
```

命令输出中会包含一段：

```text
[[d1_databases]]
binding = "DB"
database_name = "JH_ADAPTER_DB"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

复制其中的 `database_id`。

#### 第 2 步：配置 D1 数据库绑定

**方式 A：通过 GitHub Secrets 自动配置（推荐）**

1. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：
   - `CLOUDFLARE_D1_DATABASE_ID`: 你的 D1 数据库 ID

2. GitHub Actions 会在每次部署后自动配置 D1 绑定。

**方式 B：在 Cloudflare Dashboard 中手动配置**

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 你的 Worker (`jh-adapter-backend`)
3. 进入 **Settings** → **Variables**
4. 在 **D1 Database Bindings** 部分，点击 **Add binding**
5. 配置：
   - **Variable name**: `DB`
   - **Database**: 选择 `JH_ADAPTER_DB`
6. 点击 **Save**

> **注意：** 我们**不在** `wrangler.toml` 中硬编码 D1 绑定，以避免每次部署时配置丢失。绑定通过部署后脚本或 Dashboard 配置。

#### 第 3 步：初始化 D1 数据库表结构

在项目根目录执行：

```bash
wrangler d1 execute JH_ADAPTER_DB --file=backend-cloudflare/schema.sql
```

如果你想先在本地仿真数据库（开发环境）：

```bash
wrangler d1 execute JH_ADAPTER_DB --local --file=backend-cloudflare/schema.sql
```

执行成功后，你可以检查是否创建了预期的表：

```bash
wrangler d1 execute JH_ADAPTER_DB --command="SELECT name FROM sqlite_master WHERE type='table';"
```

应包含：

- `settings`
- `users`
- `api_keys`
- `api_usage`
- `registration_requests`
- `sessions`

#### 第 4 步：配置 Worker 环境变量

在 Cloudflare Dashboard 中：

1. 打开你的 Worker；
2. 进入 **Settings → Variables**；
3. 设置以下环境变量（键值区分大小写）：

- `CODERIDER_HOST`（可选）
  - 默认值：`https://coderider.jihulab.com`
  - 如你使用官方 Jihu CodeRider，可不配置。
- `GITLAB_OAUTH_CLIENT_ID`（推荐配置）
- `GITLAB_OAUTH_CLIENT_SECRET`（推荐配置）
  - 用于通过网页端 `/auth/oauth-start` + `/auth/oauth-callback` 完成 OAuth 授权。
- `GITLAB_OAUTH_ACCESS_TOKEN`（可选）
  - 如果你已经有 Access Token，可以直接在这里填；Worker 会优先用它。

> Worker 获取 Access Token 的优先级为：
> 1. 环境变量 `GITLAB_OAUTH_ACCESS_TOKEN`；
> 2. D1 `settings` 表中的 `access_token`；
> 3. 均不存在时抛出 `JihuAuthExpiredError`，返回结构化的 JSON 提示你重新授权。

#### 第 5 步：部署 Worker

在项目根目录执行：

```bash
cd Jh-adapter
npm install      # 安装 wrangler / hono 依赖
npm run deploy   # 等价于：npm install && wrangler deploy
```

或直接：

```bash
npx wrangler deploy
```

部署成功后，终端会显示 Worker 的访问域名，例如：

```text
https://<your-worker>.workers.dev
```

则 API 前缀为：

```text
https://<your-worker>.workers.dev/v1
```

#### 第 6 步：通过浏览器完成 OAuth 授权（可选但推荐）

1. 在浏览器中访问：

   ```text
   https://<your-worker>.workers.dev/auth/oauth-start
   ```

2. 如果你尚未在环境变量 / D1 中配置 Client ID / Secret，页面会提示你到：
   - `https://jihulab.com/-/user_settings/applications`
   - 创建 GitLab Application 并配置 Redirect URI（页面中会显示一个类似 `https://<your-worker>.workers.dev/auth/oauth-callback` 的地址）。

3. 按页面提示在 Jihu GitLab 中完成授权。
4. 授权成功后，Worker 会将 `access_token`、`refresh_token` 等信息写入 D1 `settings` 表，后续调用 `/v1/models/full` 或聊天接口时即可通过该 token 间接访问 CodeRider。

#### 第 7 步：验证部署

1. 测试健康检查接口：

   ```bash
   curl https://<your-worker>.workers.dev/health
   ```

2. 预期返回：

   ```json
   {"status":"ok","backend":"cloudflare-worker"}
   ```

3. 如返回认证过期类错误（`jihu_auth_expired`），根据错误提示重新走一遍 OAuth 授权或更新 Access Token。

---

## 环境变量与配置说明

### Node 后端（`backend/`）

常用环境变量（通过 `.env` 或部署平台的环境配置注入）：

- `PORT`：监听端口，默认 `8000`。
- `DATABASE_PATH`：SQLite 文件路径，默认根目录 `jihu_proxy.db`。
- `CODERIDER_HOST`：CodeRider 服务地址，默认 `https://coderider.jihulab.com`。
- OAuth 相关：
  - `GITLAB_OAUTH_CLIENT_ID`
  - `GITLAB_OAUTH_CLIENT_SECRET`
  - 如使用 `npm run oauth-setup`，脚本会引导你完成配置并存储结果。

### Cloudflare 后端（`backend-cloudflare`）

在 Cloudflare Dashboard → 你的 Worker → **Settings → Variables** 中配置：

- `CODERIDER_HOST`：CodeRider 服务地址（可选）。
- `GITLAB_OAUTH_CLIENT_ID`：用于 OAuth 网页授权。
- `GITLAB_OAUTH_CLIENT_SECRET`：用于 OAuth 网页授权。
- `GITLAB_OAUTH_ACCESS_TOKEN`：直接提供 Access Token（可选）。

Cloudflare Worker 内部逻辑：

1. 优先从 `GITLAB_OAUTH_ACCESS_TOKEN` 读取 Access Token；
2. 如为空，则从 D1 `settings` 表中读取 `access_token`；
3. 两者都不存在或失效时，抛出 `JihuAuthExpiredError`，以 JSON 返回详细提示及 Jihu GitLab 应用配置链接。

---

## 前端管理面板使用说明

### 本地开发

```bash
cd Jh-adapter/frontend
npm install
npm run dev
```

浏览器访问 `http://127.0.0.1:5173` 即可使用：

- 登录 / 注册 / 登出；
- 申请 / 管理 API Key；
- 在聊天面板中测试后端接口。

### 构建与部署

1. 构建前确保指定后端 API 地址：

   ```bash
   VITE_API_BASE_URL=<你的后端地址>/v1
   ```

2. 执行构建：

   ```bash
   cd Jh-adapter/frontend
   npm run build
   ```

3. 构建产物位于 `frontend/dist`，可部署到任意静态托管（Nginx、GitHub Pages、Vercel Static、Cloudflare Pages 等）。

---

## 在 Claude Code / OpenAI 兼容客户端中使用

本项目可以作为 Claude Code 或任意支持「自定义 OpenAI 兼容后端」的客户端的后端。

典型流程：

1. 使用任一方式（Docker / Vercel / Cloudflare 等）部署好后端。
2. 打开前端管理面板，注册并登录账号。
3. 在前端「API Key 管理」中创建一个新的 API Key，并妥善保存。
4. 在 Claude Code / 自定义客户端配置中：
   - **Base URL**：填入你的后端地址，例如：
     - `https://<your-backend>.vercel.app/v1`
     - `https://<your-worker>.workers.dev/v1`
   - **API Key**：填入在前端创建的 API Key（客户端通常会自动加入 `Authorization: Bearer xxx`，后端会将其映射为 `X-API-Key`）。
   - **模型名称**：从 `/v1/models` 或 `/v1/models/full` 的返回中选择一个 `id` 作为模型名。
5. 保存配置后，即可在 IDE / 客户端中通过 Jh-adapter 调用 Jihu CodeRider。

> 请务必避免在公开仓库、截图、日志等位置泄露你的后端地址和 API Key。

---

## 常见问题（FAQ）

- **Q：Cloudflare 日志中出现 D1 相关的 `10021` 错误怎么办？**  
  **A：** 通常是 `wrangler.toml` 中的 `database_id` 仍为占位符。请前往 Cloudflare D1 控制台复制真实的 Database ID，更新到 `wrangler.toml` 后重新部署。

- **Q：前端总是请求 `localhost`，而不是我部署的后端？**  
  **A：** 检查构建前是否正确设置 `VITE_API_BASE_URL`。如果使用 CI（如 GitHub Actions）构建前端，需要在仓库变量 / Secret 中设置该值。

- **Q：调用 `/v1/models/full` 或聊天接口提示认证过期 / `jihu_auth_expired`？**  
  **A：** 说明 GitLab / Jihu 的 Access Token 失效或未配置。请：
  - Node 版：重新运行 `npm run oauth-setup`，或更新相关环境变量；
  - Cloudflare 版：通过 `/auth/oauth-start` 重新授权，或在环境变量 / D1 中更新 token。

- **Q：Cloudflare 报错 `Could not resolve 'hono'`？**  
  **A：** 通常是部署时未执行 `npm install`。在 Cloudflare 的构建命令中使用：

  ```bash
  npm install && npx wrangler deploy
  ```

  或在本地执行 `npm install` 后使用 `wrangler deploy`。

---

## 贡献与许可证

- 欢迎通过 Issue / Pull Request 提交 Bug 反馈或功能改进建议。
- 如仓库中包含 `LICENSE` 文件，则以该文件为准；如未提供，则默认保留作者所有权利。
