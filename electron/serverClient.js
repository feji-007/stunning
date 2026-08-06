/**
 * 后端服务器 HTTP 客户端
 *
 * 封装与后端服务器的所有通信：
 *   - 认证（注册 / 登录 / 登出 / 状态恢复）
 *   - 用户资料 / 头像 / 积分
 *   - 内置 Seedance 视频生成（创建任务 / 查询任务 / 历史）
 *   - 充值（套餐 / 创建订单 / 模拟支付 / 历史）
 *
 * 自动从 configStore 读取 serverUrl 与 authToken，
 * 注入 Authorization: Bearer <token>。
 *
 * 内置 Seedance 视频生成由服务器调用方舟 API 并扣减用户积分；
 * 自定义视频生成 AI 由客户端 videoService 直接调用，不经过此模块。
 */
const { loadConfig, updateConfig } = require('./configStore');

/**
 * 通用请求封装
 */
async function request(method, path, body) {
  const config = loadConfig();
  const base = (config.serverUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置服务器地址，请先在登录界面设置');

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (config.authToken) {
    options.headers['Authorization'] = `Bearer ${config.authToken}`;
  }
  if (body !== undefined && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${base}${path}`, options);
  } catch (err) {
    throw new Error(`无法连接服务器: ${err.message}`);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data.error || data.message || `请求失败 (${res.status})`;
    const e = new Error(msg);
    e.status = res.status;
    e.body = data;
    throw e;
  }
  return data;
}

// ==================== 服务器连通性 ====================

async function checkHealth() {
  const config = loadConfig();
  const base = (config.serverUrl || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: '未配置服务器地址' };
  try {
    const res = await fetch(`${base}/api/health`, { method: 'GET' });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function setServerUrl(url) {
  updateConfig({ serverUrl: (url || '').trim() });
  return loadConfig().serverUrl;
}

// ==================== 认证 ====================

function getAuth() {
  const config = loadConfig();
  return {
    serverUrl: config.serverUrl,
    token: config.authToken || '',
    userId: config.userId || null,
    isAuthenticated: !!config.authToken,
  };
}

async function register(username, password) {
  const data = await request('POST', '/api/auth/register', { username, password });
  // 服务器返回 { token, user }
  updateConfig({ authToken: data.token, userId: data.user?.id || null });
  return data;
}

async function login(username, password) {
  const data = await request('POST', '/api/auth/login', { username, password });
  updateConfig({ authToken: data.token, userId: data.user?.id || null });
  return data;
}

function logout() {
  updateConfig({ authToken: '', userId: null });
}

// ==================== 用户资料 / 积分 ====================

const getProfile = () => request('GET', '/api/user/profile');
const updateProfile = (data) => request('PUT', '/api/user/profile', data);
const getPoints = () => request('GET', '/api/user/points');
const addPoints = (delta) => request('POST', '/api/user/points', { delta });

// ==================== 内置 Seedance 视频生成 ====================

/**
 * 创建视频生成任务（服务器调用方舟，预扣积分）
 * @param {object} params - { prompt, imageUrl, duration, resolution, ratio, watermark, seed, model }
 * @returns {object} { taskId, arkTaskId, status, pointsCost, pointsRemaining, ... }
 */
const createVideoTask = (params) => request('POST', '/api/video/generate', params);

/**
 * 查询任务状态（服务器代理方舟；失败自动退还积分）
 * @returns {object} { taskId, arkTaskId, status, videoUrl, pointsCost, refunded, pointsRemaining, ... }
 */
const getVideoTask = (taskId) => request('GET', `/api/video/tasks/${taskId}`);

/**
 * 当前用户的历史视频任务
 */
const getVideoHistory = () => request('GET', '/api/video/history');

// ==================== 充值（模拟支付）====================

/**
 * 获取充值套餐列表
 */
const getRechargePlans = () => request('GET', '/api/recharge/plans');

/**
 * 创建充值订单
 * @param {string} planId - 套餐 ID
 * @returns {object} { id, orderNo, planId, price, points, bonus, status, ... }
 */
const createRechargeOrder = (planId) => request('POST', '/api/recharge/orders', { planId });

/**
 * 模拟支付完成（立即增加积分）
 * @param {number|string} orderId - 订单 ID
 * @returns {object} { order, pointsRemaining, addedPoints }
 */
const payRechargeOrder = (orderId) => request('POST', `/api/recharge/orders/${orderId}/pay`);

/**
 * 当前用户充值历史
 */
const getRechargeHistory = () => request('GET', '/api/recharge/history');

module.exports = {
  // 连通性
  checkHealth,
  setServerUrl,
  // 认证
  getAuth,
  register,
  login,
  logout,
  // 用户
  getProfile,
  updateProfile,
  getPoints,
  addPoints,
  // 内置 Seedance 视频
  createVideoTask,
  getVideoTask,
  getVideoHistory,
  // 充值
  getRechargePlans,
  createRechargeOrder,
  payRechargeOrder,
  getRechargeHistory,
};
