<template>
  <div class="chat-panel">
    <div class="chat-messages" ref="scrollContainer">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        class="chat-bubble-wrapper"
        :class="msg.role"
      >
        <div class="chat-bubble">
          <div class="chat-meta">
            <span class="chat-role">
              {{ msg.role === "user" ? "You" : "Assistant" }}
            </span>
          </div>
          <div class="chat-content">
            <template v-if="msg.linkUrl">
              <p>{{ msg.content }}</p>
              <a
                class="auth-link"
                :href="msg.linkUrl"
                target="_blank"
                rel="noreferrer"
              >
                {{ msg.linkLabel || "Open Jihu auth page" }}
              </a>
            </template>
            <pre v-else-if="msg.code" class="code-block"><code>{{ msg.content }}</code></pre>
            <p v-else>{{ msg.content }}</p>
          </div>
        </div>
      </div>
      <div v-if="isStreaming" class="chat-bubble-wrapper assistant">
        <div class="chat-bubble ghost">
          <div class="dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </div>

    <form class="chat-input-area" @submit.prevent="handleSend">
      <textarea
        v-model="input"
        placeholder="Ask anything about your code or ideas..."
        @keydown.enter.exact.prevent="handleSend"
        rows="2"
      />
      <div class="chat-input-footer">
        <div class="chat-input-meta">
          <span class="pill-small">
            Model:
            <strong>{{ currentModel }}</strong>
          </span>
        </div>
        <div class="chat-input-actions">
          <button type="button" class="ghost-btn" @click="clearChat">Clear</button>
          <button type="submit" class="primary" :disabled="!input.trim() || isSending">
            <span v-if="isSending">Sending...</span>
            <span v-else>Send</span>
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import axios from "axios";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  code?: boolean;
  linkUrl?: string;
  linkLabel?: string;
}

const props = defineProps<{
  apiBaseUrl: string;
  defaultModel: string;
  model?: string;
  apiKey?: string | null;
}>();

const messages = ref<ChatMessage[]>([
  {
    role: "assistant",
    content: "Hi! I am your Jihu CodeRider proxy assistant. Ask me anything in English.",
  },
]);

const input = ref("");
const isSending = ref(false);
const isStreaming = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);

const currentModel = computed(
  () => props.model || props.defaultModel || "maas/maas-chat-model",
);

async function scrollToBottom() {
  await nextTick();
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
}

async function handleSend() {
  const content = input.value.trim();
  if (!content || isSending.value) return;

  messages.value.push({ role: "user", content });
  input.value = "";
  isSending.value = true;
  isStreaming.value = true;

  await scrollToBottom();

  try {
    const payload = {
      model: currentModel.value,
      messages: [
        ...messages.value
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.content })),
      ],
    };

    const resp = await axios.post(`${props.apiBaseUrl}/chat/completions`, payload, {
      headers: props.apiKey ? { "X-API-Key": props.apiKey } : undefined,
    });
    const choice = resp.data?.choices?.[0];
    const text = choice?.message?.content || "[empty response]";

    messages.value.push({
      role: "assistant",
      content: text,
    });
  } catch (err: any) {
    const detail = err?.response?.data?.detail;
    let msg: string;

    if (detail && typeof detail === "object") {
      // 处理后端返回的结构化错误（例如 jihu_auth_expired）
      if (detail.error === "jihu_auth_expired") {
        const baseMsg = (detail.message || "Jihu auth expired.") +
          (detail.hint ? "\n" + detail.hint : "");
        // 优先使用 local_oauth_url（本地触发接口），如果没有则使用 login_url
        const oauthUrl = detail.local_oauth_url || detail.login_url || "/auth/oauth-start";
        // 如果是相对路径，需要拼接完整的 base URL
        const fullUrl = oauthUrl.startsWith("http") 
          ? oauthUrl 
          : `${props.apiBaseUrl.replace(/\/v1\/?$/, "")}${oauthUrl}`;

        messages.value.push({
          role: "assistant",
          content: `Error:\n${baseMsg}`,
          linkUrl: fullUrl,
          linkLabel: "Refresh Jihu Auth (Auto Login)",
        });
        return;
      } else {
        msg = JSON.stringify(detail, null, 2);
      }
    } else {
      msg =
        (typeof detail === "string" && detail) ||
        err?.message ||
        "Request failed. Please check your backend server.";
    }

    messages.value.push({
      role: "assistant",
      content: `Error:\n${msg}`,
    });
  } finally {
    isSending.value = false;
    isStreaming.value = false;
    scrollToBottom();
  }
}

function clearChat() {
  messages.value = [
    {
      role: "assistant",
      content: "Conversation cleared. How can I help you now?",
    },
  ];
}

onMounted(scrollToBottom);
watch(
  () => messages.value.length,
  () => scrollToBottom(),
);
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 4px 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-bubble-wrapper {
  display: flex;
}

.chat-bubble-wrapper.user {
  justify-content: flex-end;
}

.chat-bubble-wrapper.assistant {
  justify-content: flex-start;
}

.chat-bubble {
  max-width: 80%;
  border-radius: 16px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.4;
}

.chat-bubble-wrapper.user .chat-bubble {
  background: linear-gradient(to right, #2563eb, #22c55e);
  color: white;
}

.chat-bubble-wrapper.assistant .chat-bubble {
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(55, 65, 81, 0.9);
}

.chat-bubble.ghost {
  width: 56px;
}

.chat-meta {
  font-size: 10px;
  color: #9ca3af;
  margin-bottom: 2px;
}

.chat-bubble-wrapper.user .chat-meta {
  color: rgba(226, 232, 240, 0.9);
}

.chat-role {
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.chat-content p {
  margin: 0;
  white-space: pre-wrap;
}

.code-block {
  margin: 0;
  background: #020617;
  border-radius: 10px;
  padding: 8px;
  font-size: 11px;
  overflow-x: auto;
}

.chat-input-area {
  margin-top: 4px;
  border-radius: 16px;
  border: 1px solid rgba(31, 41, 55, 0.9);
  background: radial-gradient(circle at top, rgba(15, 23, 42, 0.95), #020617);
  display: flex;
  flex-direction: column;
  padding: 8px 10px 8px;
  gap: 6px;
}

.chat-input-area textarea {
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: #e5e7eb;
  font-size: 13px;
  line-height: 1.4;
}

.chat-input-area textarea::placeholder {
  color: #6b7280;
}

.chat-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-input-meta {
  font-size: 11px;
  color: #6b7280;
}

.chat-input-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ghost-btn {
  border-radius: 999px;
  border: 1px solid rgba(55, 65, 81, 0.85);
  background: rgba(15, 23, 42, 0.9);
  color: #9ca3af;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
}

.ghost-btn:hover {
  border-color: rgba(148, 163, 184, 0.9);
}

.dots {
  display: inline-flex;
  gap: 4px;
}

.dots span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #9ca3af;
  opacity: 0.5;
  animation: blink 1.2s infinite ease-in-out;
}

.dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.2;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-1px);
  }
}
</style>


