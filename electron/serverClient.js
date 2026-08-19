/**
 * 后端服务器 HTTP 客户端
 *
 * 封装与后端服务器的所有通信：
 *   - 认证（注册 / 登录 / 登出 / 状态恢复）
 *   - 用户资料 / 头像 / 积分
 *   - 内置模型视频生成（创建任务 / 查询任务 / 历史）
 *   - 充值（套餐 / 创建订单 / 模拟支付 / 历史）
 *
 * 自动从 configStore 读取 serverUrl 与 authToken，
 * 注入 Authorization: Bearer <token>。
 *
 * 内置模型视频生成由服务器调用方舟 API 并扣减用户积分；
 * 自定义模型由客户端 videoService 直接调用，不经过此模块。
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
  // 从服务器拉取用户私有的自定义模型配置，同步到本地缓存
  await syncCustomModelFromServer();
  return data;
}

async function login(username, password) {
  const data = await request('POST', '/api/auth/login', { username, password });
  updateConfig({ authToken: data.token, userId: data.user?.id || null });
  // 从服务器拉取用户私有的自定义模型配置，同步到本地缓存
  await syncCustomModelFromServer();
  return data;
}

function logout() {
  // 清除登录态 + 重置自定义模型本地缓存（防止下一用户看到上一用户的 API Key）
  updateConfig({
    authToken: '',
    userId: null,
    videoProvider: 'seedance',
    customVideo: { baseURL: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '', modelId: 'doubao-seedance-2-0-pro' },
  });
}

// ==================== 用户资料 / 积分 / 运行时配置 ====================

const getProfile = () => request('GET', '/api/user/profile');
const updateProfile = (data) => request('PUT', '/api/user/profile', data);
const getPoints = () => request('GET', '/api/user/points');
const addPoints = (delta) => request('POST', '/api/user/points', { delta });
/**
 * 前端运行时可变配置（由后台管理，当前包含视频参数等）
 * @returns {object} { videoParams: { durations, resolutions, ratios, defaultDuration, defaultResolution, defaultRatio, defaultWatermark, defaultSeed } }
 */
const getUserSettings = () => request('GET', '/api/user/settings');

/**
 * 获取当前用户私有的自定义模型配置（服务器加密存储）
 * @returns {object|null} { videoProvider, customVideo } 或 null（未配置）
 */
const getCustomModel = () => request('GET', '/api/user/custom-model');

/**
 * 保存当前用户的自定义模型配置到服务器（加密存储）
 * @param {object} data - { videoProvider, customVideo }
 */
const saveCustomModel = (data) => request('PUT', '/api/user/custom-model', data);

/**
 * 从服务器拉取用户自定义模型配置，同步到本地缓存（configStore）
 * 登录/注册后自动调用；拉取失败时保留本地默认值，不阻塞登录流程
 */
async function syncCustomModelFromServer() {
  try {
    const data = await getCustomModel();
    if (data && (data.videoProvider || data.customVideo)) {
      const partial = {};
      if (data.videoProvider) partial.videoProvider = data.videoProvider;
      if (data.customVideo) partial.customVideo = data.customVideo;
      updateConfig(partial);
    }
  } catch (err) {
    // 服务器不可达或未配置时静默失败，使用本地默认值
    console.error('[serverClient] 同步自定义模型配置失败:', err.message);
  }
}

/**
 * 提交意见反馈
 * @param {object} payload - { category, content, contact }
 * @returns {object} { id, ok }
 */
const submitFeedback = (payload) => request('POST', '/api/user/feedback', payload);

// ==================== 内置模型视频生成 ====================

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
 * 更新视频任务的本地下载路径（视频下载到本地后上报，供历史记录播放）
 */
const updateVideoLocalPath = (taskId, localPath) =>
  request('PATCH', `/api/video/tasks/${taskId}/local-path`, { localPath });

/**
 * 当前用户的历史视频任务
 */
const getVideoHistory = () => request('GET', '/api/video/history');

/**
 * 上报自定义模型视频任务结果（供后台管理查看统计）
 * 自定义模式不经过服务器扣积分，但完成后上报结果到 video_tasks 表。
 * @param {object} data - { provider, model, prompt, params, status, videoUrl, arkTaskId, error }
 */
const recordVideoTask = (data) => request('POST', '/api/video/record', data);

/**
 * 拉取后台维护的内置模型列表
 * @returns {object} { models: [{ id, name, desc }] }
 */
const getVideoModels = () => request('GET', '/api/video/models');

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
  getUserSettings,
  getCustomModel,
  saveCustomModel,
  syncCustomModelFromServer,
  submitFeedback,
  // 内置模型视频
  createVideoTask,
  getVideoTask,
  updateVideoLocalPath,
  getVideoHistory,
  recordVideoTask,
  getVideoModels,
  // 充值
  getRechargePlans,
  createRechargeOrder,
  payRechargeOrder,
  getRechargeHistory,
};
