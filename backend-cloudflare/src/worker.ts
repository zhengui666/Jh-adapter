import { Hono } from "hono";
import { cors } from "hono/cors";
import type { D1Database } from "@cloudflare/workers-types";
import {
  D1UserRepository,
  D1ApiKeyRepository,
  D1SessionRepository,
  D1RegistrationRequestRepository,
  D1SettingRepository,
  D1RequestLogRepository,
  type D1Env,
} from "./d1-repositories";
import { AuthenticationError, JihuAuthExpiredError } from "../../backend/src/domain/exceptions";
import { STATIC_CHAT_MODELS, stripModelPrefix } from "../../backend/src/shared/model-utils";
import { AuthService, ApiKeyService } from "../../backend/src/core/auth.js";
import { RegistrationService } from "../../backend/src/core/registration.js";
import { convertClaudeToOpenAI, buildClaudeResponse } from "../../backend/src/core/chat-claude.js";
import { splitChatPayload } from "../../backend/src/core/chat-openai.js";
import { adaptJihuToOpenAI } from "../../backend/src/core/openai-adapter.js";
import { WorkerPasswordHasher } from "./worker-password";

type Env = D1Env & {
  GITLAB_OAUTH_ACCESS_TOKEN?: string;
  CODERIDER_HOST?: string;
};

const DEFAULT_MODEL = "maas/maas-chat-model";
const DEFAULT_CODERIDER_HOST = "https://coderider.jihulab.com";

const app = new Hono<{ Bindings: Env }>();

// 全局 CORS，允许前端站点跨域访问 Worker API
app.use("/*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type", "X-API-Key", "X-Session-Token"] }));

// 处理所有路径的 OPTIONS 预检请求
app.options("/*", (c) => c.text("", 204));

function getCoderiderHost(env: Env): string {
  return env.CODERIDER_HOST || DEFAULT_CODERIDER_HOST;
}

async function getGitlabAccessToken(env: Env): Promise<string> {
  // 优先从环境变量读取
  const envToken = env.GITLAB_OAUTH_ACCESS_TOKEN;
  if (envToken) {
    return envToken;
  }

  // 从 D1 settings 表读取
  const db = env.DB as D1Database;
  const settings = new D1SettingRepository(db);
  const dbToken = await settings.get("access_token");
  if (dbToken) {
    return dbToken;
  }

  throw new JihuAuthExpiredError(
    "GitLab access token missing; please set GITLAB_OAUTH_ACCESS_TOKEN in Cloudflare 环境变量，或访问 /auth/oauth-start 完成 OAuth 授权",
  );
}

let cachedJwt: string | null = null;
let cachedJwtExp: number | null = null;

async function getCoderiderJwt(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedJwt && cachedJwtExp && now < cachedJwtExp - 60_000) {
    return cachedJwt;
  }

  const accessToken = await getGitlabAccessToken(env);
  const host = getCoderiderHost(env).replace(/\/$/, "");

  const res = await fetch(`${host}/api/v1/auth/jwt`, {
    method: "POST",
    headers: {
      "X-Access-Token": accessToken,
    },
  });

  if (res.status === 400 || res.status === 401) {
    throw new JihuAuthExpiredError(
      "coderider jwt unauthorized; 请重新在本地运行 npm run oauth-setup 或在 Cloudflare 环境变量中更新 GITLAB_OAUTH_ACCESS_TOKEN",
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`获取 JWT 失败: ${res.status} ${res.statusText} - ${text}`);
  }

  const data: any = await res.json();
  const token = data.token;
  const expRaw = data.tokenExpiresAt;
  if (!token || !expRaw) {
    throw new Error("获取 JWT 失败，返回缺少 token/tokenExpiresAt");
  }

  cachedJwt = token;
  cachedJwtExp = new Date(expRaw).getTime();
  return token;
}

function buildJihuAuthExpiredResponse(c: any, err: JihuAuthExpiredError) {
  return c.json(
    {
      detail: {
        error: "jihu_auth_expired",
        message: err.message.replace("JIHU_AUTH_EXPIRED: ", ""),
        login_url: "https://jihulab.com/-/user_settings/applications",
        hint: "Cloudflare 版本：请在 Cloudflare Dashboard 中更新 GitLab OAuth 相关环境变量，然后重试。",
      },
    },
    401,
  );
}

// 健康检查
app.get("/health", (c) => {
  return c.json({ status: "ok", backend: "cloudflare-worker" });
});

// 测试日志记录功能
app.get("/test/logging", withRequestLogging, async (c: any) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  
  if (!db) {
    return c.json({ error: "D1 database not bound" }, 500);
  }
  
  // 检查表是否存在
  try {
    const result = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_request_logs'"
    ).first();
    
    const tableExists = result !== null;
    
    // 获取日志数量
    let logCount = 0;
    if (tableExists) {
      const countResult = await db.prepare("SELECT COUNT(*) as count FROM api_request_logs").first();
      logCount = countResult?.count || 0;
    }
    
    return c.json({
      status: "ok",
      table_exists: tableExists,
      log_count: logCount,
      message: tableExists 
        ? `Table exists. Total logs: ${logCount}` 
        : "Table 'api_request_logs' does not exist. Please run schema.sql in D1 console.",
    });
  } catch (err: any) {
    return c.json({
      error: "Failed to check table",
      message: err?.message || String(err),
    }, 500);
  }
});

// 注册
app.post("/auth/register", async (c) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const userRepo = new D1UserRepository(db);
  const apiKeyRepo = new D1ApiKeyRepository(db);
  const sessionRepo = new D1SessionRepository(db);
  const body = (await c.req.json().catch(() => ({}))) as any;
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ detail: "username and password are required" }, 400);
  }

  if (password.length < 8 || /^\d+$/.test(password) || /^[a-zA-Z]+$/.test(password)) {
    return c.json(
      { detail: "password too weak: use at least 8 characters and mix letters and digits" },
      400,
    );
  }

  try {
    const passwordHasher = new WorkerPasswordHasher();
    const authService = new AuthService(userRepo, sessionRepo, passwordHasher);
    const apiKeyService = new ApiKeyService(apiKeyRepo);

    const [userId, isAdmin] = await authService.register(username, password, false);
    const [, key] = await apiKeyService.create(userId, "default");

    return c.json({
      user: { id: userId, username, is_admin: isAdmin },
      api_key: key,
      pending_approval: false,
    });
  } catch (err: any) {
    return c.json({ detail: err.message || "Bad request" }, 400);
  }
});

// 登录
app.post("/auth/login", async (c) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const userRepo = new D1UserRepository(db);
  const sessionRepo = new D1SessionRepository(db);
  const apiKeyRepo = new D1ApiKeyRepository(db);

  const body = (await c.req.json().catch(() => ({}))) as any;
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ detail: "username and password are required" }, 400);
  }

  try {
    const passwordHasher = new WorkerPasswordHasher();
    const authService = new AuthService(userRepo, sessionRepo, passwordHasher);
    const apiKeyService = new ApiKeyService(apiKeyRepo);

    const session = await authService.login(username, password);
    const keys = await apiKeyService.listUserKeys(session.userId);
    const user = await userRepo.findByUsername(username);

    if (!user) {
      return c.json({ detail: "User not found after login" }, 500);
    }

    return c.json({
      user: { id: user.id, username, is_admin: user.isAdmin || false },
      session_token: session.token,
      api_keys: keys,
    });
  } catch (err: any) {
    if (err instanceof AuthenticationError && err.message.includes("Invalid")) {
      return c.json({ detail: err.message }, 401);
    }
    return c.json({ detail: err.message || "Internal server error" }, 500);
  }
});

// 登出
app.post("/auth/logout", async (c) => {
  const token = c.req.header("x-session-token");
  if (!token) {
    return c.json({ detail: "Missing X-Session-Token header" }, 401);
  }
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const sessionRepo = new D1SessionRepository(db);
  await sessionRepo.delete(token);
  return c.json({ status: "ok" });
});

// 从请求头中提取 API Key，兼容 X-API-Key 和 Authorization: Bearer
function getApiKeyFromHeaders(c: any): string | null {
  const headerKey = c.req.header("x-api-key") || c.req.header("X-API-Key");
  if (headerKey) return headerKey;

  const auth = c.req.header("authorization") || c.req.header("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return null;
}

// 中间件：API Key
async function withApiKey(c: any, next: () => Promise<Response>) {
  const apiKey = getApiKeyFromHeaders(c);
  if (!apiKey) {
    return c.json(
      { detail: "Missing API key (X-API-Key header or Authorization: Bearer)" },
      401,
    );
  }
  
  const env = c.env as Env;
  const db = env.DB as D1Database;
  
  // 检查 D1 数据库绑定
  if (!db) {
    console.error("[withApiKey] D1 database not bound to Worker");
    return c.json({ detail: "Database not configured" }, 500);
  }
  
  const apiKeyRepo = new D1ApiKeyRepository(db);
  try {
    const record = await apiKeyRepo.findByKey(apiKey);
    if (!record) {
      // 记录调试信息（不暴露完整 API Key）
      const keyPrefix = apiKey.substring(0, 8);
      console.warn(`[withApiKey] API key not found or inactive: ${keyPrefix}...`);
      return c.json({ detail: "Invalid or inactive API key" }, 401);
    }
    c.set("apiKeyRecord", record);
    c.set("apiKeyId", record.id);
    return next();
  } catch (err: any) {
    // 区分不同类型的错误
    if (err instanceof AuthenticationError) {
      return c.json({ detail: err.message }, 401);
    }
    // 数据库错误
    console.error("[withApiKey] Database error:", err?.message || String(err));
    return c.json({ detail: "Database error during API key validation" }, 500);
  }
}

// 工具函数：限制字符串长度，避免存储过大的请求/响应体
function truncateString(str: string | null | undefined, maxLength: number = 10000): string | null {
  if (!str) return null;
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + `... [truncated, original length: ${str.length}]`;
}

// 自动清理超过24小时的日志（异步执行，不阻塞请求）
async function cleanupOldLogs(db: D1Database) {
  try {
    const logRepo = new D1RequestLogRepository(db);
    const deletedCount = await logRepo.cleanupOlderThan(24);
    if (deletedCount > 0) {
      console.log(`[RequestLog] Cleaned up ${deletedCount} old log entries (older than 24h)`);
    }
  } catch (err: any) {
    console.error("[RequestLog] Cleanup error:", err?.message || String(err));
  }
}

// 中间件：请求日志记录
async function withRequestLogging(c: any, next: () => Promise<Response>) {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const method = c.req.method;
  const path = c.req.path;
  const startTime = Date.now();
  
  // 检查数据库绑定
  if (!db) {
    console.error("[RequestLog] ❌ D1 database not bound, skipping logging");
    return next();
  }
  
  // 先检查表是否存在（同步检查，避免后续失败）
  let tableExists = false;
  try {
    const tableCheck = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_request_logs'"
    ).first();
    tableExists = tableCheck !== null;
    if (!tableExists) {
      console.error("[RequestLog] ❌ Table 'api_request_logs' does not exist!");
      console.error("[RequestLog] 💡 Please run the following SQL in D1 Console:");
      console.error("[RequestLog]    CREATE TABLE IF NOT EXISTS api_request_logs (...);");
    }
  } catch (err: any) {
    console.error("[RequestLog] ❌ Failed to check table existence:", err?.message || String(err));
  }
  
  // 异步触发清理（不等待完成）
  if (tableExists) {
    cleanupOldLogs(db).catch((err) => {
      console.error("[RequestLog] Cleanup error:", err?.message || String(err));
    });
  }

  let requestBody: string | null = null;
  let responseBody: string | null = null;
  let statusCode = 500;
  let apiKeyId: number | null = null;

  // 尝试读取请求体（对于 POST/PUT/PATCH 请求）
  if (["POST", "PUT", "PATCH"].includes(method)) {
    try {
      const body = await c.req.clone().json().catch(() => null);
      if (body) {
        requestBody = truncateString(JSON.stringify(body));
      }
    } catch (err: any) {
      console.warn("[RequestLog] Failed to read request body:", err?.message);
    }
  }

  try {
    // 执行下一个中间件/处理器
    const response = await next();
    statusCode = response.status;
    
    // 尝试获取 apiKeyId（可能在后续中间件中设置）
    apiKeyId = c.get("apiKeyId") || null;

    // 尝试读取响应体
    try {
      const clonedResponse = response.clone();
      const contentType = clonedResponse.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await clonedResponse.json().catch(() => null);
        if (body) {
          responseBody = truncateString(JSON.stringify(body));
        }
      } else {
        // 对于非 JSON 响应，尝试读取文本（限制长度）
        const text = await clonedResponse.text().catch(() => null);
        if (text) {
          responseBody = truncateString(text, 5000);
        }
      }
    } catch (err: any) {
      console.warn("[RequestLog] Failed to read response body:", err?.message);
    }

    // 记录日志 - 直接 await 确保写入完成（D1 写入很快，不会明显阻塞）
    if (tableExists) {
      const logRepo = new D1RequestLogRepository(db);
      const logData = {
        id: null,
        apiKeyId,
        method,
        path,
        requestBody,
        responseBody,
        statusCode,
        createdAt: new Date(),
      };
      
      try {
        const logId = await logRepo.create(logData);
        const duration = Date.now() - startTime;
        console.log(`[RequestLog] ✅ Logged: ${method} ${path} -> ${statusCode} (${duration}ms, log_id: ${logId})`);
      } catch (err: any) {
        // 详细错误日志
        console.error("[RequestLog] ❌ Failed to log request:", {
          method,
          path,
          statusCode,
          error: err?.message || String(err),
          errorCode: err?.code,
          errorCause: err?.cause,
          errorString: String(err),
          errorStack: err?.stack,
        });
        // 检查是否是表不存在的问题
        const errorMsg = String(err?.message || err || '').toLowerCase();
        if (errorMsg.includes("no such table") || errorMsg.includes("api_request_logs")) {
          console.error("[RequestLog] ⚠️  Table 'api_request_logs' does not exist!");
          console.error("[RequestLog] 💡 Please run schema.sql in D1 Console to create the table.");
        }
      }
    } else {
      console.warn(`[RequestLog] ⚠️  Skipping log write: table does not exist (${method} ${path})`);
    }

    return response;
  } catch (err: any) {
    statusCode = err.status || 500;
    apiKeyId = c.get("apiKeyId") || null;
    
    // 尝试读取错误响应体
    try {
      if (err.response) {
        responseBody = truncateString(JSON.stringify({ error: err.message || String(err) }));
      }
    } catch {
      responseBody = truncateString(JSON.stringify({ error: err.message || String(err) }));
    }
    
    // 记录错误响应 - 直接 await 确保写入完成
    if (tableExists) {
      const logRepo = new D1RequestLogRepository(db);
      try {
        const logId = await logRepo.create({
          id: null,
          apiKeyId,
          method,
          path,
          requestBody,
          responseBody,
          statusCode,
          createdAt: new Date(),
        });
        const duration = Date.now() - startTime;
        console.log(`[RequestLog] ✅ Logged error: ${method} ${path} -> ${statusCode} (${duration}ms, log_id: ${logId})`);
      } catch (logErr: any) {
        console.error("[RequestLog] ❌ Failed to log error request:", {
          method,
          path,
          statusCode,
          error: logErr?.message || String(logErr),
          errorCode: logErr?.code,
          errorString: String(logErr),
        });
      }
    }
    throw err;
  }
}

// 中间件：Session 校验
async function withSession(c: any, next: () => Promise<Response>) {
  const token = c.req.header("x-session-token");
  if (!token) {
    return c.json({ detail: "Missing X-Session-Token header" }, 401);
  }
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const sessionRepo = new D1SessionRepository(db);
  const session = await sessionRepo.findByToken(token);
  if (!session) {
    return c.json({ detail: "Invalid or expired session" }, 401);
  }
  await sessionRepo.touch(token);
  c.set("session", session);
  return next();
}
// 获取当前用户的 API Key 列表
app.get("/auth/api-keys", withApiKey, withSession, async (c: any) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const apiKeyRepo = new D1ApiKeyRepository(db);
  const apiKeyRecord = c.get("apiKeyRecord");
  const session = c.get("session");

  if (!apiKeyRecord || !session || apiKeyRecord.user_id !== session.userId) {
    return c.json({ detail: "session and api key mismatch" }, 403);
  }

  const keys = await apiKeyRepo.listByUser(session.userId);
  return c.json({ api_keys: keys });
});

// 创建新的 API Key（当前用户）
app.post("/auth/api-keys", withApiKey, withSession, async (c: any) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const apiKeyRepo = new D1ApiKeyRepository(db);
  const session = c.get("session");

  const body = (await c.req.json().catch(() => ({}))) as any;
  const { name } = body;

  const [, key] = await apiKeyRepo.create({
    id: null,
    userId: session.userId,
    key: "",
    name: name || null,
    isActive: true,
    createdAt: new Date(),
  });

  return c.json({ api_key: key });
});

// 管理员：列出所有 API Key
app.get("/admin/api-keys", withApiKey, withSession, async (c: any) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const apiKeyRecord = c.get("apiKeyRecord");

  if (!apiKeyRecord || !apiKeyRecord.is_admin) {
    return c.json({ detail: "admin only" }, 403);
  }

  const apiKeyRepo = new D1ApiKeyRepository(db);
  const apiKeyService = new ApiKeyService(apiKeyRepo);
  const keys = await apiKeyService.listAll();
  return c.json({ api_keys: keys });
});

// 管理员：获取待审核的注册请求
app.get("/admin/registrations", withApiKey, withSession, async (c: any) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const apiKeyRecord = c.get("apiKeyRecord");

  if (!apiKeyRecord || !apiKeyRecord.is_admin) {
    return c.json({ detail: "admin only" }, 403);
  }

  const regRepo = new D1RegistrationRequestRepository(db);
  const registrationService = new RegistrationService(regRepo);
  const requests = await registrationService.listPending();
  return c.json({ registration_requests: requests });
});

// 管理员：批准注册请求
app.post("/admin/registrations/:id/approve", withApiKey, withSession, async (c: any) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const apiKeyRecord = c.get("apiKeyRecord");

  if (!apiKeyRecord || !apiKeyRecord.is_admin) {
    return c.json({ detail: "admin only" }, 403);
  }

  const id = Number(c.req.param("id"));
  const regRepo = new D1RegistrationRequestRepository(db);
  const registrationService = new RegistrationService(regRepo);
  await registrationService.approve(id);
  return c.json({ status: "ok" });
});

// 管理员：拒绝注册请求
app.post("/admin/registrations/:id/reject", withApiKey, withSession, async (c: any) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const apiKeyRecord = c.get("apiKeyRecord");

  if (!apiKeyRecord || !apiKeyRecord.is_admin) {
    return c.json({ detail: "admin only" }, 403);
  }

  const id = Number(c.req.param("id"));
  const regRepo = new D1RegistrationRequestRepository(db);
  const registrationService = new RegistrationService(regRepo);
  await registrationService.reject(id);
  return c.json({ status: "ok" });
});

// 管理员：查询请求日志
app.get("/admin/request-logs", withApiKey, withSession, async (c: any) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const apiKeyRecord = c.get("apiKeyRecord");

  if (!apiKeyRecord || !apiKeyRecord.is_admin) {
    return c.json({ detail: "admin only" }, 403);
  }

  const limit = Number(c.req.query("limit") || 50);
  const offset = Number(c.req.query("offset") || 0);
  const apiKeyId = c.req.query("api_key_id") ? Number(c.req.query("api_key_id")) : null;

  try {
    let query = "SELECT * FROM api_request_logs";
    const params: any[] = [];

    if (apiKeyId) {
      query += " WHERE api_key_id = ?";
      params.push(apiKeyId);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const result = await stmt.bind(...params).all<any>();

    // 获取总数
    let countQuery = "SELECT COUNT(*) as total FROM api_request_logs";
    if (apiKeyId) {
      countQuery += " WHERE api_key_id = ?";
    }
    const countStmt = db.prepare(countQuery);
    const countResult = await (apiKeyId ? countStmt.bind(apiKeyId) : countStmt).first<any>();

    return c.json({
      logs: result.results || [],
      total: countResult?.total || 0,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error("[Admin] Failed to query request logs:", err);
    return c.json({ detail: err.message || "Failed to query logs" }, 500);
  }
});

// 启动 OAuth 流程 (Cloudflare)
app.get("/auth/oauth-start", async (c) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const settings = new D1SettingRepository(db);
  const anyEnv = env as any;

  const envClientId = anyEnv.GITLAB_OAUTH_CLIENT_ID as string | undefined;
  const envClientSecret = anyEnv.GITLAB_OAUTH_CLIENT_SECRET as string | undefined;
  const storedClientId = await settings.get("client_id");
  const storedClientSecret = await settings.get("client_secret");

  const clientId = envClientId || storedClientId;
  const clientSecret = envClientSecret || storedClientSecret;

  if (!clientId || !clientSecret) {
    return c.html(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Jihu OAuth Setup (Cloudflare)</title></head>
<body style="font-family: system-ui, sans-serif; background:#0f172a; color:#e5e7eb; padding:24px;">
  <h1>Jihu OAuth Setup (Cloudflare)</h1>
  <p>未找到 GitLab Application 凭据。</p>
  <p>请在 <strong>Cloudflare Dashboard -> Workers -> Settings -> Variables</strong> 中设置以下环境变量：</p>
  <ul>
    <li><code>GITLAB_OAUTH_CLIENT_ID</code></li>
    <li><code>GITLAB_OAUTH_CLIENT_SECRET</code></li>
  </ul>
  <p>然后重新访问本页面完成授权。</p>
</body></html>`);
  }

  const url = new URL(c.req.url);
  const callbackUrl = `${url.origin}/auth/oauth-callback`;
  const authUrl = `https://jihulab.com/oauth/authorize?client_id=${encodeURIComponent(
    clientId,
  )}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=api`;

  return c.html(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Jihu OAuth Authorization (Cloudflare)</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 24px; background:#0f172a; color:#e5e7eb; }
    .container { background: rgba(15,23,42,0.95); border-radius: 12px; padding: 24px; border:1px solid rgba(55,65,81,0.85); }
    h1 { margin-top: 0; }
    p { line-height: 1.6; }
    .btn { display:inline-block; padding:10px 20px; background:#2563eb; color:#fff; text-decoration:none; border-radius:8px; }
    .btn:hover { background:#1d4ed8; }
    code { background: rgba(15,23,42,0.9); padding:3px 6px; border-radius:4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Jihu OAuth 授权 (Cloudflare)</h1>
    <p>点击下方按钮，在 Jihu GitLab 中完成授权。</p>
    <p><strong>当前 Redirect URI:</strong><br/><code>${callbackUrl}</code></p>
    <p>请确保在 <a href="https://jihulab.com/-/user_settings/applications" target="_blank" style="color:#60a5fa;">GitLab 应用配置</a> 中将 Redirect URI 设置为上述地址。</p>
    <p><a href="${authUrl}" class="btn" id="authBtn">前往 Jihu GitLab 授权</a></p>
    <p style="font-size:13px;color:#9ca3af;">页面会在 2 秒后自动跳转，如未跳转请手动点击按钮。</p>
  </div>
  <script>
    setTimeout(() => {
      const btn = document.getElementById('authBtn');
      if (btn) btn.click();
    }, 2000);
  </script>
</body>
</html>`);
});

// OAuth 回调 (Cloudflare)
app.get("/auth/oauth-callback", async (c) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const settings = new D1SettingRepository(db);
  const url = new URL(c.req.url);

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return c.html(`<!DOCTYPE html><html><body><h1>OAuth Error</h1><p>${c.text(
      error,
    )}</p></body></html>`);
  }

  if (!code) {
    return c.html(
      "<!DOCTYPE html><html><body><h1>OAuth Error</h1><p>No authorization code received.</p></body></html>",
    );
  }

  const anyEnv = env as any;
  const envClientId = anyEnv.GITLAB_OAUTH_CLIENT_ID as string | undefined;
  const envClientSecret = anyEnv.GITLAB_OAUTH_CLIENT_SECRET as string | undefined;
  const storedClientId = await settings.get("client_id");
  const storedSecret = await settings.get("client_secret");

  const clientId = envClientId || storedClientId;
  const clientSecret = envClientSecret || storedSecret;

  if (!clientId || !clientSecret) {
    return c.html(
      "<!DOCTYPE html><html><body><h1>OAuth Error</h1><p>GitLab Application credentials not found. 请在 Cloudflare 环境变量中设置 GITLAB_OAUTH_CLIENT_ID / GITLAB_OAUTH_CLIENT_SECRET。</p></body></html>",
    );
  }

  const callbackUrl = `${url.origin}/auth/oauth-callback`;

  try {
    const res = await fetch("https://jihulab.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return c.html(`<!DOCTYPE html><html><body><h1>OAuth Error</h1><p>${c.text(
        text,
      )}</p></body></html>`);
    }

    const data: any = await res.json();
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;

    if (!accessToken || !refreshToken) {
      throw new Error("Missing tokens in response");
    }

    await settings.set("client_id", clientId);
    await settings.set("client_secret", clientSecret);
    await settings.set("access_token", accessToken);
    await settings.set("refresh_token", refreshToken);
    await settings.set("redirect_uri", callbackUrl);

    cachedJwt = null;
    cachedJwtExp = null;

    return c.html(
      "<!DOCTYPE html><html><body><h1>OAuth 授权成功</h1><p>Access token 和 refresh token 已保存到 Cloudflare D1。现在可以返回客户端使用 Jihu CodeRider 代理服务。</p></body></html>",
    );
  } catch (err: any) {
    return c.html(
      `<!DOCTYPE html><html><body><h1>OAuth Error</h1><p>${c.text(
        err.message || "OAuth error",
      )}</p></body></html>`,
    );
  }
});

// 简单模型列表
app.get("/v1/models", (c) => {
  const baseModels = [{ id: DEFAULT_MODEL, object: "model", owned_by: "coderider" }];
  const extraModels = STATIC_CHAT_MODELS.map((m) => ({
    id: m.id,
    object: "model",
    owned_by: "coderider",
  }));
  return c.json({
    object: "list",
    data: [...baseModels, ...extraModels],
  });
});

// 完整模型列表 /v1/models/full
app.get("/v1/models/full", async (c) => {
  const env = c.env as Env;
  try {
    const jwt = await getCoderiderJwt(env);
    const host = getCoderiderHost(env).replace(/\/$/, "");

    const res = await fetch(`${host}/api/v1/config`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return c.json(
        { detail: `拉取 CodeRider 模型配置失败: ${res.status} ${res.statusText} - ${text}` },
        502,
      );
    }

    const config: any = await res.json();
    const llmParams: Record<string, any> = {};
    (config.llm_models_params || []).forEach((item: any) => {
      llmParams[item.name || ""] = item;
    });

    const buildEntry = (tag: string, mtype: string) => {
      const bare = tag.includes("/") ? tag.split("/")[1] : tag;
      const params = llmParams[bare] || {};
      return {
        id: tag,
        object: "model",
        owned_by: "coderider",
        type: mtype,
        name: bare,
        provider: params.provider,
        context_window: params.context_window,
        temperature: params.temperature,
        raw: params || null,
      };
    };

    const data: any[] = [];
    (config.chat_models || []).forEach((tag: string) => data.push(buildEntry(tag, "chat")));
    (config.code_completion_models || []).forEach((tag: string) =>
      data.push(buildEntry(tag, "code_completion")),
    );
    (config.loom_models || []).forEach((tag: string) => data.push(buildEntry(tag, "loom")));

    const staticModels = STATIC_CHAT_MODELS;

    for (const m of staticModels) {
      if (!data.some((d) => d.id === m.id)) {
        data.push({
          id: m.id,
          object: "model",
          owned_by: "coderider",
          type: m.type,
          name: m.name,
          provider: m.provider,
          context_window: null,
          temperature: undefined,
          raw: null,
        });
      }
    }

    return c.json({ object: "list", data });
  } catch (err: any) {
    console.error("v1/models/full error:", err);
    if (err instanceof JihuAuthExpiredError) {
      return buildJihuAuthExpiredResponse(c, err);
    }
    return c.json({ 
      detail: err.message || "Unknown error",
      error: err.name || "InternalServerError",
      stack: err.stack 
    }, 500);
  }
});

async function callJihuChat(
  env: Env,
  model: string | undefined,
  messages: any[],
  extraParams: any,
): Promise<any> {
  const jwt = await getCoderiderJwt(env);
  const host = getCoderiderHost(env).replace(/\/$/, "");
  const normalizedModel = stripModelPrefix(model || DEFAULT_MODEL);

  const body = {
    model: normalizedModel,
    messages,
    stream: false,
    ...extraParams,
  };

  const res = await fetch(`${host}/api/v1/llm/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 400 || res.status === 401) {
    throw new JihuAuthExpiredError(
      "coderider jwt unauthorized; 请重新在本地运行 npm run oauth-setup 或在 Cloudflare 环境变量中更新 GITLAB_OAUTH_ACCESS_TOKEN",
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`调用 Jihu chatCompletions 失败: ${res.status} ${res.statusText} - ${text}`);
  }

  return (await res.json()) as any;
}

// Chat Completions（OpenAI 兼容：返回 content-part 数组，兼容 Cline 等客户端）
// 注意：withRequestLogging 在 withApiKey 之前，确保所有请求（包括认证失败的）都被记录
app.post("/v1/chat/completions", withRequestLogging, withApiKey, async (c: any) => {
  const env = c.env as Env;
  const apiKeyId = c.get("apiKeyId");
  const db = env.DB as D1Database;
  const apiKeyRepo = new D1ApiKeyRepository(db);

  const payload = (await c.req.json().catch(() => ({}))) as any;
  const { messages, model, stream, extraParams } = splitChatPayload(payload);

  try {
    // 忽略 stream 标志：统一返回非流式 JSON，保证与 Cline 等默认 stream=true 的客户端兼容
    const raw = await callJihuChat(env, model, messages, extraParams);
    const result = adaptJihuToOpenAI(raw, model || DEFAULT_MODEL);

    if (apiKeyId && result?.usage) {
      await apiKeyRepo.updateUsage(
        apiKeyId,
        result.usage.prompt_tokens || 0,
        result.usage.completion_tokens || 0,
      );
    }

    return c.json(result);
  } catch (err: any) {
    if (err instanceof JihuAuthExpiredError) {
      return buildJihuAuthExpiredResponse(c, err);
    }
    return c.json({ detail: err.message || "Internal server error" }, 500);
  }
});

// POST /v1/messages (Claude API兼容)
// 注意：withRequestLogging 在 withApiKey 之前，确保所有请求（包括认证失败的）都被记录
app.post("/v1/messages", withRequestLogging, withApiKey, async (c: any) => {
  const env = c.env as Env;
  const apiKeyId = c.get("apiKeyId");
  const db = env.DB as D1Database;
  const apiKeyRepo = new D1ApiKeyRepository(db);

  const payload = (await c.req.json().catch(() => ({}))) as any;
  const { messages: openaiMessages, jihuModel, extraParams } = convertClaudeToOpenAI(payload);

  try {
    const result = await callJihuChat(env, jihuModel, openaiMessages, extraParams);

    if (apiKeyId && result.usage) {
      await apiKeyRepo.updateUsage(
        apiKeyId,
        result.usage.prompt_tokens || 0,
        result.usage.completion_tokens || 0,
      );
    }

    const claudeResponse = buildClaudeResponse(result, payload.model);
    return c.json(claudeResponse);
  } catch (err: any) {
    if (err instanceof JihuAuthExpiredError) {
      return buildJihuAuthExpiredResponse(c, err);
    }
    return c.json({ detail: err.message || "Internal server error" }, 500);
  }
});

// 404 处理
app.notFound((c) => {
  return c.json({ detail: "Not Found" }, 404);
});

// 全局错误处理
app.onError((err, c) => {
  console.error("Worker error:", err);
  if (err instanceof JihuAuthExpiredError) {
    return buildJihuAuthExpiredResponse(c, err);
  }
  return c.json({ detail: err.message || "Internal server error" }, 500);
});

export default app;
