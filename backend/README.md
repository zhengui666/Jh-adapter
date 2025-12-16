# Jihu CodeRider Backend (TypeScript/Node.js)

TypeScript/Node.js 版本的后端服务，与前端使用相同的技术栈。

## 安装

```bash
cd backend
npm install
```

## 开发

```bash
npm run dev
```

服务器将在 `http://127.0.0.1:8000` 启动。

## 构建

```bash
npm run build
npm start
```

## OAuth 设置

首次使用需要配置 GitLab OAuth：

```bash
npm run oauth-setup
```

## 架构

采用 DDD (Domain-Driven Design) 架构：

```
backend/src/
├── domain/              # 领域层
│   ├── entities.ts      # 实体（User, ApiKey, Session等）
│   ├── value-objects.ts # 值对象
│   └── exceptions.ts    # 领域异常
├── application/         # 应用层
│   └── services.ts      # 业务服务（AuthService, ApiKeyService, ChatService）
├── infrastructure/      # 基础设施层
│   ├── repositories.ts  # Repository接口
│   ├── sqlite-repositories.ts  # SQLite实现
│   ├── jihu-client.ts   # Jihu API客户端
│   ├── oauth-service.ts # OAuth认证服务
│   ├── oauth-flow.ts    # OAuth流程处理
│   ├── config.ts        # 配置管理
│   └── dependencies.ts  # 依赖注入
└── presentation/        # 表现层
    └── routes.ts        # Express路由
```

## 环境变量

- `PORT` - 服务器端口（默认：8000）
- `CODERIDER_HOST` - CodeRider API地址（默认：https://coderider.jihulab.com）
- `CODERIDER_MODEL` - 默认模型（默认：maas/maas-chat-model）
- `GITLAB_OAUTH_ACCESS_TOKEN` - GitLab OAuth access token
- `GITLAB_OAUTH_REFRESH_TOKEN` - GitLab OAuth refresh token
- `GITLAB_OAUTH_CLIENT_ID` - GitLab OAuth client ID
- `GITLAB_OAUTH_CLIENT_SECRET` - GitLab OAuth client secret

## API 端点

### OpenAI 兼容接口
- `POST /v1/chat/completions` - 聊天完成
- `GET /v1/models` - 模型列表（简单）
- `GET /v1/models/full` - 模型列表（完整）

### Claude 兼容接口
- `POST /v1/messages` - Claude Messages API

### 认证接口
- `POST /auth/register` - 注册账号
- `POST /auth/login` - 登录
- `POST /auth/logout` - 登出
- `GET /auth/oauth-start` - 启动OAuth流程
- `GET /auth/oauth-callback` - OAuth回调

### API Key 管理
- `GET /auth/api-keys` - 列出当前用户的API Key
- `POST /auth/api-keys` - 创建新的API Key

### 管理员接口
- `GET /admin/api-keys` - 列出所有API Key
- `GET /admin/registrations` - 列出待处理的注册请求
- `POST /admin/registrations/:id/approve` - 批准注册请求
- `POST /admin/registrations/:id/reject` - 拒绝注册请求

### 健康检查
- `GET /health` - 健康检查

## 数据持久化

- SQLite数据库：`jihu_proxy.db`（与Python版本兼容）
- OAuth配置：`jihu_oauth_config.json`（与Python版本兼容）

## 技术栈

- **运行时**：Node.js 20+
- **语言**：TypeScript
- **框架**：Express
- **数据库**：better-sqlite3
- **HTTP客户端**：axios
- **密码哈希**：bcrypt

## 与Python版本的兼容性

- ✅ API接口完全兼容
- ✅ 数据库格式兼容（可直接使用现有数据库）
- ✅ OAuth配置格式兼容
- ✅ 环境变量兼容
