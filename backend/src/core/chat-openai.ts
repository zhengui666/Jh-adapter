/**
 * OpenAI chat completions payload 处理助手
 *
 * 从原始请求体中拆出 messages / model / stream / 额外参数，供 Node 与 Cloudflare 共用。
 */

export interface OpenAIChatPayload {
  messages?: any[];
  model?: string;
  stream?: boolean;
  [key: string]: any;
}

export interface SplitChatPayload {
  messages: any[];
  model: string | undefined;
  stream: boolean;
  extraParams: Record<string, any>;
}

export function splitChatPayload(payload: OpenAIChatPayload): SplitChatPayload {
  const { messages = [], model, stream, ...rest } = payload || {};
  const extraParams: any = { ...rest };
  delete extraParams.messages;
  delete extraParams.model;
  delete extraParams.stream;

  return {
    messages,
    model,
    stream: Boolean(stream),
    extraParams,
  };
}


