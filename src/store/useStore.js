import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { bridge } from '../ipc/bridge';

/**
 * 全局状态管理（Zustand）
 *
 * 管理：
 * - 聊天会话（多会话）
 * - 模型列表与已加载模型
 * - 推理参数
 * - API 服务器状态
 * - 视频生成（Seedance 2.0 / 方舟）
 * - 应用配置（API Key 等）
 * - UI 状态（当前激活视图、加载状态）
 */

const DEFAULT_PARAMS = {
  temperature: 0.8,
  maxTokens: -1,
  topK: 40,
  topP: 0.9,
  minP: 0,
  repeatPenalty: 1.1,
  contextSize: 4096,
  gpuLayers: 0,
  systemPrompt: 'You are a helpful, respectful and honest assistant.',
};

export const useStore = create((set, get) => ({
  // ===== 会话管理 =====
  sessions: [],
  activeSessionId: null,

  // 创建新会话
  createSession: () => {
    const session = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
    }));
    return session;
  },

  // 切换会话
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  // 删除会话
  deleteSession: (sessionId) => {
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      const newActive = state.activeSessionId === sessionId
        ? (remaining[0]?.id ?? null)
        : state.activeSessionId;
      return { sessions: remaining, activeSessionId: newActive };
    });
  },

  // 重命名会话
  renameSession: (sessionId, title) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s
      ),
    }));
  },

  // 向会话添加消息
  addMessage: (sessionId, message) => {
    const msg = { id: uuidv4(), createdAt: Date.now(), ...message };
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: [...s.messages, msg],
              updatedAt: Date.now(),
              // 自动用第一条用户消息设置标题
              title: s.title === 'New Chat' && message.role === 'user'
                ? message.content.slice(0, 40)
                : s.title,
            }
          : s
      ),
    }));
    return msg;
  },

  // 更新消息内容（用于流式追加）
  updateMessage: (sessionId, messageId, updater) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId ? updater(m) : m
              ),
            }
          : s
      ),
    }));
  },

  // 获取当前激活会话
  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId) ?? null;
  },

  // ===== 模型管理 =====
  models: [],
  loadedModel: null,
  modelDir: '',
  isLoadingModel: false,
  modelLoadError: null,

  // 设置模型目录
  setModelDir: (dir) => set({ modelDir: dir }),

  // 扫描模型
  scanModels: async (dirPath) => {
    try {
      const models = await bridge.scanModels(dirPath);
      set({ models });
      return models;
    } catch (err) {
      console.error('扫描模型失败:', err);
      return [];
    }
  },

  // 加载模型
  loadModel: async (modelPath, options) => {
    set({ isLoadingModel: true, modelLoadError: null });
    try {
      const params = { ...get().params };
      const loadOptions = {
        contextSize: params.contextSize,
        gpuLayers: params.gpuLayers,
      };
      const info = await bridge.loadModel(modelPath, loadOptions);
      set({ loadedModel: info, isLoadingModel: false });
      // 刷新模型列表的 loaded 状态
      await get().scanModels(get().modelDir);
      return info;
    } catch (err) {
      set({ isLoadingModel: false, modelLoadError: err.message });
      throw err;
    }
  },

  // 卸载模型
  unloadModel: async () => {
    await bridge.unloadModel();
    set({ loadedModel: null });
    await get().scanModels(get().modelDir);
  },

  // 选择并设置模型目录
  selectModelDirectory: async () => {
    const dir = await bridge.selectModelDirectory();
    if (dir) {
      set({ modelDir: dir });
      await get().scanModels(dir);
    }
    return dir;
  },

  // ===== 推理参数 =====
  params: { ...DEFAULT_PARAMS },

  setParam: (key, value) => {
    set((state) => ({ params: { ...state.params, [key]: value } }));
  },

  resetParams: () => set({ params: { ...DEFAULT_PARAMS } }),

  // ===== 推理状态 =====
  isGenerating: false,

  // 发送消息（流式）
  sendMessage: async (content) => {
    const state = get();
    let session = state.getActiveSession();

    // 如果没有会话，先创建
    if (!session) {
      state.createSession();
      session = get().getActiveSession();
    }

    if (!state.loadedModel) {
      // 模型未加载时，添加一条提示消息
      state.addMessage(session.id, {
        role: 'assistant',
        content: '⚠️ 尚未加载模型。请先在左侧"模型"面板中加载一个 GGUF 模型。',
        isError: true,
      });
      return;
    }

    const sessionId = session.id;
    const params = state.params;

    // 添加用户消息
    state.addMessage(sessionId, { role: 'user', content });

    // 构建发送给引擎的消息数组（含 system prompt）
    const updatedSession = get().getActiveSession();
    const messages = [
      { role: 'system', content: params.systemPrompt },
      ...updatedSession.messages
        .filter((m) => !m.isError)
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    // 创建占位助手消息
    const placeholderMsg = state.addMessage(sessionId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
    });

    set({ isGenerating: true });

    // 注册流式回调
    const offToken = bridge.onStreamToken((token) => {
      get().updateMessage(sessionId, placeholderMsg.id, (m) => ({
        ...m,
        content: m.content + token,
      }));
    });

    const offDone = bridge.onStreamDone(() => {
      get().updateMessage(sessionId, placeholderMsg.id, (m) => ({
        ...m,
        isStreaming: false,
      }));
      set({ isGenerating: false });
      offToken();
      offDone();
      offError();
    });

    const offError = bridge.onStreamError((err) => {
      get().updateMessage(sessionId, placeholderMsg.id, (m) => ({
        ...m,
        isStreaming: false,
        isError: true,
        content: m.content + `\n\n❌ 错误: ${err.message}`,
      }));
      set({ isGenerating: false });
      offToken();
      offDone();
      offError();
    });

    // 启动流式推理
    try {
      await bridge.chatStream(messages, {
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        topK: params.topK,
        topP: params.topP,
        minP: params.minP,
        repeatPenalty: params.repeatPenalty,
      });
    } catch (err) {
      get().updateMessage(sessionId, placeholderMsg.id, (m) => ({
        ...m,
        isStreaming: false,
        isError: true,
        content: `❌ 推理失败: ${err.message}`,
      }));
      set({ isGenerating: false });
      offToken();
      offDone();
      offError();
    }
  },

  // 停止生成
  stopGeneration: () => {
    bridge.cancelStream();
    set({ isGenerating: false });
  },

  // ===== API 服务器 =====
  apiServer: { running: false, port: 1234, baseUrl: null },
  isApiStarting: false,

  refreshApiStatus: async () => {
    const status = await bridge.getApiServerStatus();
    set({ apiServer: status });
  },

  startApiServer: async (port) => {
    set({ isApiStarting: true });
    try {
      const result = await bridge.startApiServer(port);
      await get().refreshApiStatus();
      set({ isApiStarting: false });
      return result;
    } catch (err) {
      set({ isApiStarting: false });
      throw err;
    }
  },

  stopApiServer: async () => {
    await bridge.stopApiServer();
    await get().refreshApiStatus();
  },

  // ===== 视频生成（Seedance 2.0 / 方舟）=====
  appConfig: null,           // 应用配置（含 arkApiKey、videoModelId、videoDefaults）
  videoHistory: [],          // 视频生成历史 [{ id, prompt, params, status, videoUrl, localPath, createdAt }]
  videoGenStatus: 'idle',    // 'idle' | 'queued' | 'running' | 'downloading' | 'error'
  videoGenError: null,
  videoProgress: { stage: null, status: null }, // 进度信息

  // 加载应用配置
  loadAppConfig: async () => {
    try {
      const config = await bridge.video.getConfig();
      set({ appConfig: config });
      return config;
    } catch (err) {
      console.error('加载应用配置失败:', err);
      return null;
    }
  },

  // 保存应用配置（局部更新）
  saveAppConfig: async (partial) => {
    const config = await bridge.video.updateConfig(partial);
    set({ appConfig: { ...config, arkApiKeyMasked: config.arkApiKey ? config.arkApiKey.slice(0, 4) + '****' + config.arkApiKey.slice(-4) : '' } });
    return config;
  },

  // 选择参考图（图生视频）
  selectReferenceImage: async () => {
    const result = await bridge.video.selectImage();
    if (result?.error) {
      set({ videoGenError: result.error });
      return null;
    }
    return result; // { path, dataUrl }
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

    // 订阅进度/成功/失败事件
    const offProgress = bridge.video.onProgress((payload) => {
      set({ videoProgress: payload, videoGenStatus: payload.stage === 'downloading' ? 'downloading' : payload.status });
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
        return null;
      }
      // 成功后更新状态并加入历史
      const record = {
        id: result.taskId || uuidv4(),
        prompt: genParams.prompt || '',
        params: genParams,
        status: 'succeeded',
        videoUrl: result.videoUrl,
        localPath: result.localPath,
        duration: result.duration,
        createdAt: Date.now(),
      };
      set((state) => ({
        videoGenStatus: 'idle',
        videoProgress: { stage: null, status: null },
        videoHistory: [record, ...state.videoHistory].slice(0, 50), // 保留最近 50 条
      }));
      return record;
    } catch (err) {
      offProgress();
      offError();
      set({ videoGenStatus: 'error', videoGenError: err.message });
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

  // ===== UI 状态 =====
  activeView: 'chat', // 'chat' | 'models' | 'api' | 'video' | 'settings'
  setActiveView: (view) => set({ activeView: view }),
}));
