<template>
  <div class="app-shell">
    <div class="app-shell-left">
      <header class="app-header">
        <div class="app-title">
          <div class="app-title-main">Jihu CodeRider Playground</div>
          <div class="app-title-sub">OpenAI-compatible proxy for your local workflows</div>
        </div>
        <div class="badge">
          <span class="badge-dot"></span>
          <span v-if="currentUser">
            Logged in as {{ currentUser.username }}<span v-if="currentUser.is_admin"> · admin</span>
          </span>
          <span v-else>Not authenticated</span>
        </div>
      </header>

      <div class="content-section">
        <div class="section-label">Chat</div>
        <div class="fade-card">
          <div class="section-title">
            <div>
              <div class="top-row">
                <div class="section-title-main">Conversational agent</div>
                <div class="selection-pill">
                  <span class="selection-label">Model</span>
                  <span class="selection-value">{{ selectedModel }}</span>
                </div>
              </div>
              <div class="section-title-sub">
                Ask questions, prototype ideas, or interact with your code context.
              </div>
            </div>
            <div class="pill-small">Streaming via /v1/chat/completions</div>
          </div>

          <template v-if="canChat">
            <ChatPanel
              :api-base-url="apiBaseUrl"
              :default-model="defaultModel"
              :model="selectedModel"
              :api-key="activeApiKey"
            />
          </template>
          <div v-else class="chat-locked">
            <div class="chat-locked-title">需要登录才能聊天</div>
            <div class="chat-locked-sub">请在右侧 “Account” 面板登录或注册，并等待管理员批准。</div>
          </div>

          <div class="footer-hint">
            <span>Tip: Bind this endpoint in any OpenAI-compatible client.</span>
            <span class="kbd">base_url={{ apiBaseUrl }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="app-shell-right">
      <header class="app-header">
        <div class="app-title">
          <div class="app-title-main">Models & telemetry</div>
          <div class="app-title-sub">Discover all available Jihu models in one place.</div>
        </div>
        <div class="pill-tabs">
          <button
            class="pill-tab"
            :class="{ active: rightTab === 'models' }"
            @click="rightTab = 'models'"
          >
            Models
          </button>
          <button
            class="pill-tab"
            :class="{ active: rightTab === 'meta' }"
            @click="rightTab = 'meta'"
          >
            Meta
          </button>
          <button
            class="pill-tab"
            :class="{ active: rightTab === 'account' }"
            @click="rightTab = 'account'"
          >
            Account
          </button>
        </div>
      </header>

      <div class="content-section">
        <div class="section-label">
          {{
            rightTab === "models"
              ? "Model catalog"
              : rightTab === "meta"
                ? "Integration meta"
                : "Account & API keys"
          }}
        </div>
        <div class="fade-card-secondary">
          <template v-if="rightTab === 'models'">
            <ModelList
              :api-base-url="apiBaseUrl"
              :default-model="defaultModel"
              :selected-model="selectedModel"
              @update:selected-model="(m) => (selectedModel = m)"
            />

            <div class="footer-hint">
              <span>Use these IDs directly in your OpenAI SDK clients.</span>
              <a
                class="link"
                href="https://platform.openai.com/docs/api-reference/chat"
                target="_blank"
                rel="noreferrer"
              >
                View OpenAI Chat API docs
              </a>
            </div>
          </template>

          <template v-else-if="rightTab === 'meta'">
            <div class="meta-grid">
              <div class="meta-card">
                <div class="meta-title">Current backend</div>
                <div class="meta-body">
                  <div class="meta-row">
                    <span class="meta-label">Base URL</span>
                    <span class="meta-value">{{ apiBaseUrl }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">Default model</span>
                    <span class="meta-value">{{ defaultModel }}</span>
                  </div>
                </div>
              </div>

              <div class="meta-card">
                <div class="meta-title">Curl example</div>
                <pre class="meta-code"><code>curl -s {{ apiBaseUrl }}/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"{{ defaultModel }}","messages":[{"role":"user","content":"Hello"}]}'</code></pre>
              </div>

              <div class="meta-card">
                <div class="meta-title">OpenAI SDK snippet</div>
                <pre class="meta-code"><code>from openai import OpenAI

client = OpenAI(
    base_url="{{ apiBaseUrl }}",
    api_key="jihu-local",
)</code></pre>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="account-grid">
              <div class="meta-card">
                <div class="meta-title">Authentication</div>
                <div class="meta-body">
                  <template v-if="!currentUser">
                    <div class="meta-row">
                      <span class="meta-label">Status</span>
                      <span class="meta-value">Not logged in</span>
                    </div>
                    <form class="account-form" @submit.prevent="handleAuthSubmit">
                      <label class="field">
                        <span>Username</span>
                        <input v-model="authForm.username" type="text" autocomplete="username" />
                      </label>
                      <label class="field">
                        <span>Password</span>
                        <input
                          v-model="authForm.password"
                          type="password"
                          autocomplete="current-password"
                        />
                      </label>
                      <div class="account-actions">
                        <button type="submit" class="btn-primary">
                          {{ isRegisterMode ? "Register & get API key" : "Login" }}
                        </button>
                        <button
                          type="button"
                          class="btn-ghost"
                          @click="isRegisterMode = !isRegisterMode"
                        >
                          Switch to {{ isRegisterMode ? "Login" : "Register" }}
                        </button>
                      </div>
                      <p v-if="authError" class="error-text">{{ authError }}</p>
                    </form>
                  </template>

                  <template v-else>
                    <div class="meta-row">
                      <span class="meta-label">User</span>
                      <span class="meta-value">
                        {{ currentUser.username }}
                        <span v-if="currentUser.is_admin">· admin</span>
                      </span>
                    </div>
                    <div class="meta-row">
                      <span class="meta-label">Active API key</span>
                      <span class="meta-value">
                        <span v-if="activeApiKey">{{ activeApiKey }}</span>
                        <span v-else>None</span>
                      </span>
                    </div>
                    <button type="button" class="btn-ghost" @click="logout">
                      Log out
                    </button>
                  </template>
                </div>
              </div>

              <div class="meta-card" v-if="currentUser">
                <div class="meta-title">API keys & usage</div>
                <div class="meta-body api-keys">
                  <div class="api-keys-header">
                    <button type="button" class="btn-primary" @click="createApiKey">
                      New API key
                    </button>
                    <span class="meta-label">
                      Total keys: {{ apiKeys.length }}
                    </span>
                  </div>
                  <div v-if="apiKeys.length === 0" class="meta-label">
                    No API keys yet. Create one to start using the proxy.
                  </div>
                  <ul v-else class="api-keys-list">
                    <li
                      v-for="k in apiKeys"
                      :key="k.id"
                      :class="['api-key-item', { inactive: !k.is_active }]"
                    >
                      <div class="api-key-main">
                        <div class="api-key-row">
                          <span class="api-key-label">{{ k.name || "Unnamed key" }}</span>
                          <span class="api-key-status">
                            {{ k.is_active ? "active" : "inactive" }}
                          </span>
                        </div>
                        <div class="api-key-value" @click="setActiveKey(k.key)">
                          {{ k.key }}
                        </div>
                      </div>
                      <div class="api-key-usage">
                        <span>Requests: {{ k.total_requests }}</span>
                        <span>Tokens in: {{ k.total_input_tokens }}</span>
                        <span>Tokens out: {{ k.total_output_tokens }}</span>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <div class="meta-card" v-if="currentUser?.is_admin">
                <div class="meta-title">Admin overview</div>
                <div class="meta-body">
                  <button type="button" class="btn-ghost" @click="loadAdminKeys">
                    Refresh overview
                  </button>
                  <button type="button" class="btn-ghost" @click="runOAuthSetup">
                    Run GitLab OAuth helper
                  </button>
                  <div v-if="adminKeys.length">
                    <p class="meta-label">Total keys: {{ adminKeys.length }}</p>
                    <ul class="api-keys-list small">
                      <li v-for="k in adminKeys" :key="k.id" class="api-key-item">
                        <div class="api-key-row">
                          <span class="api-key-label">{{ k.username }}</span>
                          <span class="api-key-status">
                            {{ k.is_active ? "active" : "inactive" }}
                          </span>
                        </div>
                        <div class="api-key-usage">
                          <span>Req: {{ k.total_requests }}</span>
                          <span>In: {{ k.total_input_tokens }}</span>
                          <span>Out: {{ k.total_output_tokens }}</span>
                        </div>
                      </li>
                    </ul>
                  </div>
                  <div v-if="pendingRegistrations.length" style="margin-top: 8px">
                    <p class="meta-label">Pending registrations: {{ pendingRegistrations.length }}</p>
                    <ul class="api-keys-list small">
                      <li
                        v-for="r in pendingRegistrations"
                        :key="r.id"
                        class="api-key-item"
                      >
                        <div class="api-key-row">
                          <span class="api-key-label">{{ r.username }}</span>
                          <span class="api-key-status">pending</span>
                        </div>
                        <div class="api-key-usage">
                          <span>Requested at: {{ r.created_at }}</span>
                        </div>
                        <div class="account-actions" style="margin-top: 4px">
                          <button type="button" class="btn-primary" @click="approveRegistration(r.id)">
                            Approve
                          </button>
                          <button type="button" class="btn-ghost" @click="rejectRegistration(r.id)">
                            Reject
                          </button>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, onMounted, computed } from "vue";
import ChatPanel from "./components/ChatPanel.vue";
import ModelList from "./components/ModelList.vue";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/v1";
const defaultModel = "maas/maas-chat-model";
const rightTab = ref<"models" | "meta">("models");
const selectedModel = ref<string>(defaultModel);

type ApiKeySummary = {
  id: number;
  key: string;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_requests: number;
  updated_at: string;
};

type UserInfo = {
  id: number;
  username: string;
  is_admin: boolean;
};

const currentUser = ref<UserInfo | null>(null);
const apiKeys = ref<ApiKeySummary[]>([]);
const adminKeys = ref<any[]>([]);
const activeApiKey = ref<string | null>(null);
const pendingRegistrations = ref<{ id: number; username: string; created_at: string }[]>([]);
const sessionToken = ref<string | null>(null);

const canChat = computed(() => !!currentUser.value && !!sessionToken.value);

const authForm = reactive({
  username: "",
  password: "",
});
const isRegisterMode = ref(true);
const authError = ref<string | null>(null);

function rememberActiveKey(key: string) {
  activeApiKey.value = key;
  localStorage.setItem("jihu_active_api_key", key);
}

function restoreActiveKey() {
  const k = localStorage.getItem("jihu_active_api_key");
  if (k) {
    activeApiKey.value = k;
  }
  const s = localStorage.getItem("jihu_session_token");
  if (s) {
    sessionToken.value = s;
  }
}

async function handleAuthSubmit() {
  authError.value = null;
  const endpoint = isRegisterMode.value ? "/auth/register" : "/auth/login";
  try {
    const root = apiBaseUrl.replace(/\/v1\/?$/, "");
    const resp = await fetch(root + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: authForm.username,
        password: authForm.password,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      authError.value = data.detail || "Authentication failed";
      return;
    }
    if (data.pending_approval) {
      // 非首个用户注册：只创建申请，等待管理员同意
      authError.value =
        data.message ||
        `Registration submitted. Please wait for admin (${data.admin_username || "admin"}) to approve.`;
      authForm.password = "";
      return;
    }

    if (data.user) {
      currentUser.value = data.user;
    }
    if (isRegisterMode.value && data.api_key) {
      // 首个管理员注册时返回单个 key
      apiKeys.value = [];
      rememberActiveKey(data.api_key);
    }
    if (data.api_keys) {
      apiKeys.value = data.api_keys;
      if (!activeApiKey.value && data.api_keys.length > 0) {
        rememberActiveKey(data.api_keys[0].key);
      }
    }
    if (data.session_token) {
      sessionToken.value = data.session_token;
      localStorage.setItem("jihu_session_token", data.session_token);
      startSessionPolling();
    }
    authForm.password = "";
  } catch (e: any) {
    authError.value = e?.message || String(e);
  }
}

async function refreshMyKeys() {
  if (!activeApiKey.value) return;
  const root = apiBaseUrl.replace(/\/v1\/?$/, "");
  const resp = await fetch(root + "/auth/api-keys", {
    headers: {
      "X-API-Key": activeApiKey.value,
      ...(sessionToken.value ? { "X-Session-Token": sessionToken.value } : {}),
    },
  });
  if (!resp.ok) return;
  const data = await resp.json();
  apiKeys.value = data.api_keys || [];
}

async function createApiKey() {
  if (!activeApiKey.value) return;
  const name = prompt("Optional name for this API key:");
  const root = apiBaseUrl.replace(/\/v1\/?$/, "");
  const resp = await fetch(root + "/auth/api-keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": activeApiKey.value,
      ...(sessionToken.value ? { "X-Session-Token": sessionToken.value } : {}),
    },
    body: JSON.stringify({ name }),
  });
  if (!resp.ok) return;
  const data = await resp.json();
  apiKeys.value = data.api_keys || [];
  if (data.api_key) {
    rememberActiveKey(data.api_key);
  }
}

async function loadAdminKeys() {
  if (!activeApiKey.value) return;
  if (!currentUser.value?.is_admin) return;
  const root = apiBaseUrl.replace(/\/v1\/?$/, "");
  const [keysResp, regsResp] = await Promise.all([
    fetch(root + "/admin/api-keys", {
      headers: {
        "X-API-Key": activeApiKey.value,
        ...(sessionToken.value ? { "X-Session-Token": sessionToken.value } : {}),
      },
    }),
    fetch(root + "/admin/registrations", {
      headers: {
        "X-API-Key": activeApiKey.value,
        ...(sessionToken.value ? { "X-Session-Token": sessionToken.value } : {}),
      },
    }),
  ]);
  if (keysResp.ok) {
    const data = await keysResp.json();
    adminKeys.value = data.api_keys || [];
  }
  if (regsResp.ok) {
    const data = await regsResp.json();
    pendingRegistrations.value = data.registrations || [];
  }
}

async function runOAuthSetup() {
  if (!activeApiKey.value || !currentUser.value?.is_admin) return;
  const root = apiBaseUrl.replace(/\/v1\/?$/, "");
  try {
    const resp = await fetch(root + "/admin/oauth/restart", {
      method: "POST",
      headers: {
        "X-API-Key": activeApiKey.value,
        ...(sessionToken.value ? { "X-Session-Token": sessionToken.value } : {}),
      },
    });
    const data = await resp.json();
    if (resp.ok && data.login_url) {
      window.open(data.login_url, "_blank");
    } else if (!resp.ok && data.detail) {
      alert(`Failed to start OAuth helper: ${data.detail}`);
    }
  } catch (e: any) {
    console.error("runOAuthSetup error", e);
    alert(`Failed to start OAuth helper: ${e?.message || e}`);
  }
}

async function approveRegistration(id: number) {
  if (!activeApiKey.value) return;
  const root = apiBaseUrl.replace(/\/v1\/?$/, "");
  const resp = await fetch(`${root}/admin/registrations/${id}/approve`, {
    method: "POST",
    headers: {
      "X-API-Key": activeApiKey.value,
      ...(sessionToken.value ? { "X-Session-Token": sessionToken.value } : {}),
    },
  });
  if (!resp.ok) return;
  await loadAdminKeys();
}

async function rejectRegistration(id: number) {
  if (!activeApiKey.value) return;
  const root = apiBaseUrl.replace(/\/v1\/?$/, "");
  const resp = await fetch(`${root}/admin/registrations/${id}/reject`, {
    method: "POST",
    headers: {
      "X-API-Key": activeApiKey.value,
      ...(sessionToken.value ? { "X-Session-Token": sessionToken.value } : {}),
    },
  });
  if (!resp.ok) return;
  await loadAdminKeys();
}

function setActiveKey(key: string) {
  rememberActiveKey(key);
}

function logout() {
  stopSessionPolling();
  currentUser.value = null;
  apiKeys.value = [];
  adminKeys.value = [];
  activeApiKey.value = null;
  pendingRegistrations.value = [];
  sessionToken.value = null;
  localStorage.removeItem("jihu_active_api_key");
  localStorage.removeItem("jihu_session_token");
}

async function checkSession() {
  if (!activeApiKey.value || !sessionToken.value) return false;
  const root = apiBaseUrl.replace(/\/v1\/?$/, "");
  try {
    const resp = await fetch(root + "/auth/check-session", {
      headers: {
        "X-API-Key": activeApiKey.value,
        "X-Session-Token": sessionToken.value,
      },
    });
    const data = await resp.json();
    return data.valid === true;
  } catch {
    return false;
  }
}

async function autoRefreshSession() {
  if (!activeApiKey.value) return false;
  const root = apiBaseUrl.replace(/\/v1\/?$/, "");
  try {
    const resp = await fetch(root + "/auth/refresh-session", {
      method: "POST",
      headers: {
        "X-API-Key": activeApiKey.value,
        ...(sessionToken.value ? { "X-Session-Token": sessionToken.value } : {}),
      },
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (data.session_token) {
      sessionToken.value = data.session_token;
      localStorage.setItem("jihu_session_token", data.session_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

let sessionCheckInterval: ReturnType<typeof setInterval> | null = null;

function startSessionPolling() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }
  // 每 2 分钟检查一次 session
  sessionCheckInterval = setInterval(async () => {
    if (!activeApiKey.value) return;
    const isValid = await checkSession();
    if (!isValid) {
      // Session 过期，尝试自动刷新
      const refreshed = await autoRefreshSession();
      if (!refreshed) {
        // 刷新失败，可能需要重新登录
        console.warn("Session expired and auto-refresh failed. Please login again.");
      }
    }
  }, 2 * 60 * 1000); // 2 分钟
}

function stopSessionPolling() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

onMounted(() => {
  restoreActiveKey();
  const s = localStorage.getItem("jihu_session_token");
  if (s) sessionToken.value = s;
  if (activeApiKey.value) {
    refreshMyKeys();
    startSessionPolling();
  }
});
</script>

<style scoped>
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.meta-card {
  background: rgba(15, 23, 42, 0.9);
  border-radius: 16px;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.35);
}

.meta-title {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 6px;
}

.meta-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.meta-label {
  color: rgba(148, 163, 184, 0.9);
}

.meta-value {
  color: #e5e7eb;
  word-break: break-all;
  text-align: right;
}

.meta-code {
  background: rgba(15, 23, 42, 0.95);
  border-radius: 8px;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace;
  font-size: 0.8rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
}

.top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.selection-pill {
  border-radius: 999px;
  padding: 2px 8px;
  border: 1px solid rgba(55, 65, 81, 0.9);
  background: rgba(15, 23, 42, 0.9);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
}

.selection-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6b7280;
}

.selection-value {
  color: #e5e7eb;
}

.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.account-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
}

.field input {
  border-radius: 6px;
  border: 1px solid rgba(55, 65, 81, 0.9);
  background: rgba(15, 23, 42, 0.9);
  padding: 6px 8px;
  color: #e5e7eb;
}

.account-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.btn-primary {
  border-radius: 999px;
  border: 1px solid rgba(96, 165, 250, 0.8);
  background: rgba(37, 99, 235, 0.9);
  color: #e5e7eb;
  padding: 4px 10px;
  font-size: 0.8rem;
  cursor: pointer;
}

.btn-ghost {
  border-radius: 999px;
  border: 1px solid rgba(55, 65, 81, 0.9);
  background: transparent;
  color: #9ca3af;
  padding: 4px 10px;
  font-size: 0.8rem;
  cursor: pointer;
}

.error-text {
  color: #fca5a5;
  font-size: 0.75rem;
}

.api-keys {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
}

.api-keys-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.api-keys-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.api-keys-list.small .api-key-item {
  font-size: 0.75rem;
}

.api-key-item {
  border-radius: 8px;
  border: 1px solid rgba(55, 65, 81, 0.9);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.api-key-item.inactive {
  opacity: 0.6;
}

.api-key-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.api-key-label {
  font-weight: 500;
}

.api-key-status {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9ca3af;
}

.api-key-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace;
  font-size: 0.75rem;
  word-break: break-all;
  cursor: pointer;
}

.api-key-usage {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.7rem;
  color: #9ca3af;
}


.chat-locked {
  border-radius: 12px;
  border: 1px dashed rgba(148, 163, 184, 0.6);
  background: radial-gradient(circle at top left, rgba(15, 23, 42, 0.95), #020617);
  padding: 10px 12px;
  margin-top: 8px;
}

.chat-locked-title {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 4px;
}

.chat-locked-sub {
  font-size: 0.8rem;
  color: #9ca3af;
}
</style>