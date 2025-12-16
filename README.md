# Jihu CodeRider OpenAI Proxy

一个将 **Jihu CodeRider** 插件背后的聊天能力，以 **OpenAI Chat Completions 兼容接口** 暴露出来的代理服务。

## ✨ 特性

- 🚀 **完全兼容 OpenAI API**：支持标准的 `/v1/chat/completions` 和 `/v1/models` 接口
- 🔐 **自动 OAuth 认证**：通过 GitLab OAuth 自动获取和刷新访问令牌
- 🎯 **Claude API 兼容**：支持 Claude Messages API (`/v1/messages`)
- 👥 **用户管理系统**：支持用户注册、登录、API Key 管理
- 📊 **使用统计**：自动记录 API 调用量和 Token 使用情况
- 🐳 **Docker 支持**：一键部署前后端服务
- 🎨 **现代化前端**：Vue 3 + TypeScript 管理界面

## 🏗️ 技术栈

### 后端
- **运行时**：Node.js 20+
- **语言**：TypeScript
- **框架**：Express
- **数据库**：SQLite (better-sqlite3)
- **架构**：DDD (Domain-Driven Design)

### 前端
- **框架**：Vue 3
- **构建工具**：Vite
- **语言**：TypeScript

## 📦 快速开始

### 方式一：手动运行

#### 1. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖（可选，如果需要修改前端）
cd ../frontend
npm install
```

#### 2. OAuth 配置（首次使用）

在项目根目录执行：

```bash
cd backend
npm run oauth-setup
```

脚本会引导你：
1. 在 [Jihu GitLab](https://jihulab.com/-/user_settings/applications) 创建 OAuth 应用
2. 输入 Application ID 和 Secret
3. 自动打开浏览器完成授权
4. 保存配置到 `jihu_oauth_config.json`

> 💡 提示：配置会同时保存到 SQLite 数据库，后续可直接复用。

#### 3. 启动服务

**后端：**
```bash
cd backend
npm run dev        # 开发模式
npm start          # 生产模式（需要先构建: npm run build）
```

**前端（可选）：**
```bash
cd frontend
npm run dev
```

服务启动后：
- 后端 API：`http://127.0.0.1:8000`
- 前端界面：`http://127.0.0.1:5173`

### 方式二：托管后端到 Vercel / Cloudflare，前端用 GitHub Pages

你可以一键把后端部署到 Vercel 或 Cloudflare，前端仍然通过 GitHub Pages 部署，只需要在前端构建时把后端的 URL 写进 `VITE_API_BASE_URL`。

- **后端（Vercel - Node.js + SQLite）**  
  [![Deploy Backend to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&project-name=jh-adapter-backend&repository-name=Jh-adapter&root-directory=backend)

- **后端（Cloudflare Workers / Pages Functions，实验中，仅 /health 可用）**  
  [![Deploy Backend to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&projectName=jh-adapter-backend-cloudflare&directory=backend-cloudflare)

> ⚠️ **注意（后端数据持久化）**：不论是 Vercel 还是 Cloudflare，Serverless 环境中的本地文件系统（包括 SQLite）都不是强持久化存储，适合演示和轻量使用。如果需要长期稳定的数据，请优先使用 Docker 或自建服务器部署。

部署完成后：

1.  先在 Vercel 或 Cloudflare 中部署 **后端\9879>ee**（backend）并记下它的域名，f8b982：  
    - Vercel：`https://jh-adapter-backend-yourid.vercel.app`  
    - Cloudflare：`https://your-worker-name.your-subdomain.workers.dev`
2.  然后在 GitHub Actions 的 `frontend-pages.yml` 中，将：

    - `VITE_API_BASE_URL` 设置为对应的后端地址（建议通过 GitHub Actions 的 Repository Variables 注入）。

    重新部署前端后，GitHub Pages 上的前端会自动请求这个后端。

### 方式三：Docker 部署（推荐）

#### 1. 构建并启动

```bash
# 在项目根目录执行
docker compose up -d
```

首次运行会自动构建镜像，后续启动会更快。

#### 2. 访问服务

- 后端 API：`http://127.0.0.1:8000`
- 前端界面：`http://127.0.0.1:5173`

#### 3. 数据持久化

以下文件会自动挂载到宿主机，确保数据不丢失：
- `./jihu_proxy.db` - 用户数据、API Key、使用统计
- `./jihu_oauth_config.json` - OAuth 配置和令牌

可以安全地 `docker compose down` 和 `docker compose up -d`，数据不会丢失。

#### 4. 查看日志

```bash
# 查看所有服务日志
docker compose logs -f

# 只查看后端日志
docker compose logs -f backend

# 只查看前端日志
docker compose logs -f frontend
```

#### 5. 停止服务

```bash
docker compose down
```

## 🔌 API 使用

### OpenAI 兼容接口

#### Python SDK 示例

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8000/v1",
    api_key="your-api-key",  # 需要先注册账号并创建 API Key
)

response = client.chat.completions.create(
    model="maas-minimax-m2",  # 或 maas-deepseek-v3.1, maas-glm-4.6
    messages=[
        {"role": "user", "content": "你好，请介绍一下自己"}
    ],
    stream=False
)

print(response.choices[0].message.content)
```

#### curl 示例

```bash
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "model": "maas-minimax-m2",
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

### Claude API 兼容接口

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

### 获取可用模型列表

```bash
# 简单列表
curl http://127.0.0.1:8000/v1/models

# 完整列表（包含模型详细信息）
curl http://127.0.0.1:8000/v1/models/full
```

## 🤖 Claude Code 配置

[Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) 是 Anthropic 的 AI 编程助手，可以配置使用这个代理服务。

### 环境变量配置

```bash
# 设置 Claude Code 使用代理服务
export ANTHROPIC_BASE_URL="http://127.0.0.1:8000"
export ANTHROPIC_API_KEY="your-api-key"

# 启动 Claude Code
claude
```

### 配置说明

1. **ANTHROPIC_BASE_URL**：代理服务的URL
   - 本地部署：`http://127.0.0.1:8000`
   - Docker 部署：`http://127.0.0.1:8000`

2. **ANTHROPIC_API_KEY**：你的API密钥
   - 需要先通过前端界面或API创建API Key

### 支持的模型

在 Claude Code 中，你可以使用以下模型：

- `claude-sonnet-4-5-20250929` (对应 `maas-minimax-m2`)
- `claude-haiku-4-5-20251001` (对应 `maas-deepseek-v3.1`)
- `claude-opus-4-5-20251101` (对应 `maas-glm-4.6`)

### 示例使用

```bash
# 设置环境变量
export ANTHROPIC_BASE_URL="http://127.0.0.1:8000"
export ANTHROPIC_API_KEY="your-api-key"

# 启动 Claude Code
claude

# 在 Claude Code 中切换模型
/model claude-sonnet-4-5-20250929
```

### 永久配置

将环境变量添加到你的 shell 配置中：

```bash
# ~/.bashrc 或 ~/.zshrc
echo 'export ANTHROPIC_BASE_URL="http://127.0.0.1:8000"' >> ~/.zshrc
echo 'export ANTHROPIC_API_KEY="your-api-key"' >> ~/.zshrc
source ~/.zshrc
```

### Docker 环境注意事项

如果使用 Docker 部署，确保端口映射正确：

```bash
# 检查端口映射
docker compose ps

# 如果需要修改端口映射，编辑 docker-compose.yml
ports:
  - "8000:8000"  # 宿主机端口:容器端口
```

## 🔐 用户管理

### 注册账号

第一个注册的用户会自动成为管理员，后续用户需要管理员批准。

```bash
curl -X POST http://127.0.0.1:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "myuser",
    "password": "mypassword123"
  }'
```

### 登录

```bash
curl -X POST http://127.0.0.1:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "myuser",
    "password": "mypassword123"
  }'
```

返回的 `session_token` 用于需要会话验证的操作。

### 创建 API Key

```bash
curl -X POST http://127.0.0.1:8000/auth/api-keys \
  -H "Content-Type: application/json" \
  -H "X-API-Key: existing-api-key" \
  -H "X-Session-Token: your-session-token" \
  -d '{
    "name": "my-api-key"
  }'
```

## 📁 项目结构

```
jihu_proxy/
├── backend/                    # TypeScript 后端
│   ├── src/
│   │   ├── domain/            # 领域层（实体、值对象、异常）
│   │   ├── application/       # 应用层（业务服务）
│   │   ├── infrastructure/    # 基础设施层（Repository、外部服务）
│   │   ├── presentation/      # 表现层（Express 路由）
│   │   ├── scripts/          # 工具脚本
│   │   └── index.ts          # 主入口
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # Vue 3 前端
│   ├── src/
│   │   ├── components/        # Vue 组件
│   │   └── App.vue           # 主应用
│   └── package.json
├── Dockerfile.backend         # 后端 Docker 镜像
├── Dockerfile.frontend        # 前端 Docker 镜像
├── docker-compose.yml         # Docker Compose 配置
├── install.sh                 # macOS 一键安装脚本
├── start.sh                   # 启动脚本
├── stop.sh                    # 停止脚本
├── jihu_proxy.db             # SQLite 数据库（自动创建）
├── jihu_oauth_config.json    # OAuth 配置（自动创建）
└── README.md                 # 本文档
```

## ⚙️ 环境变量

### 后端环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `8000` |
| `NODE_ENV` | 运行环境 | `production` |
| `CODERIDER_HOST` | CodeRider API 地址 | `https://coderider.jihulab.com` |
| `CODERIDER_MODEL` | 默认模型 | `maas/maas-chat-model` |
| `GITLAB_OAUTH_ACCESS_TOKEN` | GitLab OAuth Access Token | - |
| `GITLAB_OAUTH_REFRESH_TOKEN` | GitLab OAuth Refresh Token | - |
| `GITLAB_OAUTH_CLIENT_ID` | GitLab OAuth Client ID | - |
| `GITLAB_OAUTH_CLIENT_SECRET` | GitLab OAuth Client Secret | - |

> 💡 提示：OAuth 配置优先从 SQLite 数据库读取，其次从 `jihu_oauth_config.json` 读取，最后从环境变量读取。

### 前端环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `VITE_API_BASE_URL` | 后端 API 基础地址 | `http://localhost:8000/v1` |

在 Docker 环境中，`VITE_API_BASE_URL` 会在构建时通过 `docker-compose.yml` 自动设置为 `http://backend:8000/v1`。

## 🔧 开发指南

### 后端开发

```bash
cd backend

# 安装依赖
npm install

# 开发模式（自动重载）
npm run dev

# 类型检查
npm run type-check

# 构建
npm run build

# 生产模式
npm start
```

### 前端开发

```bash
cd frontend

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 预览构建结果
npm run preview
```

## 🐛 故障排查

### OAuth 认证失败

1. 检查 `jihu_oauth_config.json` 是否存在且格式正确
2. 运行 `npm run oauth-setup` 重新配置
3. 确认 GitLab 应用的 Redirect URI 设置为 `http://127.0.0.1:8000/auth/oauth-callback`

### 数据库连接问题

- 确保 `jihu_proxy.db` 文件有读写权限
- 在 Docker 环境中，检查 volume 挂载是否正确

### 前端无法连接后端

- 检查 `VITE_API_BASE_URL` 环境变量是否正确
- 在 Docker 环境中，确保前端容器能访问 `backend` 服务
- 检查浏览器控制台的网络请求错误

## 📝 API 文档

### 认证端点

- `POST /auth/register` - 注册账号
- `POST /auth/login` - 登录
- `POST /auth/logout` - 登出
- `GET /auth/oauth-start` - 启动 OAuth 流程
- `GET /auth/oauth-callback` - OAuth 回调处理

### API Key 管理

- `GET /auth/api-keys` - 列出当前用户的 API Key
- `POST /auth/api-keys` - 创建新的 API Key

### 管理员端点

- `GET /admin/api-keys` - 列出所有 API Key（管理员）
- `GET /admin/registrations` - 列出待处理的注册请求
- `POST /admin/registrations/:id/approve` - 批准注册请求
- `POST /admin/registrations/:id/reject` - 拒绝注册请求

### 模型端点

- `GET /v1/models` - 获取模型列表（简单）
- `GET /v1/models/full` - 获取模型列表（完整信息）

### 聊天端点

- `POST /v1/chat/completions` - OpenAI 兼容的聊天接口
- `POST /v1/messages` - Claude 兼容的消息接口

### 健康检查

- `GET /health` - 健康检查

## 🔒 安全建议

1. **生产环境**：
   - 使用 HTTPS
   - 设置强密码策略
   - 定期轮换 API Key
   - 限制 API Key 权限

2. **OAuth 配置**：
   - 不要将 `jihu_oauth_config.json` 提交到版本控制
   - 使用环境变量存储敏感信息

3. **数据库**：
   - 定期备份 `jihu_proxy.db`
   - 限制数据库文件访问权限

## 📄 许可证

本项目采用 MIT 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📚 相关文档

- [安装指南](./INSTALL.md) - 详细的安装说明和故障排查
- [Docker 部署指南](./DOCKER.md) - 详细的 Docker 使用说明
- [迁移指南](./MIGRATION.md) - 从 Python 版本迁移的说明

---

**注意**：本项目仅用于学习和研究目的，请遵守 Jihu CodeRider 的使用条款。
