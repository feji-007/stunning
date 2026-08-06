/**
 * IPC 处理器注册
 *
 * 渲染进程通过 preload 暴露的 window.api 调用主进程能力，
 * 此模块把每个 IPC 通道路由到对应服务。
 *
 * 仅保留视频生成相关能力：
 *   - 应用配置（视频参数 / 自定义 AI 配置 / 服务器地址 / 登录态）
 *   - 后端服务器通信（认证 / 用户 / 积分 / 视频历史）
 *   - 充值（套餐 / 创建订单 / 模拟支付 / 历史）
 *   - 视频生成（内置 Seedance + 自定义 AI）
 */
const { ipcMain, dialog, shell } = require('electron');
const { loadConfig, updateConfig, getVideoOutputDir } = require('./configStore');
const serverClient = require('./serverClient');
const videoService = require('./videoService');

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

  // 在系统资源管理器中打开目录
  ipcMain.handle('video:open-folder', (_e, folderPath) => {
    const dir = folderPath || getVideoOutputDir();
    shell.openPath(dir);
    return true;
  });

  // 历史任务（来自服务器，仅内置 Seedance 模式有记录）
  ipcMain.handle('video:history', () => serverClient.getVideoHistory());

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
}

module.exports = { registerIpcHandlers };
