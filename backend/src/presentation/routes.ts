/**
 * Presentation Layer - Express路由
 * 
 * HTTP接口定义 - 统一路由入口
 */
import express from 'express';
import authRouter from './controllers/auth-controller.js';
import chatRouter from './controllers/chat-controller.js';
import modelsRouter from './controllers/models-controller.js';
import adminRouter from './controllers/admin-controller.js';
import oauthRouter from './controllers/oauth-controller.js';
import healthRouter from './controllers/health-controller.js';

const router = express.Router();

// 注册所有路由
router.use('/', authRouter);
router.use('/', chatRouter);
router.use('/', modelsRouter);
router.use('/', adminRouter);
router.use('/', oauthRouter);
router.use('/', healthRouter);

export default router;

