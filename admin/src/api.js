/**
 * API 客户端封装
 *
 * 统一管理对后端 /api/admin/* 的请求：
 *   - 自动注入管理员 JWT
 *   - 统一错误处理（401 跳登录）
 *   - 返回 JSON
 *
 * token 存 localStorage('admin_token')。
 */

const TOKEN_KEY = 'stunning_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  const token = getToken();
  if (token) options.headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, options);
  } catch (err) {
    throw new Error(`网络请求失败: ${err.message}`);
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data.error || data.message || `请求失败 (${res.status})`;
    const e = new Error(msg);
    e.status = res.status;
    e.body = data;
    throw e;
  }
  return data;
}

// ===== 管理员认证 =====
export const authApi = {
  login: (username, password) => request('POST', '/api/admin/auth/login', { username, password }),
  me: () => request('GET', '/api/admin/auth/me'),
  changePassword: (oldPassword, newPassword) =>
    request('PUT', '/api/admin/auth/password', { oldPassword, newPassword }),
};

// ===== 用户管理 =====
export const usersApi = {
  list: (params) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/api/admin/users?${q}`);
  },
  get: (id) => request('GET', `/api/admin/users/${id}`),
  update: (id, data) => request('PUT', `/api/admin/users/${id}`, data),
  adjustPoints: (id, delta) => request('POST', `/api/admin/users/${id}/points`, { delta }),
  remove: (id) => request('DELETE', `/api/admin/users/${id}`),
};

// ===== 充值管理 =====
export const rechargeApi = {
  plans: () => request('GET', '/api/admin/recharge/plans'),
  savePlans: (plans) => request('PUT', '/api/admin/recharge/plans', { plans }),
  orders: (params) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/api/admin/recharge/orders?${q}`);
  },
  stats: () => request('GET', '/api/admin/recharge/stats'),
};

// ===== 系统配置 =====
export const settingsApi = {
  list: () => request('GET', '/api/admin/settings'),
  get: (key) => request('GET', `/api/admin/settings/${key}`),
  update: (key, value) => request('PUT', `/api/admin/settings/${key}`, { value }),
};

// ===== 视频任务 =====
export const videoApi = {
  tasks: (params) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/api/admin/video/tasks?${q}`);
  },
  stats: () => request('GET', '/api/admin/video/stats'),
  userTasks: (userId) => request('GET', `/api/admin/video/users/${userId}/tasks`),
};
