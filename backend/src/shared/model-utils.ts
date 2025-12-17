/**
 * Shared model utilities
 *
 * 纯业务常量与工具函数，不依赖 Node.js API，方便在 Node 后端与 Cloudflare Worker 之间复用。
 */

// 基础默认模型（不含任何环境变量逻辑）
export const BASE_DEFAULT_MODEL = 'maas/maas-chat-model';

// 静态补充模型列表，用于确保常用 MaaS 模型始终出现在 /v1/models 与 /v1/models/full 中
export const STATIC_CHAT_MODELS = [
  { id: 'maas-minimax-m2', type: 'chat', name: 'maas-minimax-m2', provider: 'minimax' },
  { id: 'maas-deepseek-v3.1', type: 'chat', name: 'maas-deepseek-v3.1', provider: 'deepseek' },
  { id: 'maas-glm-4.6', type: 'chat', name: 'maas-glm-4.6', provider: 'glm' },
];

// Claude → Jihu CodeRider 模型映射
export const CLAUDE_TO_JIHU_MODEL: Record<string, string> = {
  'claude-3-5-sonnet-20241022': 'maas-minimax-m2',
  'claude-3-5-haiku-20241022': 'maas-deepseek-v3.1',
  'claude-3-opus-20240229': 'maas-glm-4.6',
  'claude-sonnet-4-5-20250929': 'maas-minimax-m2',
  'claude-haiku-4-5-20251001': 'maas-deepseek-v3.1',
  'claude-opus-4-5-20251101': 'maas-glm-4.6',
};

// 去除模型名前缀（maas/、server/ 等），Cloudflare 与 Node 端都在用
export function stripModelPrefix(model: string): string {
  for (const prefix of ['maas/', 'server/']) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
  }
  return model;
}


