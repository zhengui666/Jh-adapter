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

  const choices = rawChoices
    .filter((ch) => ch != null) // 过滤掉 null/undefined
    .map((ch, index) => {
      const msg = ch?.message || {};
      let content = msg.content;

      // 将字符串内容封装为 [{ type: 'text', text: '...' }]
      if (typeof content === "string") {
        content = content.trim() === "" ? [] : [{ type: "text", text: content }];
      } else if (Array.isArray(content)) {
        // 已经是 content-part 数组，确保每个元素都有 type 和 text
        content = content
          .filter((part) => part != null) // 过滤掉 null/undefined
          .map((part: any) => {
            // 如果已经是正确的格式
            if (part && typeof part === "object" && part.type && (part.text !== undefined || part.image_url !== undefined)) {
              return part;
            }
            // 如果是字符串
            if (typeof part === "string") {
              return part.trim() === "" ? null : { type: "text", text: part };
            }
            // 其他情况转换为文本
            const textValue = String(part ?? "").trim();
            return textValue === "" ? null : { type: "text", text: textValue };
          })
          .filter((part) => part != null); // 再次过滤掉空字符串转换后的 null
      } else if (content == null || content === undefined) {
        content = [];
      } else {
        // 其它类型兜底为字符串
        const textValue = String(content).trim();
        content = textValue === "" ? [] : [{ type: "text", text: textValue }];
      }

      // 确保 content 始终是数组，且每个元素都有 type
      if (!Array.isArray(content)) {
        content = [];
      }
      
      // 最终验证：确保数组中每个元素都有 type 属性
      content = content.filter((part: any) => {
        if (!part || typeof part !== "object") {
          return false;
        }
        if (!part.type) {
          console.warn("[adaptJihuToOpenAI] Content part missing 'type', fixing:", part);
          part.type = "text";
        }
        return true;
      });

      return {
        index: ch?.index ?? index,
        finish_reason: ch?.finish_reason ?? "stop",
        message: {
          role: msg.role || "assistant",
          content, // 确保 content 是有效的数组
        },
      };
    })
    .filter((choice) => choice != null); // 最终过滤掉无效的 choice

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


