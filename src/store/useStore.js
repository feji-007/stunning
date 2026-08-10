import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { bridge } from '../ipc/bridge';

/**
 * 全局状态管理（Zustand）
 *
 * 仅保留视频生成相关状态：
 * - 认证 / 用户 / 积分
 * - 应用配置（视频参数 / 提供商选择 / 自定义模型配置）
 * - 视频生成（内置模型 + 自定义模型）
 * - UI 状态（当前激活视图）
 */

export const useStore = create((set, get) => ({
  // ============================================================
  // UI 状态
  // ============================================================
  activeView: 'video', // 'video' | 'settings'
  setActiveView: (view) => set({ activeView: view }),

  // ============================================================
  // 认证 / 用户
  // ============================================================
  authInitialized: false,
  isAuthenticated: false,
  user: null,           // { id, username, nickname, avatar, points }
  authError: null,
  isAuthLoading: false,
  serverUrl: 'http://localhost:3001',
  serverReachable: null, // null=未检测 | true | false

  // 启动时恢复登录态：读取本地 token，若有则拉取 profile
  initAuth: async () => {
    try {
      const auth = await bridge.server.getAuth();
      if (auth?.serverUrl) set({ serverUrl: auth.serverUrl });
      if (auth?.token) {
        try {
          const profile = await bridge.server.getProfile();
          set({ isAuthenticated: true, user: profile, authInitialized: true });
          return true;
        } catch (err) {
          // 仅当 401（token 失效）时才清除登录态；
          // 网络错误（服务器暂时不可达）保留 token，让用户稍后重试
          if (err?.status === 401) {
            await bridge.server.logout();
          }
          set({ isAuthenticated: false, user: null, authInitialized: true });
          return false;
        }
      }
      set({ authInitialized: true });
      return false;
    } catch (err) {
      set({ authInitialized: true });
      return false;
    }
  },

  // 检测服务器连通性
  checkServer: async () => {
    try {
      const r = await bridge.server.health();
      set({ serverReachable: !!r.ok });
      return r;
    } catch (err) {
      set({ serverReachable: false });
      return { ok: false, error: err.message };
    }
  },

  setServerUrl: async (url) => {
    const saved = await bridge.server.setServerUrl(url);
    set({ serverUrl: saved, serverReachable: null });
    return saved;
  },

  // 登录
  login: async (username, password) => {
    set({ isAuthLoading: true, authError: null });
    try {
      const data = await bridge.server.login(username, password);
      set({ isAuthenticated: true, user: data.user, isAuthLoading: false });
      return data;
    } catch (err) {
      set({ isAuthLoading: false, authError: err.message });
      throw err;
    }
  },

  // 注册（可选昵称：注册成功后通过 updateProfile 设置）
  register: async (username, password, nickname) => {
    set({ isAuthLoading: true, authError: null });
    try {
      const data = await bridge.server.register(username, password);
      // 若提供了昵称且与用户名不同，注册成功后更新
      if (nickname && nickname !== username) {
        try {
          const updated = await bridge.server.updateProfile({ nickname });
          data.user = updated;
        } catch {}
      }
      set({ isAuthenticated: true, user: data.user, isAuthLoading: false });
      return data;
    } catch (err) {
      set({ isAuthLoading: false, authError: err.message });
      throw err;
    }
  },

  // 退出登录
  logout: async () => {
    await bridge.server.logout();
    set({
      isAuthenticated: false,
      user: null,
      activeView: 'video',
      videoHistory: [],
    });
  },

  // 刷新用户资料（含积分）
  refreshProfile: async () => {
    try {
      const profile = await bridge.server.getProfile();
      set({ user: profile });
      return profile;
    } catch (err) {
      return null;
    }
  },

  // 仅刷新积分（视频生成消耗积分后调用）
  refreshPoints: async () => {
    try {
      const data = await bridge.server.getPoints();
      set((state) => ({ user: { ...state.user, points: data.points } }));
      return data.points;
    } catch (err) {
      return null;
    }
  },

  // 更新资料（昵称 / 头像）
  updateProfile: async (partial) => {
    const profile = await bridge.server.updateProfile(partial);
    set({ user: profile });
    return profile;
  },

  // ============================================================
  // 充值（模拟支付）
  // ============================================================
  rechargePlans: [],
  rechargeHistory: [],
  isRecharging: false,

  // 加载充值套餐
  loadRechargePlans: async () => {
    try {
      const data = await bridge.recharge.getPlans();
      set({ rechargePlans: data?.plans || [] });
      return data?.plans || [];
    } catch (err) {
      console.error('加载充值套餐失败:', err);
      return [];
    }
  },

  // 加载充值历史
  loadRechargeHistory: async () => {
    try {
      const list = await bridge.recharge.getHistory();
      set({ rechargeHistory: list || [] });
      return list || [];
    } catch (err) {
      return [];
    }
  },

  // 充值：创建订单 + 模拟支付（两步合一，对调用方简化）
  // 成功后刷新积分并返回到账积分
  recharge: async (planId) => {
    set({ isRecharging: true });
    try {
      const order = await bridge.recharge.createOrder(planId);
      const result = await bridge.recharge.pay(order.id);
      // 更新本地积分
      if (result?.pointsRemaining != null) {
        set((state) => ({ user: { ...state.user, points: result.pointsRemaining } }));
      } else {
        await get().refreshPoints();
      }
      set({ isRecharging: false });
      return result;
    } catch (err) {
      set({ isRecharging: false });
      throw err;
    }
  },

  // ============================================================
  // 应用配置
  // ============================================================
  appConfig: null,

  loadAppConfig: async () => {
    try {
      const config = await bridge.config.get();
      set({ appConfig: config });
      return config;
    } catch (err) {
      console.error('加载应用配置失败:', err);
      return null;
    }
  },

  // 局部更新配置
  saveAppConfig: async (partial) => {
    const config = await bridge.config.update(partial);
    set({ appConfig: config });
    return config;
  },

  // ============================================================
  // 视频生成
  // ============================================================
  videoHistory: [],          // 本次会话生成的视频 [{ id, prompt, params, videoUrl, localPath, duration, createdAt }]
  videoGenStatus: 'idle',    // 'idle' | 'queued' | 'running' | 'downloading' | 'error'
  videoGenError: null,
  videoProgress: { stage: null, status: null },
  seedanceModels: [],        // 后台维护的内置模型列表 [{ id, name, desc }]

  // 选择参考图（图生视频）
  selectReferenceImage: async () => {
    const result = await bridge.video.selectImage();
    return result; // { path, dataUrl } 或 null
  },

  // 拉取后台维护的内置模型列表
  loadSeedanceModels: async () => {
    try {
      const data = await bridge.video.getModels();
      const models = data?.models || [];
      if (models.length) set({ seedanceModels: models });
      return models;
    } catch (err) {
      console.error('加载 Seedance 模型列表失败:', err);
      return [];
    }
  },

  // 选择视频保存目录
  selectVideoOutputDir: async () => {
    const dir = await bridge.video.selectOutputDir();
    if (dir) {
      await get().saveAppConfig({ videoDefaults: { outputDir: dir } });
    }
    return dir;
  },

  // 生成视频（全流程）
  generateVideo: async (genParams) => {
    set({ videoGenStatus: 'queued', videoGenError: null, videoProgress: { stage: 'queued', status: 'queued' } });

    // 订阅进度/失败事件
    const offProgress = bridge.video.onProgress((payload) => {
      set({
        videoProgress: payload,
        videoGenStatus: payload.stage === 'downloading' ? 'downloading' : payload.status,
      });
    });
    const offError = bridge.video.onError((payload) => {
      set({ videoGenStatus: 'error', videoGenError: payload.message });
    });

    try {
      const result = await bridge.video.generate(genParams);
      offProgress();
      offError();
      if (!result.success) {
        set({ videoGenStatus: 'error', videoGenError: result.error });
        // 内置模式失败可能已退还积分，仍刷新一次（自定义模型不消耗积分，无需刷新）
        if (genParams.provider === 'seedance') await get().refreshPoints();
        return null;
      }
      // 成功后更新状态并加入历史
      const record = {
        id: result.taskId || uuidv4(),
        prompt: genParams.prompt || '',
        params: genParams,
        provider: result.provider || genParams.provider,
        status: 'succeeded',
        videoUrl: result.videoUrl,
        localPath: result.localPath,
        duration: genParams.duration,
        createdAt: Date.now(),
      };
      set((state) => ({
        videoGenStatus: 'idle',
        videoProgress: { stage: null, status: null },
        videoHistory: [record, ...state.videoHistory].slice(0, 50),
      }));
      // 内置模式消耗积分，刷新余额；自定义模型不消耗积分
      if (record.provider === 'seedance') await get().refreshPoints();
      return record;
    } catch (err) {
      offProgress();
      offError();
      set({ videoGenStatus: 'error', videoGenError: err.message });
      if (genParams.provider === 'seedance') await get().refreshPoints();
      return null;
    }
  },

  // 取消视频生成
  cancelVideoGeneration: async () => {
    await bridge.video.cancel();
    set({ videoGenStatus: 'idle', videoProgress: { stage: null, status: null } });
  },

  // 在文件管理器中打开视频
  openVideoInFolder: (filePath) => {
    bridge.video.openFolder(filePath);
  },
}));
