<template>
  <div class="model-list">
    <div class="section-title">
      <div>
        <div class="section-title-main">Available Models</div>
        <div class="section-title-sub">
          Models discovered from Jihu CodeRider configuration.
        </div>
      </div>
      <button type="button" class="ghost-btn" @click="fetchModels" :disabled="loading">
        <span v-if="loading">Refreshing...</span>
        <span v-else>Refresh</span>
      </button>
    </div>

    <div class="divider"></div>

    <div v-if="error" class="error-banner">
      <div v-if="errorLinkUrl">
        <div>{{ errorText }}</div>
        <a :href="errorLinkUrl" target="_blank" rel="noreferrer" class="error-link">
          {{ errorLinkLabel }}
        </a>
      </div>
      <div v-else>{{ error }}</div>
    </div>

    <div class="model-tags">
      <button
        v-for="type in modelTypes"
        :key="type.value"
        class="pill-tab"
        :class="{ active: activeType === type.value }"
        @click="activeType = type.value"
      >
        {{ type.label }}
      </button>
    </div>

    <div class="model-table">
      <div
        v-for="m in filteredModels"
        :key="m.id"
        class="model-row"
        :class="{ highlighted: m.id === defaultModel }"
        @click="selectModel(m.id)"
      >
        <div class="model-main">
          <div class="model-id">
            {{ m.id }}
            <span v-if="m.id === defaultModel" class="badge-small">default</span>
          </div>
          <div class="model-meta">
            <span v-if="m.provider" class="pill-small">
              Provider: <strong>{{ m.provider }}</strong>
            </span>
            <span v-if="m.context_window" class="pill-small">
              Context: in {{ m.context_window.input }} / out {{ m.context_window.output }}
            </span>
            <span v-if="m.temperature !== undefined" class="pill-small">
              Temperature: {{ m.temperature }}
            </span>
          </div>
        </div>
        <div class="model-type">
          <span class="type-pill" :data-type="m.type">
            {{ m.type }}
          </span>
        </div>
      </div>

      <div v-if="!loading && filteredModels.length === 0" class="empty">
        No models found for this category.
      </div>
      <div v-if="loading" class="loading">
        Loading model list...
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import axios from "axios";

interface ModelInfo {
  id: string;
  type: "chat" | "code_completion" | "loom" | string;
  name?: string;
  provider?: string;
  context_window?: { input?: number; output?: number };
  temperature?: number;
}

const props = defineProps<{
  apiBaseUrl: string;
  defaultModel: string;
  selectedModel: string;
}>();

const emit = defineEmits<{
  (e: "update:selectedModel", value: string): void;
}>();

const models = ref<ModelInfo[]>([]);
const loading = ref(false);
const error = ref("");
const errorText = ref("");
const errorLinkUrl = ref("");
const errorLinkLabel = ref("");
const activeType = ref<"all" | "chat" | "code_completion" | "loom">("chat");

const modelTypes = [
  { value: "chat", label: "Chat" },
  { value: "code_completion", label: "Code" },
  { value: "loom", label: "Loom" },
  { value: "all", label: "All" },
];

const filteredModels = computed(() => {
  if (activeType.value === "all") return models.value;
  return models.value.filter((m) => m.type === activeType.value);
});

const defaultModel = computed(() => props.selectedModel || props.defaultModel || "maas/maas-chat-model");

async function fetchModels() {
  loading.value = true;
  error.value = "";
  try {
    const resp = await axios.get(`${props.apiBaseUrl}/models/full`);
    const raw = resp.data?.data || [];
    models.value = raw as ModelInfo[];
  } catch (err: any) {
    const detail = err?.response?.data?.detail;
    if (detail && typeof detail === "object") {
      if (detail.error === "jihu_auth_expired") {
        errorText.value =
          (detail.message || "Jihu auth expired.") +
          (detail.hint ? "\n" + detail.hint : "");
        // 优先使用 local_oauth_url（本地触发接口），如果没有则使用 login_url
        const oauthUrl = detail.local_oauth_url || detail.login_url || "/auth/oauth-start";
        // 如果是相对路径，需要拼接完整的 base URL
        errorLinkUrl.value = oauthUrl.startsWith("http")
          ? oauthUrl
          : `${props.apiBaseUrl.replace(/\/v1\/?$/, "")}${oauthUrl}`;
        errorLinkLabel.value = "Refresh Jihu Auth (Auto Login)";
        error.value = errorText.value; // 保持兼容性
      } else {
        error.value = JSON.stringify(detail, null, 2);
        errorText.value = "";
        errorLinkUrl.value = "";
        errorLinkLabel.value = "";
      }
    } else {
      const msg =
        (typeof detail === "string" && detail) ||
        err?.message ||
        "Failed to fetch models from backend.";
      error.value = msg;
      errorText.value = "";
      errorLinkUrl.value = "";
      errorLinkLabel.value = "";
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchModels();
});

function selectModel(id: string) {
  emit("update:selectedModel", id);
}
</script>

<style scoped>
.model-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.error-banner {
  border-radius: 10px;
  border: 1px solid rgba(248, 113, 113, 0.7);
  background: rgba(127, 29, 29, 0.4);
  color: #fecaca;
  font-size: 11px;
  padding: 6px 8px;
  margin: 6px 0 4px;
}

.error-link {
  display: inline-block;
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(37, 99, 235, 0.3);
  border: 1px solid rgba(37, 99, 235, 0.7);
  color: #bfdbfe;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}

.error-link:hover {
  background: rgba(37, 99, 235, 0.5);
  border-color: rgba(37, 99, 235, 0.9);
}

.model-tags {
  display: inline-flex;
  background: rgba(15, 23, 42, 0.95);
  border-radius: 999px;
  border: 1px solid rgba(55, 65, 81, 0.85);
  padding: 3px;
  gap: 4px;
  font-size: 11px;
  margin-bottom: 8px;
}

.model-table {
  border-radius: 12px;
  background: radial-gradient(circle at top, rgba(15, 23, 42, 0.95), #020617);
  border: 1px solid rgba(31, 41, 55, 0.95);
  padding: 8px 8px 6px;
  font-size: 11px;
  max-height: 360px;
  overflow: hidden auto;
}

.model-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}

.model-row:hover {
  background: radial-gradient(circle at left, rgba(37, 99, 235, 0.25), transparent);
  border-color: rgba(37, 99, 235, 0.5);
}

.model-row.highlighted {
  border-color: rgba(34, 197, 94, 0.7);
  background: radial-gradient(circle at left, rgba(34, 197, 94, 0.15), transparent);
}

.model-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-id {
  font-size: 11px;
  font-weight: 500;
  color: #e5e7eb;
  word-break: break-all;
}

.model-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.model-type {
  display: flex;
  align-items: flex-start;
}

.badge-small {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid rgba(34, 197, 94, 0.8);
  color: #bbf7d0;
  font-size: 10px;
}

.type-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.type-pill[data-type="chat"] {
  background: rgba(37, 99, 235, 0.15);
  border: 1px solid rgba(37, 99, 235, 0.7);
  color: #bfdbfe;
}

.type-pill[data-type="code_completion"] {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.6);
  color: #bbf7d0;
}

.type-pill[data-type="loom"] {
  background: rgba(244, 114, 182, 0.1);
  border: 1px solid rgba(244, 114, 182, 0.7);
  color: #f9a8d4;
}

.empty,
.loading {
  text-align: center;
  color: #6b7280;
  padding: 6px 0;
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

.ghost-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ghost-btn:hover:not(:disabled) {
  border-color: rgba(148, 163, 184, 0.9);
}
</style>


