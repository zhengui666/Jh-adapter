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
      // 确保 message 对象存在
      if (!ch || typeof ch !== "object") {
        return null;
      }
      const msg = ch?.message || {};
      if (!msg || typeof msg !== "object") {
        return null;
      }
      let content = msg.content;

      // 处理 content 格式
      if (typeof content === "string") {
        if (isMultimodal) {
          // 多模态模型：转换为数组格式
          // 即使是空字符串，也转换为数组（后面会确保至少有一个元素）
          content = content.trim() === "" ? [] : [{ type: "text", text: content }];
        } else {
          // 纯文本模型：保持字符串格式（符合 OpenAI 规范）
          content = content.trim() === "" ? "" : content;
        }
      } else if (Array.isArray(content)) {
        // 已经是 content-part 数组，确保每个元素都有 type 和 text
        // 严格过滤：先移除所有 null/undefined/无效元素
        const validParts = content.filter((part) => part != null && part !== undefined);
        
        content = validParts
          .map((part: any) => {
            // 如果已经是正确的格式
            if (part && typeof part === "object" && part.type && (part.text !== undefined || part.image_url !== undefined)) {
              // 确保对象是完整的，没有缺失字段
              if (part.type === "text" && part.text === undefined) {
                return { type: "text", text: "" };
              }
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
          .filter((part) => part != null && part !== undefined); // 严格过滤掉 null/undefined
        
        // 如果是纯文本模型但收到了数组，转换为字符串（取第一个文本部分）
        if (!isMultimodal && content.length > 0) {
          const firstTextPart = content.find((p: any) => p && p.type === "text");
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
        
        // 最终验证：确保数组中每个元素都有 type 属性，并移除所有无效元素
        content = content
          .filter((part: any) => {
            // 严格过滤：只保留有效的对象
            if (!part || typeof part !== "object") {
              return false;
            }
            // 确保有 type 属性
            if (!part.type) {
              console.warn("[adaptJihuToOpenAI] Content part missing 'type', fixing:", part);
              part.type = "text";
            }
            return true;
          })
          .map((part: any) => {
            // 确保每个元素都是有效的对象，且包含必需的字段
            if (part.type === "text" && part.text === undefined) {
              part.text = "";
            }
            return part;
          });
        
        // 如果数组为空，添加一个空文本元素（避免 Cline 等客户端访问 content[0] 时出错）
        // 注意：这不符合严格的 OpenAI 规范（空数组应该是允许的），但为了兼容性
        if (content.length === 0) {
          content = [{ type: "text", text: "" }];
        }
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

  // 确保 choices 数组至少有一个元素（避免客户端访问 choices[0] 时出错）
  if (choices.length === 0) {
    choices.push({
      index: 0,
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: isMultimodal ? [{ type: "text", text: "" }] : "",
      },
    });
  }

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


