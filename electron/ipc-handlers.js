/**
 * IPC 处理器注册
 *
 * 渲染进程通过 preload 暴露的 window.api 调用主进程能力，
 * 此模块把每个 IPC 通道路由到对应服务。
 *
 * 仅保留视频生成相关能力：
 *   - 应用配置（视频参数 / 自定义模型配置 / 服务器地址 / 登录态）
 *   - 后端服务器通信（认证 / 用户 / 积分 / 视频历史）
 *   - 充值（套餐 / 创建订单 / 模拟支付 / 历史）
 *   - 视频生成（内置模型 + 自定义模型）
 */
const { ipcMain, dialog, shell } = require('electron');
const { loadConfig, updateConfig, getVideoOutputDir } = require('./configStore');
const serverClient = require('./serverClient');
const videoService = require('./videoService');
const videoHistoryStore = require('./videoHistoryStore');

function registerIpcHandlers() {
  // ============================================================
  // 配置
  // ============================================================
  ipcMain.handle('config:get', () => {
    return loadConfig();
  });

  ipcMain.handle('config:update', (_event, partial) => {
    return updateConfig(partial || {});
  });

  // ============================================================
  // 后端服务器：连通性 / 认证 / 用户
  // ============================================================
  ipcMain.handle('server:health', () => serverClient.checkHealth());
  ipcMain.handle('server:set-url', (_e, url) => serverClient.setServerUrl(url));
  ipcMain.handle('server:get-auth', () => serverClient.getAuth());

  ipcMain.handle('server:register', (_e, username, password) => serverClient.register(username, password));
  ipcMain.handle('server:login', (_e, username, password) => serverClient.login(username, password));
  ipcMain.handle('server:logout', () => serverClient.logout());

  ipcMain.handle('server:get-profile', () => serverClient.getProfile());
  ipcMain.handle('server:update-profile', (_e, data) => serverClient.updateProfile(data));
  ipcMain.handle('server:get-points', () => serverClient.getPoints());
  ipcMain.handle('server:get-settings', () => serverClient.getUserSettings());

  // ============================================================
  // 充值（模拟支付）
  // ============================================================
  ipcMain.handle('recharge:plans', () => serverClient.getRechargePlans());
  ipcMain.handle('recharge:create-order', (_e, planId) => serverClient.createRechargeOrder(planId));
  ipcMain.handle('recharge:pay', (_e, orderId) => serverClient.payRechargeOrder(orderId));
  ipcMain.handle('recharge:history', () => serverClient.getRechargeHistory());

  // ============================================================
  // 视频生成
  // ============================================================

  // 选择参考图（图生视频），返回 { path, dataUrl }
  ipcMain.handle('video:select-image', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择参考图',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    try {
      const dataUrl = videoService.readImageAsDataUrl(filePath);
      return { path: filePath, dataUrl };
    } catch (err) {
      throw new Error(`读取图片失败: ${err.message}`);
    }
  });

  // 选择视频下载目录
  ipcMain.handle('video:select-output-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择视频保存目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const dir = result.filePaths[0];
    updateConfig({ videoDefaults: { outputDir: dir } });
    return dir;
  });

  // 获取当前视频输出目录
  ipcMain.handle('video:output-dir', () => getVideoOutputDir());

  // 在系统资源管理器中打开目录并选中文件
  // 注意：folderPath 实际传入的是视频文件路径，使用 showItemInFolder 会打开父目录并高亮该文件
  // 若不传则打开视频保存根目录
  ipcMain.handle('video:open-folder', (_e, folderPath) => {
    if (folderPath) {
      shell.showItemInFolder(folderPath);
    } else {
      shell.openPath(getVideoOutputDir());
    }
    return true;
  });

  // 历史任务：本地持久化（含 localPath，内置 + 自定义模型均记录）
  ipcMain.handle('video:history', () => videoHistoryStore.getHistory());
  // 清空历史
  ipcMain.handle('video:clear-history', () => videoHistoryStore.clearHistory());

  // 拉取后台维护的内置模型列表
  ipcMain.handle('video:get-models', () => serverClient.getVideoModels());

  // 生成视频
  // 通过 event.sender 推送 video:progress / video:success / video:error 事件
  ipcMain.handle('video:generate', async (event, params) => {
    const sender = event.sender;
    const send = (channel, payload) => {
      try {
        if (!sender.isDestroyed()) sender.send(channel, payload);
      } catch {}
    };

    try {
      const result = await videoService.generate(params || {}, (p) => send('video:progress', p));
      // 生成成功后持久化到本地历史（含 localPath，用于下次启动恢复）
      if (result.success !== false && result.localPath) {
        const record = {
          id: result.taskId || `video_${Date.now()}`,
          prompt: (params && params.prompt) || '',
          params: params || {},
          provider: result.provider || (params && params.provider) || 'seedance',
          status: 'succeeded',
          videoUrl: result.videoUrl,
          localPath: result.localPath,
          duration: (params && params.duration) || 5,
          createdAt: Date.now(),
        };
        videoHistoryStore.addRecord(record);
      }
      send('video:success', result);
      return { success: true, ...result };
    } catch (err) {
      send('video:error', { message: err.message });
      return { success: false, error: err.message };
    }
  });

  // 取消当前生成
  ipcMain.handle('video:cancel', () => {
    videoService.cancel();
    return true;
  });

  // 测试自定义模型连通性（设置页「测试连通性」按钮调用）
  ipcMain.handle('video:test-custom', (_e, baseURL, apiKey, modelId) =>
    videoService.testCustomConnection(baseURL, apiKey, modelId)
  );
}

module.exports = { registerIpcHandlers };
