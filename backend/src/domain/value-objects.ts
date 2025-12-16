/**
 * Value Objects - 值对象
 * 
 * 不可变的业务值对象。
 */

export interface ModelMapping {
  readonly claudeModel: string;
  readonly jihuModel: string;
}

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface UsageStats {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly requestCount: number;
}

