# Jh-adapter

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)

一个把 **Jihu CodeRider** 的聊天能力封装成 **OpenAI / Claude 兼容 API** 的小型网关，同时内置用户体系、API Key 管理和简单管理界面，方便自建或团队内部使用。

你可以像调用 OpenAI 一样调用本项目的 `/v1/chat/completions`、`/v1/messages` 等接口，底层则由 Jh-adapter 自动对接 Jihu CodeRider。

## ✨ 功能特性

- **OpenAI 风格接口**
  - `/v1/chat/completions` - 聊天完成接口
  - `/v1/models` - 模型列表（精简版）
  - `/v1/models/full` - 模型列表（完整版，包含模型元信息）

- **Claude 风格接口**
  - `/v1/messages` - Claude Messages API 兼容

- **账号与权限**
  - 注册 / 登录 / 退出登录
  - 管理员审核注册请求（首个注册用户自动成为管理员）
  - 用户维度的 Session 管理

- **API Key 管理**
  - 用户自助创建 / 启用 / 停用 API Key
  - 通过请求头 `X-API-Key` 或 `Authorization: Bearer` 使用
  - 支持按 API Key 记录用量统计

- **多种部署方式**
  - 🐳 Docker 一键启动（推荐新手）
  - ☁️ Vercel（Node.js 后端）+ 静态托管（前端）
  - ⚡ Cloudflare Workers + D1（无服务器部署，延迟低）

## 🚀 快速开始

### 使用 Docker（推荐）

```bash
git clone https://github.com/zhengui666/Jh-adapter.git
cd Jh-adapter
docker compose up -d
```

访问：
- **前端管理面板**：`http://127.0.0.1:5173`
- **后端 API**：`http://127.0.0.1:8000/v1`

第一次注册的账号会自动成为管理员。

### 本地开发

#### 1. 启动后端

```bash
cd backend
npm install
npm run build
npm run start  # 默认端口 8000
```

#### 2. 初始化 OAuth（必需）

```bash
cd backend
npm run oauth-setup
```

脚本会引导你完成 GitLab OAuth 配置。

#### 3. 启动前端

```bash
cd frontend
npm install
npm run dev  # 默认端口 5173
```

## 📦 部署方式

### 方式一：Docker 自建（推荐生产环境）

适合有自己的服务器/云主机的场景。

```bash
git clone https://github.com/zhengui666/Jh-adapter.git
cd Jh-adapter
docker compose up -d
```

详细步骤请参考 [部署文档](docs/DEPLOYMENT.md#docker)。

### 方式二：Vercel + 静态托管

适合快速部署和演示。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&project-name=jh-adapter-backend&repository-name=Jh-adapter)

详细步骤请参考 [部署文档](docs/DEPLOYMENT.md#vercel)。

### 方式三：Cloudflare Workers + D1

适合无服务器部署，延迟低、维护成本小。

[![Deploy Backend to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&projectName=jh-adapter-backend-cloudflare)

**重要**：一键部署后，必须完成以下配置才能正常使用：

1. **创建 D1 数据库**
   - 在 Cloudflare Dashboard → Workers & Pages → D1 中创建数据库
   - 数据库名称：`JH_ADAPTER_DB`
   - 复制 Database ID

2. **配置 D1 绑定**（必需）
   - 在 Worker 的 Settings → Variables → D1 Database Bindings 中添加绑定
   - Variable name: `DB`
   - Database: 选择 `JH_ADAPTER_DB`

3. **初始化数据库**
   ```bash
   wrangler d1 execute JH_ADAPTER_DB --file=backend-cloudflare/schema.sql
   ```

4. **配置环境变量**
   - 在 Worker Settings → Variables 中设置：
     - `GITLAB_OAUTH_CLIENT_ID`
     - `GITLAB_OAUTH_CLIENT_SECRET`
     - `GITLAB_OAUTH_ACCESS_TOKEN`（可选）

5. **完成 OAuth 授权**
   - 访问 `https://your-worker.workers.dev/auth/oauth-start`
   - 按页面提示完成授权

详细步骤请参考 [Cloudflare 部署文档](docs/DEPLOYMENT.md#cloudflare-workers-部署)。

## 📖 文档

- [部署文档](docs/DEPLOYMENT.md) - 详细的部署指南
- [配置说明](docs/CONFIGURATION.md) - 环境变量和配置说明
- [API 文档](docs/API.md) - API 端点详细说明
- [常见问题](docs/FAQ.md) - FAQ 和故障排查

## 🏗️ 项目结构

```
Jh-adapter/
├── backend/                 # Node.js + Express 后端（SQLite）
│   └── src/
│       ├── domain/          # 领域层
│       ├── core/            # 核心业务逻辑
│       ├── application/     # 应用层
│       ├── infrastructure/  # 基础设施层
│       ├── shared/          # 共享工具
│       └── presentation/   # 表现层（控制器）
├── backend-cloudflare/      # Cloudflare Workers 版本（D1）
├── frontend/                # Vue 3 前端管理面板
├── docker-compose.yml       # Docker 生产配置
├── wrangler.toml            # Cloudflare Workers 配置
└── docs/                    # 文档目录
```

详细架构说明请参考 [backend/README.md](backend/README.md)。

## 🔧 配置

### 环境变量

#### Node.js 后端

- `PORT` - 监听端口（默认：8000）
- `CODERIDER_HOST` - CodeRider 服务地址（默认：https://coderider.jihulab.com）
- `GITLAB_OAUTH_CLIENT_ID` - GitLab OAuth Client ID
- `GITLAB_OAUTH_CLIENT_SECRET` - GitLab OAuth Client Secret

#### Cloudflare Workers

在 Cloudflare Dashboard → Worker Settings → Variables 中配置：

- `CODERIDER_HOST` - CodeRider 服务地址（可选）
- `GITLAB_OAUTH_CLIENT_ID` - GitLab OAuth Client ID
- `GITLAB_OAUTH_CLIENT_SECRET` - GitLab OAuth Client Secret
- `GITLAB_OAUTH_ACCESS_TOKEN` - GitLab OAuth Access Token（可选）

详细配置说明请参考 [配置文档](docs/CONFIGURATION.md)。

## 💻 在客户端中使用

本项目可以作为 Claude Code、Cline 或任意支持「自定义 OpenAI 兼容后端」的客户端的后端。

### 配置步骤

1. 部署后端（Docker / Vercel / Cloudflare 任一方式）
2. 访问前端管理面板，注册并登录
3. 创建 API Key
4. 在客户端中配置：
   - **Base URL**：`https://your-backend.com/v1`
   - **API Key**：在前端创建的 API Key
   - **模型名称**：从 `/v1/models` 返回的模型 ID

详细步骤请参考 [API 文档](docs/API.md)。

## 🤝 贡献

欢迎通过 Issue / Pull Request 提交 Bug 反馈或功能改进建议。

请阅读 [贡献指南](CONTRIBUTING.md) 了解如何参与项目。

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 🔗 相关链接

- [Jihu CodeRider](https://coderider.jihulab.com)
- [项目 Issues](https://github.com/zhengui666/Jh-adapter/issues)
- [项目 Discussions](https://github.com/zhengui666/Jh-adapter/discussions)

---

**注意**：请务必避免在公开仓库、截图、日志等位置泄露你的后端地址和 API Key。
