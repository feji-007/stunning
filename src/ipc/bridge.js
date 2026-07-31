/**
 * IPC 桥接层
 * 对 window.api（preload 暴露）的轻量封装，统一错误处理与日志。
 * 渲染进程统一通过此模块与主进程通信，不直接访问 window.api。
 * 在非 Electron 环境（纯浏览器调试）下提供空实现 mock，避免启动报错。
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
const resolveEmpty = () => Promise.resolve(null);

/**
 * 包装一个 IPC 调用，捕获错误并打日志
 */
async function wrap(promise, label) {
  try {
    return await promise;
  } catch (err) {
    console.error(`[bridge] ${label} 失败:`, err);
    throw err;
  }
}

// 空实现 mock（非 Electron 环境下使用）
const mockStreamApi = {
  start: async () => { throw new Error('非 Electron 环境，无法调用推理'); },
  cancel: async () => {},
  onToken: () => noop,
  onDone: () => noop,
  onError: () => noop,
};

const mockVideoApi = {
  getConfig: async () => ({ arkApiKey: '', videoModelId: 'doubao-seedance-2-0-pro', videoDefaults: { duration: 5, resolution: '720p', ratio: '16:9', watermark: false, seed: -1, outputDir: '' }, arkApiKeyMasked: '', configFilePath: '' }),
  updateConfig: async (p) => p,
  selectImage: resolveNull,
  selectOutputDir: resolveNull,
  getOutputDir: async () => './outputs/videos',
  openFolder: async () => {},
  generate: async () => ({ success: false, error: '非 Electron 环境，无法调用视频生成' }),
  cancel: async () => {},
  getTask: resolveEmpty,
  onProgress: () => noop,
  onSuccess: () => noop,
  onError: () => noop,
};

const mockApi = {
  selectModelDirectory: resolveNull,
  scanModels: async () => [],
  loadModel: async () => { throw new Error('非 Electron 环境，无法加载模型'); },
  unloadModel: resolveEmpty,
  getLoadedModelInfo: resolveEmpty,
  chat: async () => { throw new Error('非 Electron 环境，无法进行推理'); },
  complete: async () => { throw new Error('非 Electron 环境，无法进行推理'); },
  chatStream: mockStreamApi,
  startApiServer: async () => ({ running: false, error: '非 Electron 环境，无法启动 API 服务器' }),
  stopApiServer: resolveEmpty,
  getApiServerStatus: async () => ({ running: false, port: null, url: null }),
  getDefaultModelDir: async () => './models',
  video: mockVideoApi,
};

function resolve(...pathParts) {
  // 在实际调用时才判断环境，避免加载期就报错
  if (isAvailable()) {
    let obj = rawApi;
    for (const k of pathParts) {
      if (!obj || !(k in obj)) {
        console.warn(`[bridge] 缺少 IPC 通道: ${pathParts.join('.')}`);
        // 返回一个可调用的空函数，避免上层解构报错
        const stub = () => Promise.resolve(null);
        stub.onToken = stub.onDone = stub.onError = stub.start = stub.cancel =
          stub.getConfig = stub.updateConfig = stub.selectImage = stub.selectOutputDir =
          stub.getOutputDir = stub.openFolder = stub.generate = stub.getTask =
          stub.onProgress = stub.onSuccess = stub.onError = () => Promise.resolve(null);
        stub.video = stub;
        return stub;
      }
      obj = obj[k];
    }
    return obj;
  }
  let obj = mockApi;
  for (const k of pathParts) {
    obj = obj[k];
  }
  return obj;
}

export const bridge = {
  // ===== 模型 =====
  selectModelDirectory: () => wrap(resolve('selectModelDirectory')(), 'selectModelDirectory'),
  scanModels: (dirPath) => wrap(resolve('scanModels')(dirPath), 'scanModels'),
  loadModel: (modelPath, options) => wrap(resolve('loadModel')(modelPath, options), 'loadModel'),
  unloadModel: () => wrap(resolve('unloadModel')(), 'unloadModel'),
  getLoadedModelInfo: () => wrap(resolve('getLoadedModelInfo')(), 'getLoadedModelInfo'),

  // ===== 推理 =====
  chat: (messages, options) => wrap(resolve('chat')(messages, options), 'chat'),
  complete: (prompt, options) => wrap(resolve('complete')(prompt, options), 'complete'),

  // 流式聊天
  chatStream: (messages, options) => {
    const start = resolve('chatStream', 'start');
    return wrap(start(messages, options), 'chatStream.start');
  },
  cancelStream: () => wrap(resolve('chatStream', 'cancel')(), 'chatStream.cancel'),
  onStreamToken: (callback) => resolve('chatStream', 'onToken')(callback),
  onStreamDone: (callback) => resolve('chatStream', 'onDone')(callback),
  onStreamError: (callback) => resolve('chatStream', 'onError')(callback),

  // ===== API 服务器 =====
  startApiServer: (port) => wrap(resolve('startApiServer')(port), 'startApiServer'),
  stopApiServer: () => wrap(resolve('stopApiServer')(), 'stopApiServer'),
  getApiServerStatus: () => wrap(resolve('getApiServerStatus')(), 'getApiServerStatus'),

  // ===== 配置 =====
  getDefaultModelDir: () => wrap(resolve('getDefaultModelDir')(), 'getDefaultModelDir'),

  // ===== 视频生成 =====
  video: {
    getConfig: () => wrap(resolve('video', 'getConfig')(), 'video.getConfig'),
    updateConfig: (partial) => wrap(resolve('video', 'updateConfig')(partial), 'video.updateConfig'),
    selectImage: () => wrap(resolve('video', 'selectImage')(), 'video.selectImage'),
    selectOutputDir: () => wrap(resolve('video', 'selectOutputDir')(), 'video.selectOutputDir'),
    getOutputDir: () => wrap(resolve('video', 'getOutputDir')(), 'video.getOutputDir'),
    openFolder: (filePath) => wrap(resolve('video', 'openFolder')(filePath), 'video.openFolder'),
    generate: (params) => wrap(resolve('video', 'generate')(params), 'video.generate'),
    cancel: () => wrap(resolve('video', 'cancel')(), 'video.cancel'),
    getTask: (taskId) => wrap(resolve('video', 'getTask')(taskId), 'video.getTask'),
    onProgress: (cb) => resolve('video', 'onProgress')(cb),
    onSuccess: (cb) => resolve('video', 'onSuccess')(cb),
    onError: (cb) => resolve('video', 'onError')(cb),
  },
};
