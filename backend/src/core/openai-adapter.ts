/**
 * 将 Jihu / MiniMax 风格的 chatCompletions 响应
 * 适配为 OpenAI Chat Completions 兼容结构。
 *
 * 根据模型类型动态返回格式：
 * - 纯文本模型（如 DeepSeek V3.1）：返回字符串格式的 content（符合 OpenAI 规范）
 * - 多模态模型（如 MiniMax M2）：返回数组格式的 content [{type: "text", text: "..."}]
 */

import { isMultimodalModel } from '../shared/model-utils.js';

export function adaptJihuToOpenAI(raw: any, requestedModel?: string): any {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const created =
    typeof raw.created === "number" ? raw.created : Math.floor(Date.now() / 1000);

  const model = requestedModel || raw.model || "maas/maas-chat-model";
  const isMultimodal = isMultimodalModel(model);

  const rawChoices: any[] = Array.isArray(raw.choices) ? raw.choices : [];

  const choices = rawChoices
    .filter((ch) => ch != null) // 过滤掉 null/undefined
    .map((ch, index) => {
      const msg = ch?.message || {};
      let content = msg.content;

      // 处理 content 格式
      if (typeof content === "string") {
        if (isMultimodal) {
          // 多模态模型：转换为数组格式
          content = content.trim() === "" ? [] : [{ type: "text", text: content }];
        } else {
          // 纯文本模型：保持字符串格式（符合 OpenAI 规范）
          content = content.trim() === "" ? "" : content;
        }
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
        
        // 如果是纯文本模型但收到了数组，转换为字符串（取第一个文本部分）
        if (!isMultimodal && content.length > 0) {
          const firstTextPart = content.find((p: any) => p.type === "text");
          content = firstTextPart?.text || "";
        }
      } else if (content == null || content === undefined) {
        // null/undefined 处理
        content = isMultimodal ? [] : "";
      } else {
        // 其它类型兜底
        const textValue = String(content).trim();
        if (isMultimodal) {
          content = textValue === "" ? [] : [{ type: "text", text: textValue }];
        } else {
          content = textValue;
        }
      }

      // 多模态模型：确保 content 是数组，且每个元素都有 type
      if (isMultimodal) {
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
      }
      // 纯文本模型：确保 content 是字符串
      else {
        if (typeof content !== "string") {
          content = String(content || "");
        }
      }

      return {
        index: ch?.index ?? index,
        finish_reason: ch?.finish_reason ?? "stop",
        message: {
          role: msg.role || "assistant",
          content, // 多模态模型是数组，纯文本模型是字符串
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


