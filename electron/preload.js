/**
 * 预加载脚本
 *
 * 通过 contextBridge 安全地向渲染进程暴露 IPC 通道。
 * 渲染进程只能通过 window.api 调用，无法直接访问 Node API。
 *
 * 暴露的能力分组：
 *   - config        应用配置（视频参数 / 自定义 AI / 服务器地址 / 登录态）
 *   - server        后端服务器（认证 / 用户 / 积分）
 *   - recharge      充值（套餐 / 创建订单 / 模拟支付 / 历史）
 *   - video         视频生成（内置 Seedance + 自定义 AI）
 *
 * 视频生成为异步流式：start 触发 → onProgress/onSuccess/onError 事件回调 → cancel 中止。
 * 每个事件订阅返回一个取消监听函数。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ============================================================
  // 配置
  // ============================================================
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (partial) => ipcRenderer.invoke('config:update', partial),
  },

  // ============================================================
  // 后端服务器
  // ============================================================
  server: {
    health: () => ipcRenderer.invoke('server:health'),
    setServerUrl: (url) => ipcRenderer.invoke('server:set-url', url),
    getAuth: () => ipcRenderer.invoke('server:get-auth'),

    register: (username, password) => ipcRenderer.invoke('server:register', username, password),
    login: (username, password) => ipcRenderer.invoke('server:login', username, password),
    logout: () => ipcRenderer.invoke('server:logout'),

    getProfile: () => ipcRenderer.invoke('server:get-profile'),
    updateProfile: (data) => ipcRenderer.invoke('server:update-profile', data),
    getPoints: () => ipcRenderer.invoke('server:get-points'),
  },

  // ============================================================
  // 充值（模拟支付）
  // ============================================================
  recharge: {
    getPlans: () => ipcRenderer.invoke('recharge:plans'),
    createOrder: (planId) => ipcRenderer.invoke('recharge:create-order', planId),
    pay: (orderId) => ipcRenderer.invoke('recharge:pay', orderId),
    getHistory: () => ipcRenderer.invoke('recharge:history'),
  },

  // ============================================================
  // 视频生成
  // ============================================================
  video: {
    // 选择参考图，返回 { path, dataUrl }
    selectImage: () => ipcRenderer.invoke('video:select-image'),
    // 选择视频保存目录
    selectOutputDir: () => ipcRenderer.invoke('video:select-output-dir'),
    // 获取当前视频输出目录
    getOutputDir: () => ipcRenderer.invoke('video:output-dir'),
    // 在系统资源管理器中打开目录
    openFolder: (folderPath) => ipcRenderer.invoke('video:open-folder', folderPath),
    // 历史任务（仅内置 Seedance 模式记录在服务器）
    getHistory: () => ipcRenderer.invoke('video:history'),

    // 生成视频（流式）
    // params: { provider, prompt, imageUrl, duration, resolution, ratio, watermark, seed, model }
    generate: (params) => ipcRenderer.invoke('video:generate', params),
    cancel: () => ipcRenderer.invoke('video:cancel'),
    // 测试 ComfyUI 连通性
    testComfyui: (baseURL) => ipcRenderer.invoke('video:test-comfyui', baseURL),

    // 事件订阅，均返回取消监听函数
    onProgress: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('video:progress', listener);
      return () => ipcRenderer.removeListener('video:progress', listener);
    },
    onSuccess: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('video:success', listener);
      return () => ipcRenderer.removeListener('video:success', listener);
    },
    onError: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('video:error', listener);
      return () => ipcRenderer.removeListener('video:error', listener);
    },
  },
});
