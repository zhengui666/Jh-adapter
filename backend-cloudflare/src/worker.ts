import { Hono } from "hono";
import type { D1Database } from "@cloudflare/workers-types";
import {
  D1UserRepository,
  D1ApiKeyRepository,
  D1SessionRepository,
  D1RegistrationRequestRepository,
  D1SettingRepository,
  type D1Env,
} from "./d1-repositories";
import { AuthenticationError, JihuAuthExpiredError } from "../../backend/src/domain/exceptions";

type Env = D1Env & {
  GITLAB_OAUTH_ACCESS_TOKEN?: string;
  CODERIDER_HOST?: string;
};

const DEFAULT_MODEL = "maas/maas-chat-model";
const DEFAULT_CODERIDER_HOST = "https://coderider.jihulab.com";

const app = new Hono<{ Bindings: Env }>();

// 简单密码工具（Cloudflare 使用 Web Crypto）
async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === storedHash;
}

function getCoderiderHost(env: Env): string {
  return env.CODERIDER_HOST || DEFAULT_CODERIDER_HOST;
}

async function getGitlabAccessToken(env: Env): Promise<string> {
  const token = env.GITLAB_OAUTH_ACCESS_TOKEN;
  if (!token) {
    throw new JihuAuthExpiredError(
      "GitLab access token missing; please set GITLAB_OAUTH_ACCESS_TOKEN in Cloudflare 环境变量",
    );
  }
  return token;
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

function stripModelPrefix(model: string): string {

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

  for (const prefix of ["maas/", "server/"]) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
  }
  return model;
}

// 健康检查
app.get("/health", (c) => {
  return c.json({ status: "ok", backend: "cloudflare-worker" });
});

// 注册
app.post("/auth/register", async (c) => {
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const userRepo = new D1UserRepository(db);
  const apiKeyRepo = new D1ApiKeyRepository(db);
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
    const existed = await userRepo.findByUsername(username);
    if (existed) {
      return c.json({ detail: "username already exists" }, 400);
    }

    const passwordHash = await hashPassword(password);
    const isAdmin = !(await userRepo.exists());
    const userId = await userRepo.create({
      id: null,
      username,
      passwordHash,
      isAdmin,
      createdAt: new Date(),
    });

    const [, key] = await apiKeyRepo.create({
      id: null,
      userId,
      key: "",
      name: "default",
      isActive: true,
      createdAt: new Date(),
    });

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
    const user = await userRepo.findByUsername(username);
    if (!user) {
      throw new AuthenticationError("Invalid username or password");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AuthenticationError("Invalid username or password");
    }

    const session = await sessionRepo.create(user.id!);
    const keys = await apiKeyRepo.listByUser(session.userId);

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

// 中间件：API Key
async function withApiKey(c: any, next: () => Promise<Response>) {
  const apiKey = c.req.header("x-api-key");
  if (!apiKey) {
    return c.json({ detail: "Missing X-API-Key header" }, 401);
  }
  const env = c.env as Env;
  const db = env.DB as D1Database;
  const apiKeyRepo = new D1ApiKeyRepository(db);
  try {
    const record = await apiKeyRepo.findByKey(apiKey);
    if (!record) {
      throw new AuthenticationError("Invalid or inactive API key");
    }
    c.set("apiKeyRecord", record);
    c.set("apiKeyId", record.id);
    return next();
  } catch {
    return c.json({ detail: "Invalid or inactive API key" }, 401);
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
  const keys = await apiKeyRepo.listAll();
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
  const requests = await regRepo.listPending();
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
  await regRepo.approve(id);
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
  await regRepo.reject(id);
  return c.json({ status: "ok" });
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

  const code = url.searchParams.get("?code");
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
  const extraModels = [
    { id: "maas-minimax-m2", object: "model", owned_by: "coderider" },
    { id: "maas-deepseek-v3.1", object: "model", owned_by: "coderider" },
    { id: "maas-glm-4.6", object: "model", owned_by: "coderider" },
  ];
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

    const staticModels = [
      { id: "maas-minimax-m2", type: "chat", name: "maas-minimax-m2", provider: "minimax" },
      { id: "maas-deepseek-v3.1", type: "chat", name: "maas-deepseek-v3.1", provider: "deepseek" },
      { id: "maas-glm-4.6", type: "chat", name: "maas-glm-4.6", provider: "glm" },
    ];

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
    if (err instanceof JihuAuthExpiredError) {
      return buildJihuAuthExpiredResponse(c, err);
    }
    return c.json({ detail: err.message || "Unknown error" }, 502);
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

// Chat Completions（仅非流式）
app.post("/v1/chat/completions", withApiKey, async (c: any) => {
  const env = c.env as Env;
  const apiKeyId = c.get("apiKeyId");
  const db = env.DB as D1Database;
  const apiKeyRepo = new D1ApiKeyRepository(db);

  const payload = (await c.req.json().catch(() => ({}))) as any;
  const { messages = [], model, stream, ...rest } = payload;

  if (stream) {
    return c.json(
      { detail: "Cloudflare backend currently does not support stream responses" },
      400,
    );
  }

  try {
    const result = await callJihuChat(env, model, messages, rest);

    if (apiKeyId && result.usage) {
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
app.post("/v1/messages", withApiKey, async (c: any) => {
  const env = c.env as Env;
  const apiKeyId = c.get("apiKeyId");
  const db = env.DB as D1Database;
  const apiKeyRepo = new D1ApiKeyRepository(db);

  const payload = (await c.req.json().catch(() => ({}))) as any;
  const messages = payload.messages || [];
  const openaiMessages = messages.map((msg: any) => {
    if (msg.content && typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }
    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      return { role: msg.role, content: textParts };
    }
    return { role: msg.role, content: "" };
  });

  const modelMapping: Record<string, string> = {
    "claude-3-5-sonnet-20241022": "maas-minimax-m2",
    "claude-3-5-haiku-20241022": "maas-deepseek-v3.1",
    "claude-3-opus-20240229": "maas-glm-4.6",
    "claude-sonnet-4-5-20250929": "maas-minimax-m2",
    "claude-haiku-4-5-20251001": "maas-deepseek-v3.1",
    "claude-opus-4-5-20251101": "maas-glm-4.6",
  };

  const jihuModel = modelMapping[payload.model] || payload.model;

  const extraParams: any = {};
  if (payload.max_tokens) extraParams.max_tokens = payload.max_tokens;
  if (payload.temperature !== undefined) extraParams.temperature = payload.temperature;
  if (payload.top_p !== undefined) extraParams.top_p = payload.top_p;
  if (payload.top_k !== undefined) extraParams.top_k = payload.top_k;
  if (payload.stop_sequences) extraParams.stop_sequences = payload.stop_sequences;

  try {
    const result = await callJihuChat(env, jihuModel, openaiMessages, extraParams);

    if (apiKeyId && result.usage) {
      await apiKeyRepo.updateUsage(
        apiKeyId,
        result.usage.prompt_tokens || 0,
        result.usage.completion_tokens || 0,
      );
    }

    const claudeResponse = {
      id: result.id || "msg-" + Date.now(),
      type: "message",
      role: "assistant",
      content: result.choices?.[0]?.message?.content
        ? [{ type: "text", text: result.choices[0].message.content }]
        : [],
      model: payload.model,
      stop_reason: result.choices?.[0]?.finish_reason || "end_turn",
      stop_sequence: null,
      usage: result.usage,
    };

    return c.json(claudeResponse);
  } catch (err: any) {
    if (err instanceof JihuAuthExpiredError) {
      return buildJihuAuthExpiredResponse(c, err);
    }
    return c.json({ detail: err.message || "Internal server error" }, 500);
  }
});

export default app;
