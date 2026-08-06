/**
 * 后端服务器 HTTP 客户端（主进程侧）
 *
 * - 从 configStore 读取 serverUrl 与 authToken，自动注入 Bearer token
 * - 暴露认证 / 用户 / Agent 相关接口
 * - Agent 对话使用 fetch 流式读取 SSE，通过回调推送 token
 *
 * 客户端只感知 serverUrl（可在设置中改）与账号密码；
 * 数据库连接信息全部留在服务器端，客户端无感。
 */
const { loadConfig, updateConfig } = require('./configStore');

function baseUrl() {
  return (loadConfig().serverUrl || '').replace(/\/+$/, '');
}

function token() {
  return loadConfig().authToken || '';
}

function authHeaders() {
  const t = token();
  return t ? { Authorization: 'Bearer ' + t } : {};
}

async function request(method, path, body) {
  const url = baseUrl() + path;
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!resp.ok) {
    const msg = json?.error || text || `HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json;
}

// ===== 认证 =====
async function register({ username, password, nickname }) {
  const data = await request('POST', '/api/auth/register', { username, password, nickname });
  if (data?.token) {
    updateConfig({ authToken: data.token, userId: data.user?.id ?? null });
  }
  return data;
}

async function login({ username, password }) {
  const data = await request('POST', '/api/auth/login', { username, password });
  if (data?.token) {
    updateConfig({ authToken: data.token, userId: data.user?.id ?? null });
  }
  return data;
}

function logout() {
  updateConfig({ authToken: '', userId: null });
}

function getAuth() {
  const cfg = loadConfig();
  return { serverUrl: cfg.serverUrl, token: cfg.authToken, userId: cfg.userId };
}

function setServerUrl(url) {
  updateConfig({ serverUrl: url });
  return loadConfig().serverUrl;
}

async function checkHealth() {
  try {
    const data = await request('GET', '/api/health');
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ===== 用户 =====
const getProfile = () => request('GET', '/api/user/profile');
const updateProfile = (partial) => request('PUT', '/api/user/profile', partial);
const getPoints = () => request('GET', '/api/user/points');
const addPoints = (delta) => request('POST', '/api/user/points', { delta });

// ===== Agent =====
const listAgents = () => request('GET', '/api/agents');
const getAgent = (id) => request('GET', `/api/agents/${id}`);
const createAgent = (payload) => request('POST', '/api/agents', payload);
const getAgentMessages = (id) => request('GET', `/api/agents/${id}/messages`);

/**
 * 与 Agent 流式对话
 * @param {number} agentId
 * @param {string} message
 * @param {Array<{role,content}>} history
 * @param {{onToken:(t:string)=>void}} callbacks
 * @param {AbortSignal} signal
 * @returns {Promise<{success:boolean}>}
 */
async function chatAgentStream(agentId, message, history, callbacks = {}, signal) {
  const url = baseUrl() + `/api/agents/${agentId}/chat`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message, history }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch {}
    throw new Error(msg || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE 以空行分隔事件
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      let data = '';
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      let payload = null;
      try { payload = data ? JSON.parse(data) : null; } catch {}

      if (event === 'token' && payload?.token) {
        callbacks.onToken?.(payload.token);
      } else if (event === 'done') {
        // 流正常结束
      } else if (event === 'error') {
        throw new Error(payload?.message || 'Agent 对话失败');
      }
    }
  }
  return { success: true };
}

module.exports = {
  register, login, logout, getAuth, setServerUrl, checkHealth,
  getProfile, updateProfile, getPoints, addPoints,
  listAgents, getAgent, createAgent, getAgentMessages,
  chatAgentStream,
};
