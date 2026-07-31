const { contextBridge, ipcRenderer } = require('electron');

/**
 * 预加载脚本：通过 contextBridge 安全地向渲染进程暴露 IPC 通道。
 * 渲染进程只能通过 window.api 调用以下方法，无法直接访问 Node API。
 */
contextBridge.exposeInMainWorld('api', {
  // ===== 模型管理 =====
  selectModelDirectory: () => ipcRenderer.invoke('model:select-directory'),
  scanModels: () => ipcRenderer.invoke('model:scan', ''),
  scanModelsInDir: (dirPath) => ipcRenderer.invoke('model:scan', dirPath),
  loadModel: (modelPath, options) => ipcRenderer.invoke('model:load', modelPath, options),
  unloadModel: () => ipcRenderer.invoke('model:unload'),
  getLoadedModelInfo: () => ipcRenderer.invoke('model:loaded-info'),

  // ===== 推理 =====
  chat: (messages, options) => ipcRenderer.invoke('inference:chat', messages, options),
  complete: (prompt, options) => ipcRenderer.invoke('inference:complete', prompt, options),
  // 流式推理：返回一个取消函数，token 通过事件推送
  chatStream: {
    start: (messages, options) => ipcRenderer.invoke('inference:chat-stream-start', messages, options),
    onToken: (callback) => {
      const handler = (_event, token) => callback(token);
      ipcRenderer.on('inference:chat-stream-token', handler);
      return () => ipcRenderer.removeListener('inference:chat-stream-token', handler);
    },
    onDone: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('inference:chat-stream-done', handler);
      return () => ipcRenderer.removeListener('inference:chat-stream-done', handler);
    },
    onError: (callback) => {
      const handler = (_event, error) => callback(error);
      ipcRenderer.on('inference:chat-stream-error', handler);
      return () => ipcRenderer.removeListener('inference:chat-stream-error', handler);
    },
    cancel: () => ipcRenderer.invoke('inference:chat-stream-cancel'),
  },

  // ===== API 服务器 =====
  startApiServer: (port) => ipcRenderer.invoke('api:start', port),
  stopApiServer: () => ipcRenderer.invoke('api:stop'),
  getApiServerStatus: () => ipcRenderer.invoke('api:status'),

  // ===== 应用配置 =====
  getDefaultModelDir: () => ipcRenderer.invoke('config:default-model-dir'),

  // ===== 视频生成（Seedance 2.0 / 方舟）=====
  video: {
    getConfig: () => ipcRenderer.invoke('config:get'),
    updateConfig: (partial) => ipcRenderer.invoke('config:update', partial),

    selectImage: () => ipcRenderer.invoke('video:select-image'),
    selectOutputDir: () => ipcRenderer.invoke('video:select-output-dir'),
    getOutputDir: () => ipcRenderer.invoke('video:output-dir'),
    openFolder: (filePath) => ipcRenderer.invoke('video:open-folder', filePath),

    // 生成视频（异步全流程，进度通过事件推送）
    generate: (params) => ipcRenderer.invoke('video:generate', params),
    cancel: () => ipcRenderer.invoke('video:cancel'),

    // 单次查询任务（如需手动刷新）
    getTask: (taskId) => ipcRenderer.invoke('video:get-task', taskId),

    // 事件订阅
    onProgress: (callback) => {
      const handler = (_e, payload) => callback(payload);
      ipcRenderer.on('video:progress', handler);
      return () => ipcRenderer.removeListener('video:progress', handler);
    },
    onSuccess: (callback) => {
      const handler = (_e, payload) => callback(payload);
      ipcRenderer.on('video:success', handler);
      return () => ipcRenderer.removeListener('video:success', handler);
    },
    onError: (callback) => {
      const handler = (_e, payload) => callback(payload);
      ipcRenderer.on('video:error', handler);
      return () => ipcRenderer.removeListener('video:error', handler);
    },
  },
});
