import { Hono } from 'hono';

// TODO: 后续接入现有 domain/application/infrastructure 逻辑，并使用 D1 实现 Repository。

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok', backend: 'cloudflare-worker', note: 'WIP - logic not fully wired yet' });
});

// 临时占位：所有其他路径先返回 501，避免误以为已经完全可用
app.all('*', (c) => {
  return c.json(
    {
      error: 'NOT_IMPLEMENTED',
      message:
        'Cloudflare Workers 版本后端正在开发中，目前仅提供 /health，用于验证部署是否成功。请暂时继续使用 Vercel 或 Docker 后端。',
    },
    501
  );
});

export default app;


