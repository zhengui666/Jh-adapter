/**
 * Main Entry Point - 主入口
 */
import express from 'express';
import cors from 'cors';
import routes from './presentation/routes.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

// 中间件
app.use(cors({
  origin: '*',
  credentials: true,
  methods: '*',
  allowedHeaders: '*',
}));

app.use(express.json());

// 路由
app.use('/', routes);

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ detail: err.message || 'Internal server error' });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Jihu CodeRider OpenAI Proxy server running on port ${PORT}`);
});

