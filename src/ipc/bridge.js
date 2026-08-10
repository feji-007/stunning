/**
 * IPC 桥接层
 * 对 window.api（preload 暴露）的轻量封装，统一错误处理与日志。
 * 渲染进程统一通过此模块与主进程通信，不直接访问 window.api。
 * 在非 Electron 环境（纯浏览器调试）下提供空实现 mock，避免启动报错。
 *
 * 仅保留视频生成相关能力：config / server / video
 */

const rawApi = typeof window !== 'undefined' ? window.api : null;

let notElectronWarned = false;
function isAvailable() {
  if (!rawApi) {
    if (!notElectronWarned) {
      console.warn('[bridge] window.api 不可用，可能未在 Electron 环境中运行，所有 IPC 调用将返回 mock 数据');
      notElectronWarned = true;
    }
    return false;
  }
  return true;
}

const noop = () => {};
const resolveNull = () => Promise.resolve(null);

/**
 * 包装一个 IPC 调用，捕获错误并打日志
 */
async function wrap(promise, label) {
  try {
    return await promise;
  } catch (err) {
    if (rawApi) {
      console.error(`[bridge] ${label} 失败:`, err);
    } else if (console.debug) {
      console.debug(`[bridge] ${label} (mock) 失败:`, err && err.message ? err.message : err);
    }
    throw err;
  }
}

// ===== mock（非 Electron 环境）=====
const mockConfigApi = {
  get: async () => null,
  update: async (p) => p,
};

const mockServerApi = {
  health: async () => ({ ok: false, error: '非 Electron 环境' }),
  register: async () => { throw new Error('非 Electron 环境，无法注册'); },
  login: async () => { throw new Error('非 Electron 环境，无法登录'); },
  logout: async () => {},
  getAuth: async () => ({ serverUrl: 'http://localhost:3001', token: '', userId: null, isAuthenticated: false }),
  setServerUrl: async (url) => url,
  getProfile: async () => { throw new Error('非 Electron 环境'); },
  updateProfile: async () => { throw new Error('非 Electron 环境'); },
  getPoints: async () => ({ points: 0 }),
};

const mockRechargeApi = {
  getPlans: async () => ({ plans: [] }),
  createOrder: async () => { throw new Error('非 Electron 环境'); },
  pay: async () => { throw new Error('非 Electron 环境'); },
  getHistory: async () => [],
};

const mockVideoApi = {
  selectImage: resolveNull,
  selectOutputDir: resolveNull,
  getOutputDir: async () => './outputs/videos',
  openFolder: async () => {},
  getHistory: async () => [],
  getModels: async () => ({ models: [] }),
  generate: async () => ({ success: false, error: '非 Electron 环境，无法调用视频生成' }),
  cancel: async () => {},
  testCustom: async () => { throw new Error('非 Electron 环境'); },
  onProgress: () => noop,
  onSuccess: () => noop,
  onError: () => noop,
};

const mockApi = {
  config: mockConfigApi,
  server: mockServerApi,
  recharge: mockRechargeApi,
  video: mockVideoApi,
};

function resolve(...pathParts) {
  if (isAvailable()) {
    let obj = rawApi;
    for (const k of pathParts) {
      if (!obj || !(k in obj)) {
        console.warn(`[bridge] 缺少 IPC 通道: ${pathParts.join('.')}`);
        return () => Promise.resolve(null);
      }
      obj = obj[k];
    }
    return obj;
  }
  let obj = mockApi;
  for (const k of pathParts) obj = obj[k];
  return obj;
}

export const bridge = {
  // ===== 应用配置 =====
  config: {
    get: () => wrap(resolve('config', 'get')(), 'config.get'),
    update: (partial) => wrap(resolve('config', 'update')(partial), 'config.update'),
  },

  // ===== 后端服务器：认证 / 用户 / 积分 =====
  server: {
    health: () => wrap(resolve('server', 'health')(), 'server.health'),
    setServerUrl: (url) => wrap(resolve('server', 'setServerUrl')(url), 'server.setServerUrl'),
    getAuth: () => wrap(resolve('server', 'getAuth')(), 'server.getAuth'),

    register: (username, password) => wrap(resolve('server', 'register')(username, password), 'server.register'),
    login: (username, password) => wrap(resolve('server', 'login')(username, password), 'server.login'),
    logout: () => wrap(resolve('server', 'logout')(), 'server.logout'),

    getProfile: () => wrap(resolve('server', 'getProfile')(), 'server.getProfile'),
    updateProfile: (data) => wrap(resolve('server', 'updateProfile')(data), 'server.updateProfile'),
    getPoints: () => wrap(resolve('server', 'getPoints')(), 'server.getPoints'),
  },

  // ===== 充值（模拟支付）=====
  recharge: {
    getPlans: () => wrap(resolve('recharge', 'getPlans')(), 'recharge.getPlans'),
    createOrder: (planId) => wrap(resolve('recharge', 'createOrder')(planId), 'recharge.createOrder'),
    pay: (orderId) => wrap(resolve('recharge', 'pay')(orderId), 'recharge.pay'),
    getHistory: () => wrap(resolve('recharge', 'getHistory')(), 'recharge.getHistory'),
  },

  // ===== 视频生成（内置模型 + 自定义模型）=====
  video: {
    selectImage: () => wrap(resolve('video', 'selectImage')(), 'video.selectImage'),
    selectOutputDir: () => wrap(resolve('video', 'selectOutputDir')(), 'video.selectOutputDir'),
    getOutputDir: () => wrap(resolve('video', 'getOutputDir')(), 'video.getOutputDir'),
    openFolder: (filePath) => wrap(resolve('video', 'openFolder')(filePath), 'video.openFolder'),
    getHistory: () => wrap(resolve('video', 'getHistory')(), 'video.getHistory'),
    getModels: () => wrap(resolve('video', 'getModels')(), 'video.getModels'),

    generate: (params) => wrap(resolve('video', 'generate')(params), 'video.generate'),
    cancel: () => wrap(resolve('video', 'cancel')(), 'video.cancel'),
    testCustom: (baseURL, apiKey, modelId) => wrap(resolve('video', 'testCustom')(baseURL, apiKey, modelId), 'video.testCustom'),

    onProgress: (cb) => resolve('video', 'onProgress')(cb),
    onSuccess: (cb) => resolve('video', 'onSuccess')(cb),
    onError: (cb) => resolve('video', 'onError')(cb),
  },
};
