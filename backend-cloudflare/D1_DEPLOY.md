# Cloudflare D1 数据库部署指南

本指南将帮助你完成 Cloudflare D1 数据库的创建、初始化和绑定。

## 📋 前置要求

- Cloudflare 账号
- 已安装 `wrangler` CLI（`npm install -g wrangler` 或 `npm install wrangler --save-dev`）
- 已通过 `wrangler login` 登录 Cloudflare

## 🚀 步骤一：创建 D1 数据库

### 方式 A：使用 Cloudflare Dashboard（推荐）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择你的账户
3. 在左侧菜单找到 **Workers & Pages** → **D1**
4. 点击 **Create database**
5. 填写信息：
   - **Database name**: `JH_ADAPTER_DB`（或你喜欢的名字）
   - **Region**: 选择离你最近的区域（例如 `apac`、`weur`、`wnam`）
6. 点击 **Create**
7. 创建成功后，在数据库列表中点击你的数据库，进入详情页
8. 在 **Settings** 标签页，找到 **Database ID**，复制这个 ID（格式类似：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）

### 方式 B：使用 Wrangler CLI

```bash
cd backend-cloudflare

# 创建数据库
wrangler d1 create JH_ADAPTER_DB

# 输出示例：
# ✅ Successfully created DB 'JH_ADAPTER_DB'!
# 
# [[d1_databases]]
# binding = "DB"
# database_name = "JH_ADAPTER_DB"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

复制输出的 `database_id`。

## 🔧 步骤二：更新 wrangler.toml

编辑项目根目录的 `wrangler.toml`，将 `database_id` 替换为你刚才复制的 ID：

```toml
[[d1_databases]]
binding = "DB"
database_name = "JH_ADAPTER_DB"
database_id = "你的实际 database_id"  # 替换这里
```

## 📊 步骤三：初始化数据库 Schema

### 方式 A：使用 Wrangler CLI（推荐）

在项目根目录执行：

```bash
# 执行 SQL schema 文件
wrangler d1 execute JH_ADAPTER_DB --file=backend-cloudflare/schema.sql

# 或者直接在本地测试数据库执行（用于开发）
wrangler d1 execute JH_ADAPTER_DB --local --file=backend-cloudflare/schema.sql
```

### 方式 B：使用 Cloudflare Dashboard

1. 进入 D1 数据库详情页
2. 点击 **Console** 标签页
3. 将 `backend-cloudflare/schema.sql` 的内容复制粘贴到 SQL 编辑器中
4. 点击 **Run** 执行

### 方式 C：逐条执行（如果批量执行失败）

如果一次性执行整个 schema 失败，可以逐条执行：

```bash
# 创建 settings 表
wrangler d1 execute JH_ADAPTER_DB --command="CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);"

# 创建 users 表
wrangler d1 execute JH_ADAPTER_DB --command="CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);"

# 创建 api_keys 表
wrangler d1 execute JH_ADAPTER_DB --command="CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, key TEXT UNIQUE NOT NULL, name TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));"

# 创建 api_usage 表
wrangler d1 execute JH_ADAPTER_DB --command="CREATE TABLE IF NOT EXISTS api_usage (api_key_id INTEGER PRIMARY KEY, total_input_tokens INTEGER NOT NULL DEFAULT 0, total_output_tokens INTEGER NOT NULL DEFAULT 0, total_requests INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, FOREIGN KEY(api_key_id) REFERENCES api_keys(id));"

# 创建 registration_requests 表
wrangler d1 execute JH_ADAPTER_DB --command="CREATE TABLE IF NOT EXISTS registration_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);"

# 创建 sessions 表
wrangler d1 execute JH_ADAPTER_DB --command="CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));"
```

## ✅ 步骤四：验证 Schema

检查表是否创建成功：

```bash
# 列出所有表
wrangler d1 execute JH_ADAPTER_DB --command="SELECT name FROM sqlite_master WHERE type='table';"
```

应该看到以下表：

- `settings`
- `users`
- `api_keys`
- `api_usage`
- `registration_requests`
- `sessions`

## 🚀 步骤五：部署 Worker

确保 `wrangler.toml` 中的 `database_id` 已正确配置，然后部署：

```bash
# 在项目根目录
wrangler deploy
```

或者使用一键部署按钮（GitHub 仓库页面）：

[![Deploy Backend to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fzhengui666%2FJh-adapter&projectName=jh-adapter-backend-cloudflare)

## 🔍 步骤六：验证部署

部署成功后，测试健康检查接口：

```bash
curl https://your-worker.your-subdomain.workers.dev/health
```

应该返回：

```json
{"status":"ok","backend":"cloudflare-worker"}
```

## 🛠️ 本地开发（可选）

如果你想在本地测试 Worker 和 D1：

```bash
# 创建本地 D1 数据库（用于开发）
wrangler d1 execute JH_ADAPTER_DB --local --file=backend-cloudflare/schema.sql

# 启动本地开发服务器
wrangler dev
```

本地开发时，Worker 会连接到本地 D1 数据库副本。

## 📝 常用 D1 管理命令

```bash
# 查看数据库列表
wrangler d1 list

# 查看数据库信息
wrangler d1 info JH_ADAPTER_DB

# 执行 SQL 查询
wrangler d1 execute JH_ADAPTER_DB --command="SELECT * FROM users;"

# 导出数据库（备份）
wrangler d1 export JH_ADAPTER_DB --output=backup.sql

# 导入数据库（恢复）
wrangler d1 execute JH_ADAPTER_DB --file=backup.sql
```

## ⚠️ 注意事项

1. **数据库 ID 是唯一的**：每个 D1 数据库都有一个唯一的 `database_id`，不要混淆不同数据库的 ID
2. **生产环境备份**：定期使用 `wrangler d1 export` 备份数据库
3. **本地开发**：本地开发时使用 `--local` 标志，不会影响生产数据库
4. **外键约束**：D1 支持外键，但需要确保插入顺序正确（先插入被引用表，再插入引用表）
5. **数据库区域**：选择离你的用户最近的区域，以减少延迟

## 🐛 故障排查

### 问题：`database_id` 找不到

- 检查 Cloudflare Dashboard 中数据库的 **Settings** 页面，确认 ID 正确
- 确保 `wrangler.toml` 中的 `database_name` 和 `database_id` 都正确

### 问题：表创建失败

- 检查 SQL 语法是否正确
- 尝试逐条执行 SQL 语句，定位问题表
- 查看 Cloudflare Dashboard 的 D1 Console 错误信息

### 问题：Worker 无法访问 D1

- 确认 `wrangler.toml` 中的 `[[d1_databases]]` 配置正确
- 确认 Worker 已成功部署
- 检查 Worker 日志（Cloudflare Dashboard → Workers → 你的 Worker → Logs）

## 📚 参考文档

- [Cloudflare D1 官方文档](https://developers.cloudflare.com/d1/)
- [Wrangler D1 命令参考](https://developers.cloudflare.com/workers/wrangler/commands/#d1)

