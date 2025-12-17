/**
 * 将 Jihu / MiniMax 风格的 chatCompletions 响应
 * 适配为 OpenAI Chat Completions 兼容结构。
 *
 * 目前主要解决:
 * - choices[*].message.content 为字符串时，转换为 content-part 数组，
 *   以兼容 Cline 等期望 content[].type / content[].text 的客户端。
 */

export function adaptJihuToOpenAI(raw: any, requestedModel?: string): any {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const created =
    typeof raw.created === "number" ? raw.created : Math.floor(Date.now() / 1000);

  const model = requestedModel || raw.model || "maas/maas-chat-model";

  const rawChoices: any[] = Array.isArray(raw.choices) ? raw.choices : [];

  const choices = rawChoices.map((ch, index) => {
    const msg = ch?.message || {};
    let content = msg.content;

    // 将字符串内容封装为 [{ type: 'text', text: '...' }]
    if (typeof content === "string") {
      content = [{ type: "text", text: content }];
    } else if (Array.isArray(content)) {
      // 已经是 content-part 数组则原样保留
      content = content.map((part: any) => {
        if (part && typeof part === "object" && part.type && part.text) {
          return part;
        }
        if (typeof part === "string") {
          return { type: "text", text: part };
        }
        return { type: "text", text: String(part ?? "") };
      });
    } else if (content == null) {
      content = [];
    } else {
      // 其它类型兜底为字符串
      content = [{ type: "text", text: String(content) }];
    }

    return {
      index: ch?.index ?? index,
      finish_reason: ch?.finish_reason ?? "stop",
      message: {
        role: msg.role || "assistant",
        content,
      },
    };
  });

  const usageRaw = raw.usage || {};
  const promptTokens = usageRaw.prompt_tokens ?? 0;
  const completionTokens = usageRaw.completion_tokens ?? 0;
  const totalTokens =
    usageRaw.total_tokens ?? promptTokens + completionTokens;

  const adapted: any = {
    id: raw.id || `chatcmpl-${Date.now().toString(16)}`,
    object: raw.object || "chat.completion",
    created,
    model,
    choices,
  };

  if (Object.keys(usageRaw).length > 0) {
    adapted.usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    };
  }

  return adapted;
}


