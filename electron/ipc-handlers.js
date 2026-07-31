const { dialog, shell } = require('electron');

// 懒加载：避免 require 时 node-llama-cpp 的 GPU 探测触发崩溃
let engineCache = null;
function safeGetEngine() {
  if (engineCache) return engineCache;
  try {
    const { getEngine } = require('./inference/llamaEngine');
    engineCache = getEngine();
  } catch (err) {
    console.warn('[llamaEngine] 本地推理引擎不可用:', err.message || err);
    // 提供一个占位引擎，返回友好错误信息
    engineCache = createFallbackEngine(err);
  }
  return engineCache;
}

function createFallbackEngine(fatalErr) {
  const fail = (feature) => {
    throw new Error(
      `本地推理引擎暂不可用（加载失败）。原因: ${fatalErr?.message || fatalErr || '未知'}. ` +
      `${feature} 需要安装 node-llama-cpp 对应平台的二进制。`
    );
  };
  return {
    scanModels: async (dir) => {
      try {
        const { scanModels: onlyScan } = require('./inference/llamaEngine');
        return await onlyScan(dir);
      } catch { return []; }
    },
    loadModel: () => fail('加载模型'),
    chat: () => fail('对话'),
    chatStream: () => fail('流式对话'),
    complete: () => fail('文本补全'),
    abortGeneration: () => {},
    dispose: async () => {},
    getLoadedModelInfo: () => null,
    isLoaded: () => false,
    isGenerating: () => false,
  };
}

let apiServerModule = null;
function requireApiServer() {
  if (apiServerModule) return apiServerModule;
  try {
    apiServerModule = require('./apiServer');
  } catch (err) {
    console.warn('[apiServer] 加载失败:', err.message);
    apiServerModule = {
      startApiServer: async () => { throw new Error('API 服务器模块不可用'); },
      stopApiServer: async () => ({ status: 'stopped' }),
      getApiServerStatus: () => ({ running: false }),
    };
  }
  return apiServerModule;
}

let videoModule = null;
function requireVideoService() {
  if (videoModule) return videoModule;
  try {
    videoModule = require('./videoService');
  } catch (err) {
    console.warn('[videoService] 加载失败:', err.message);
    videoModule = null;
  }
  return videoModule;
}

const { loadConfig, updateConfig, getVideoOutputDir, CONFIG_FILE } = require('./configStore');

/**
 * 注册所有 IPC 通道处理器
 * 将渲染进程的请求路由到推理引擎或 API 服务器
 */
async function registerIpcHandlers(ipcMain) {
  const engine = safeGetEngine();
  const { startApiServer, stopApiServer, getApiServerStatus } = requireApiServer();

  // ===== 模型管理 =====

  // 选择模型目录（打开系统文件夹选择对话框）
  ipcMain.handle('model:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择模型存储目录',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // 扫描目录下的 GGUF 模型
  ipcMain.handle('model:scan', async (event, dirPath) => {
    return await engine.scanModels(dirPath);
  });

  // 加载模型
  ipcMain.handle('model:load', async (event, modelPath, options) => {
    return await engine.loadModel(modelPath, options);
  });

  // 卸载模型
  ipcMain.handle('model:unload', async () => {
    await engine.dispose();
    return { success: true };
  });

  // 获取已加载模型信息
  ipcMain.handle('model:loaded-info', () => {
    return engine.getLoadedModelInfo();
  });

  // ===== 推理 =====

  // 非流式聊天
  ipcMain.handle('inference:chat', async (event, messages, options) => {
    return await engine.chat(messages, options);
  });

  // 非流式文本补全
  ipcMain.handle('inference:complete', async (event, prompt, options) => {
    return await engine.complete(prompt, options);
  });

  // 流式聊天 — 启动
  // 通过 event.sender 向渲染进程推送 token / done / error 事件
  ipcMain.handle('inference:chat-stream-start', async (event, messages, options) => {
    const sender = event.sender;
    try {
      await engine.chatStream(messages, options, (token) => {
        if (!sender.isDestroyed()) {
          sender.send('inference:chat-stream-token', token);
        }
      });
      if (!sender.isDestroyed()) {
        sender.send('inference:chat-stream-done', { success: true });
      }
      return { success: true };
    } catch (err) {
      if (!sender.isDestroyed()) {
        sender.send('inference:chat-stream-error', { message: err.message });
      }
      return { success: false, error: err.message };
    }
  });

  // 流式聊天 — 取消
  ipcMain.handle('inference:chat-stream-cancel', () => {
    engine.abortGeneration();
    return { success: true };
  });

  // ===== API 服务器 =====

  ipcMain.handle('api:start', async (event, port) => {
    try {
      const result = await startApiServer(port || 1234);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('api:stop', async () => {
    await stopApiServer();
    return { success: true };
  });

  ipcMain.handle('api:status', () => {
    return getApiServerStatus();
  });

  // ===== 应用配置 =====

  ipcMain.handle('config:default-model-dir', () => {
    try {
      const { getDefaultModelDir } = require('./inference/llamaEngine');
      return getDefaultModelDir();
    } catch {
      const path = require('path');
      const fs = require('fs');
      const dir = path.join(process.cwd(), '.data', 'models');
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      return dir;
    }
  });

  // ===== 视频生成（Seedance 2.0 / 方舟内容生成）=====

  // 读取应用配置（含方舟 API Key、视频模型 ID、默认参数）
  ipcMain.handle('config:get', () => {
    const config = loadConfig();
    // 脱敏：返回时把 API Key 末尾打码，避免明文在前端暴露（仅在设置面板中由用户主动编辑时明文）
    const maskedKey = config.arkApiKey
      ? config.arkApiKey.slice(0, 4) + '****' + config.arkApiKey.slice(-4)
      : '';
    return {
      ...config,
      arkApiKey: config.arkApiKey, // 设置面板需要回填，保留原值
      arkApiKeyMasked: maskedKey,
      configFilePath: CONFIG_FILE,
    };
  });

  // 保存应用配置（整体或局部）
  ipcMain.handle('config:update', (event, partial) => {
    return updateConfig(partial);
  });

  // 选择本地图片（图生视频的参考图）
  ipcMain.handle('video:select-image', async () => {
    const video = requireVideoService();
    if (!video) return { error: '视频服务模块不可用' };
    const result = await dialog.showOpenDialog({
      title: '选择参考图',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    try {
      const dataUrl = video.readImageAsDataUrl(filePath);
      return { path: filePath, dataUrl };
    } catch (err) {
      return { error: err.message };
    }
  });

  // 选择视频下载目录
  ipcMain.handle('video:select-output-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择视频保存目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // 创建视频生成任务（不阻塞，立即返回 task_id）
  ipcMain.handle('video:create-task', async (event, params) => {
    const video = requireVideoService();
    if (!video) throw new Error('视频服务模块不可用');
    return await video.createVideoTask(params);
  });

  // 查询任务状态（单次）
  ipcMain.handle('video:get-task', async (event, taskId) => {
    const video = requireVideoService();
    if (!video) throw new Error('视频服务模块不可用');
    return await video.getVideoTask(taskId);
  });

  /**
   * 生成视频（建任务 → 轮询 → 下载）
   */
  ipcMain.handle('video:generate', async (event, params) => {
    const video = requireVideoService();
    if (!video) return { success: false, error: '视频服务模块不可用' };

    const sender = event.sender;
    const send = (channel, payload) => {
      if (!sender.isDestroyed()) sender.send(channel, payload);
    };

    try {
      const created = await video.createVideoTask(params);
      const taskId = created.taskId;
      send('video:progress', { taskId, status: created.status, stage: 'queued' });

      const finalTask = await video.pollTaskUntilDone(taskId, (task) => {
        send('video:progress', { taskId, status: task.status, stage: task.status, raw: task.raw });
      });

      if (finalTask.status !== 'succeeded' || !finalTask.content?.video_url) {
        throw new Error(finalTask.error?.message || `视频生成未成功，状态: ${finalTask.status}`);
      }

      send('video:progress', { taskId, status: 'downloading', stage: 'downloading' });
      const safeName = (params.prompt || `seedance-${Date.now()}`)
        .slice(0, 40)
        .replace(/[^\w\u4e00-\u9fa5\-]/g, '_');
      const localPath = await video.downloadVideo(finalTask.content.video_url, safeName);

      const result = {
        taskId,
        videoUrl: finalTask.content.video_url,
        localPath,
        duration: finalTask.content.duration,
        usage: finalTask.usage,
      };
      send('video:success', result);
      return { success: true, ...result };
    } catch (err) {
      const taskId = params.__taskId || null;
      send('video:error', { taskId, message: err.message });
      return { success: false, error: err.message };
    }
  });

  // 取消当前正在进行的视频生成任务
  ipcMain.handle('video:cancel', () => {
    const video = requireVideoService();
    if (video) video.cancelPolling();
    return { success: true };
  });

  // 获取视频下载目录
  ipcMain.handle('video:output-dir', () => {
    return getVideoOutputDir();
  });

  // 在系统文件管理器中打开视频目录
  ipcMain.handle('video:open-folder', async (event, filePath) => {
    if (filePath) {
      shell.showItemInFolder(filePath);
    } else {
      shell.openPath(getVideoOutputDir());
    }
    return { success: true };
  });
}

module.exports = { registerIpcHandlers };
