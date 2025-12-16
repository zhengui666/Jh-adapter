/**
 * Presentation Layer - Express路由
 * 
 * HTTP接口定义
 */
import express, { Request, Response, NextFunction } from 'express';
import {
  getAuthService,
  getApiKeyService,
  getChatService,
  getSettingRepo,
  getUserRepo,
  getSessionRepo,
  getRegistrationRepo,
  getApiKeyRepo,
} from '../infrastructure/dependencies.js';
import { JihuAuthExpiredError } from '../domain/exceptions.js';
import { DEFAULT_MODEL } from '../infrastructure/config.js';
import { PasswordService } from '../application/services.js';

const router = express.Router();

// 中间件：验证API Key
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(401).json({ detail: 'Missing X-API-Key header' });
  }

  try {
    const apiKeyService = getApiKeyService();
    const record = apiKeyService.validate(apiKey);
    (req as any).apiKeyRecord = record;
    (req as any).apiKeyId = record.id;
    next();
  } catch (error) {
    return res.status(401).json({ detail: 'Invalid or inactive API key' });
  }
}

// 中间件：验证Session
function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-session-token'] as string;
  if (!token) {
    return res.status(401).json({ detail: 'Missing X-Session-Token header' });
  }

  try {
    const authService = getAuthService();
    const session = authService.validateSession(token);
    (req as any).session = session;
    next();
  } catch (error) {
    return res.status(401).json({ detail: 'Invalid or expired session' });
  }
}

// 统一处理错误消息中的旧命令引用
function normalizeErrorMessage(message: string): string {
  return message
    .replace(/oauth_setup\.py/g, 'npm run oauth-setup')
    .replace(/python oauth_setup\.py/g, 'npm run oauth-setup')
    .replace(/python.*oauth_setup/g, 'npm run oauth-setup');
}

// 处理Jihu认证错误
function handleJihuAuthError(error: any, res: Response) {
  if (error instanceof JihuAuthExpiredError) {
    // 清理错误消息，移除前缀并替换旧命令
    let message = error.message.replace('JIHU_AUTH_EXPIRED: ', '');
    message = normalizeErrorMessage(message);
    
    return res.status(401).json({
      detail: {
        error: 'jihu_auth_expired',
        message: message,
        login_url: 'https://jihulab.com/-/user_settings/applications',
        local_oauth_url: '/auth/oauth-start',
        hint: '请运行 "npm run oauth-setup" 重新认证，或访问 /auth/oauth-start 通过浏览器登录。',
      },
    });
  }
  throw error;
}

// POST /v1/chat/completions
router.post('/v1/chat/completions', requireApiKey, async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const stream = Boolean(payload.stream);
    const apiKeyId = (req as any).apiKeyId;

    const chatService = getChatService();
    const chatPayload: any = { ...payload };
    delete chatPayload.messages;
    delete chatPayload.model;
    delete chatPayload.stream;
    
    const result = await chatService.chatCompletions(
      payload.messages || [],
      payload.model,
      stream,
      chatPayload
    );

    // 记录用量（非流式响应）
    if (!stream && result.usage && apiKeyId) {
      const apiKeyService = getApiKeyService();
      apiKeyService.updateUsage(
        apiKeyId,
        result.usage.prompt_tokens || 0,
        result.usage.completion_tokens || 0
      );
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      if (result && typeof result.pipe === 'function') {
        result.pipe(res);
      } else if (result) {
        res.end(result);
      } else {
        res.end();
      }
    } else {
      res.json(result);
    }
  } catch (error: any) {
    if (error instanceof JihuAuthExpiredError) {
      return handleJihuAuthError(error, res);
    }
    const errorMsg = normalizeErrorMessage(error.message || 'Internal server error');
    res.status(500).json({ detail: errorMsg });
  }
});

// GET /v1/models
// 返回一个精简版模型列表，包含默认模型以及常用的 minimax / deepseek / glm 映射
router.get('/v1/models', (req: Request, res: Response) => {
  const baseModels = [
    { id: DEFAULT_MODEL, object: 'model', owned_by: 'coderider' },
  ];

  const extraModels = [
    { id: 'maas-minimax-m2', object: 'model', owned_by: 'coderider' },
    { id: 'maas-deepseek-v3.1', object: 'model', owned_by: 'coderider' },
    { id: 'maas-glm-4.6', object: 'model', owned_by: 'coderider' },
  ];

  res.json({
    object: 'list',
    data: [...baseModels, ...extraModels],
  });
});

// GET /v1/models/full
router.get('/v1/models/full', async (req: Request, res: Response) => {
  try {
    const chatService = getChatService();
    const config = await chatService.getModels();

    // 处理模型配置，转换为OpenAI格式
    const llmParams: Record<string, any> = {};
    (config.llm_models_params || []).forEach((item: any) => {
      llmParams[item.name || ''] = item;
    });

    const buildEntry = (tag: string, mtype: string) => {
      const bare = tag.includes('/') ? tag.split('/')[1] : tag;
      const params = llmParams[bare] || {};
      return {
        id: tag,
        object: 'model',
        owned_by: 'coderider',
        type: mtype,
        name: bare,
        provider: params.provider,
        context_window: params.context_window,
        temperature: params.temperature,
        raw: params || null,
      };
    };

    const data: any[] = [];
    (config.chat_models || []).forEach((tag: string) => data.push(buildEntry(tag, 'chat')));
    (config.code_completion_models || []).forEach((tag: string) => data.push(buildEntry(tag, 'code_completion')));
    (config.loom_models || []).forEach((tag: string) => data.push(buildEntry(tag, 'loom')));

    // 确保 minimax / deepseek / glm 这几个常用模型始终存在于列表中
    const staticModels = [
      { id: 'maas-minimax-m2', type: 'chat', name: 'maas-minimax-m2', provider: 'minimax' },
      { id: 'maas-deepseek-v3.1', type: 'chat', name: 'maas-deepseek-v3.1', provider: 'deepseek' },
      { id: 'maas-glm-4.6', type: 'chat', name: 'maas-glm-4.6', provider: 'glm' },
    ];

    for (const m of staticModels) {
      if (!data.some((d) => d.id === m.id)) {
        data.push({
          id: m.id,
          object: 'model',
          owned_by: 'coderider',
          type: m.type,
          name: m.name,
          provider: m.provider,
          context_window: null,
          temperature: undefined,
          raw: null,
        });
      }
    }

    res.json({ object: 'list', data });
  } catch (error: any) {
    if (error instanceof JihuAuthExpiredError) {
      return handleJihuAuthError(error, res);
    }
    // 统一处理错误消息，替换旧的 Python 命令
    const errorMsg = normalizeErrorMessage(error.message || 'Unknown error');
    res.status(502).json({ detail: `拉取 CodeRider 模型配置失败: ${errorMsg}` });
  }
});

// POST /v1/messages (Claude API兼容)
router.post('/v1/messages', requireApiKey, async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const apiKeyId = (req as any).apiKeyId;

    // 转换Claude格式到OpenAI格式
    const messages = payload.messages || [];
    const openaiMessages = messages.map((msg: any) => {
      if (msg.content && typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
        return { role: msg.role, content: textParts };
      }
      return { role: msg.role, content: '' };
    });

    // 模型映射
    const modelMapping: Record<string, string> = {
      'claude-3-5-sonnet-20241022': 'maas-minimax-m2',
      'claude-3-5-haiku-20241022': 'maas-deepseek-v3.1',
      'claude-3-opus-20240229': 'maas-glm-4.6',
      'claude-sonnet-4-5-20250929': 'maas-minimax-m2',
      'claude-haiku-4-5-20251001': 'maas-deepseek-v3.1',
      'claude-opus-4-5-20251101': 'maas-glm-4.6',
    };

    const jihuModel = modelMapping[payload.model] || payload.model;

    const chatService = getChatService();
    const extraParams: any = {};
    if (payload.max_tokens) extraParams.max_tokens = payload.max_tokens;
    if (payload.temperature !== undefined) extraParams.temperature = payload.temperature;
    if (payload.top_p !== undefined) extraParams.top_p = payload.top_p;
    if (payload.top_k !== undefined) extraParams.top_k = payload.top_k;
    if (payload.stop_sequences) extraParams.stop_sequences = payload.stop_sequences;

    const result = await chatService.chatCompletions(
      openaiMessages,
      jihuModel,
      false,
      extraParams
    );

    // 记录用量
    if (result.usage && apiKeyId) {
      const apiKeyService = getApiKeyService();
      apiKeyService.updateUsage(
        apiKeyId,
        result.usage.prompt_tokens || 0,
        result.usage.completion_tokens || 0
      );
    }

    // 转换为Claude格式响应
    const claudeResponse = {
      id: result.id || 'msg-' + Date.now(),
      type: 'message',
      role: 'assistant',
      content: result.choices?.[0]?.message?.content ? [{ type: 'text', text: result.choices[0].message.content }] : [],
      model: payload.model,
      stop_reason: result.choices?.[0]?.finish_reason || 'end_turn',
      stop_sequence: null,
      usage: result.usage,
    };

    res.json(claudeResponse);
  } catch (error: any) {
    if (error instanceof JihuAuthExpiredError) {
      return handleJihuAuthError(error, res);
    }
    const errorMsg = normalizeErrorMessage(error.message || 'Internal server error');
    res.status(500).json({ detail: errorMsg });
  }
});

// GET /health
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// POST /auth/register
router.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ detail: 'username and password are required' });
    }

    if (password.length < 8 || password.match(/^\d+$/) || password.match(/^[a-zA-Z]+$/)) {
      return res.status(400).json({
        detail: 'password too weak: use at least 8 characters and mix letters and digits',
      });
    }

    const authService = getAuthService();
    const userRepo = getUserRepo();

    if (userRepo.findByUsername(username)) {
      return res.status(400).json({ detail: 'username already exists' });
    }

    if (!userRepo.exists()) {
      const [userId, isAdmin] = await authService.register(username, password, false);
      const apiKeyService = getApiKeyService();
      const [, key] = apiKeyService.create(userId, 'default');
      return res.json({
        user: { id: userId, username, is_admin: isAdmin },
        api_key: key,
        pending_approval: false,
      });
    }
    
    // 需要管理员批准
    const registrationRepo = getRegistrationRepo();
    const passwordHash = await PasswordService.hash(password);
    const request = {
      id: null,
      username,
      passwordHash,
      createdAt: new Date(),
      status: 'pending' as const,
    };
    registrationRepo.create(request);

    const admin = userRepo.findFirstAdmin();
    return res.json({
      pending_approval: true,
      message: 'Registration request created. Please wait for admin approval.',
      admin_username: admin?.username || null,
    });
  } catch (error: any) {
    const errorMsg = normalizeErrorMessage(error.message || 'Bad request');
    res.status(400).json({ detail: errorMsg });
  }
});

// POST /auth/login
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ detail: 'username and password are required' });
    }

    const authService = getAuthService();
    const session = await authService.login(username, password);
    const apiKeyService = getApiKeyService();
    const keys = apiKeyService.listUserKeys(session.userId);

    const userRepo = getUserRepo();
    const user = userRepo.findByUsername(username);

    return res.json({
      user: { id: user?.id, username, is_admin: user?.isAdmin || false },
      session_token: session.token,
      api_keys: keys,
    });
  } catch (error: any) {
    const errorMsg = normalizeErrorMessage(error.message || 'Internal server error');
    if (error.message?.includes('Invalid')) {
      return res.status(401).json({ detail: errorMsg });
    }
    res.status(500).json({ detail: errorMsg });
  }
});

// POST /auth/logout
router.post('/auth/logout', requireSession, (req: Request, res: Response) => {
  const token = req.headers['x-session-token'] as string;
  const sessionRepo = getSessionRepo();
  sessionRepo.delete(token);
  res.json({ status: 'ok' });
});

// GET /auth/api-keys
router.get('/auth/api-keys', requireApiKey, requireSession, (req: Request, res: Response) => {
  const apiKeyRecord = (req as any).apiKeyRecord;
  const session = (req as any).session;
  
  if (apiKeyRecord.user_id !== session.userId) {
    return res.status(403).json({ detail: 'session and api key mismatch' });
  }

  const apiKeyService = getApiKeyService();
  const keys = apiKeyService.listUserKeys(session.userId);
  res.json({ api_keys: keys });
});

// POST /auth/api-keys
router.post('/auth/api-keys', requireApiKey, requireSession, (req: Request, res: Response) => {
  const apiKeyRecord = (req as any).apiKeyRecord;
  const session = (req as any).session;
  
  if (apiKeyRecord.user_id !== session.userId) {
    return res.status(403).json({ detail: 'session and api key mismatch' });
  }

  const { name } = req.body;
  const apiKeyService = getApiKeyService();
  const [, key] = apiKeyService.create(session.userId, name);
  res.json({ api_key: key });
});

// GET /admin/api-keys
router.get('/admin/api-keys', requireApiKey, requireSession, (req: Request, res: Response) => {
  const apiKeyRecord = (req as any).apiKeyRecord;
  if (!apiKeyRecord.is_admin) {
    return res.status(403).json({ detail: 'admin only' });
  }

  const apiKeyRepo = getApiKeyRepo();
  const keys = apiKeyRepo.listAll();
  res.json({ api_keys: keys });
});

// GET /admin/registrations
router.get('/admin/registrations', requireApiKey, requireSession, (req: Request, res: Response) => {
  const apiKeyRecord = (req as any).apiKeyRecord;
  if (!apiKeyRecord.is_admin) {
    return res.status(403).json({ detail: 'admin only' });
  }

  const registrationRepo = getRegistrationRepo();
  const requests = registrationRepo.listPending();
  res.json({ registration_requests: requests });
});

// POST /admin/registrations/:id/approve
router.post('/admin/registrations/:id/approve', requireApiKey, requireSession, (req: Request, res: Response) => {
  const apiKeyRecord = (req as any).apiKeyRecord;
  if (!apiKeyRecord.is_admin) {
    return res.status(403).json({ detail: 'admin only' });
  }

  const requestId = parseInt(req.params.id);
  const registrationRepo = getRegistrationRepo();
  registrationRepo.approve(requestId);
  res.json({ status: 'ok' });
});

// POST /admin/registrations/:id/reject
router.post('/admin/registrations/:id/reject', requireApiKey, requireSession, (req: Request, res: Response) => {
  const apiKeyRecord = (req as any).apiKeyRecord;
  if (!apiKeyRecord.is_admin) {
    return res.status(403).json({ detail: 'admin only' });
  }

  const requestId = parseInt(req.params.id);
  const registrationRepo = getRegistrationRepo();
  registrationRepo.reject(requestId);
  res.json({ status: 'ok' });
});

// GET /auth/oauth-start
router.get('/auth/oauth-start', async (req: Request, res: Response) => {
  const settingRepo = getSettingRepo();
  const { loadOAuthConfigFromFile } = await import('../infrastructure/config.js');
  const config = loadOAuthConfigFromFile();
  const clientId = settingRepo.get('client_id') || process.env.GITLAB_OAUTH_CLIENT_ID || config.client_id;
  const clientSecret = settingRepo.get('client_secret') || process.env.GITLAB_OAUTH_CLIENT_SECRET || config.client_secret;

  if (!clientId || !clientSecret) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Jihu OAuth Setup</title></head>
      <body>
        <h1>Jihu OAuth Setup</h1>
        <p>Error: GitLab Application credentials not found.</p>
        <p>Please run <code>npm run oauth-setup</code> first.</p>
      </body>
      </html>
    `);
  }

  const callbackUrl = `${req.protocol}://${req.get('host')}/auth/oauth-callback`;
  const authUrl = `https://jihulab.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=api`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Jihu OAuth Authorization</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #0f172a; color: #e5e7eb; }
        .container { background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(55, 65, 81, 0.85); border-radius: 12px; padding: 24px; }
        .btn { display: inline-block; padding: 12px 24px; background: rgba(37, 99, 235, 0.3); border: 1px solid rgba(37, 99, 235, 0.7); border-radius: 8px; color: #bfdbfe; text-decoration: none; font-weight: 500; margin: 16px 0; }
        .btn:hover { background: rgba(37, 99, 235, 0.5); }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Jihu OAuth Authorization</h1>
        <p>Click the button below to authorize this application.</p>
        <p><strong>Redirect URI:</strong> <code>${callbackUrl}</code></p>
        <a href="${authUrl}" class="btn" id="authBtn">Authorize with Jihu GitLab</a>
      </div>
      <script>
        setTimeout(() => { document.getElementById('authBtn').click(); }, 2000);
      </script>
    </body>
    </html>
  `);
});

// GET /auth/oauth-callback
router.get('/auth/oauth-callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    return res.send(`<html><body><h1>OAuth Error</h1><p>${error}</p></body></html>`);
  }

  if (!code) {
    return res.send('<html><body><h1>OAuth Error</h1><p>No authorization code received.</p></body></html>');
  }

  const settingRepo = getSettingRepo();
  const { loadOAuthConfigFromFile } = await import('../infrastructure/config.js');
  const config = loadOAuthConfigFromFile();
  const clientId = settingRepo.get('client_id') || process.env.GITLAB_OAUTH_CLIENT_ID || config.client_id;
  const clientSecret = settingRepo.get('client_secret') || process.env.GITLAB_OAUTH_CLIENT_SECRET || config.client_secret;

  if (!clientId || !clientSecret) {
    return res.send('<html><body><h1>OAuth Error</h1><p>GitLab Application credentials not found.</p></body></html>');
  }

  const callbackUrl = `${req.protocol}://${req.get('host')}/auth/oauth-callback`;

  try {
    const axios = (await import('axios')).default;
    const response = await axios.post('https://jihulab.com/oauth/token', {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
    });

    const { access_token, refresh_token } = response.data;
    if (!access_token || !refresh_token) {
      throw new Error('Missing tokens in response');
    }

    // 保存到配置文件
    const { writeFileSync } = await import('fs');
    const { OAUTH_CONFIG_PATH } = await import('../infrastructure/config.js');
    
    writeFileSync(OAUTH_CONFIG_PATH, JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      access_token,
      refresh_token,
      redirect_uri: callbackUrl,
    }, null, 2), 'utf-8');

    // 保存到SQLite
    settingRepo.set('access_token', access_token);
    settingRepo.set('refresh_token', refresh_token);
    settingRepo.set('redirect_uri', callbackUrl);

    // 清除OAuth服务缓存（重新导入以获取最新实例）
    const { getOAuthService } = await import('../infrastructure/dependencies.js');
    getOAuthService().clearCache();

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>OAuth Success</title></head>
      <body>
        <h1>OAuth Authorization Successful!</h1>
        <p>✓ Access token and refresh token have been saved.</p>
        <p>You can now use the Jihu CodeRider proxy API.</p>
      </body>
      </html>
    `);
  } catch (error: any) {
    const errorMsg = normalizeErrorMessage(error.message || 'OAuth error');
    res.send(`<html><body><h1>OAuth Error</h1><p>${errorMsg}</p></body></html>`);
  }
});

// POST /api/event_logging/batch (Claude Code兼容)
router.post('/api/event_logging/batch', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

export default router;

