/**
 * Claude 风格请求/响应与 OpenAI 风格之间的转换辅助函数
 *
 * 不依赖具体 HTTP 框架与环境，Node 与 Cloudflare 共用。
 */

import { CLAUDE_TO_JIHU_MODEL } from "../shared/model-utils.js";

export interface ClaudePayload {
  model: string;
  messages?: any[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  [key: string]: any;
}

export interface OpenAIChatCall {
  messages: any[];
  jihuModel: string;
  extraParams: Record<string, any>;
}

export function convertClaudeToOpenAI(payload: ClaudePayload): OpenAIChatCall {
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

  const jihuModel = CLAUDE_TO_JIHU_MODEL[payload.model] || payload.model;

  const extraParams: any = {};
  if (payload.max_tokens) extraParams.max_tokens = payload.max_tokens;
  if (payload.temperature !== undefined) extraParams.temperature = payload.temperature;
  if (payload.top_p !== undefined) extraParams.top_p = payload.top_p;
  if (payload.top_k !== undefined) extraParams.top_k = payload.top_k;
  if (payload.stop_sequences) extraParams.stop_sequences = payload.stop_sequences;

  return {
    messages: openaiMessages,
    jihuModel,
    extraParams,
  };
}

export function buildClaudeResponse(result: any, originalModel: string): any {
  return {
    id: result.id || "msg-" + Date.now(),
    type: "message",
    role: "assistant",
    content: result.choices?.[0]?.message?.content
      ? [{ type: "text", text: result.choices[0].message.content }]
      : [],
    model: originalModel,
    stop_reason: result.choices?.[0]?.finish_reason || "end_turn",
    stop_sequence: null,
    usage: result.usage,
  };
}


