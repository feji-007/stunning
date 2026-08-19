import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { bridge } from '../ipc/bridge';
import {
  Film, Play, Square, Image as ImageIcon, Sparkles,
  Loader2, FolderOpen, Clock, AlertCircle, CheckCircle2, Wand2, Coins,
} from 'lucide-react';

// 客户端兜底参数：服务器不可达时使用；实际运行时由后台管理的 videoParams 覆盖
const FALLBACK_VIDEO_PARAMS = {
  durations: [5, 10],
  resolutions: ['720p', '1080p'],
  ratios: [
    { value: '16:9', label: '横屏 16:9' },
    { value: '9:16', label: '竖屏 9:16' },
    { value: '1:1',  label: '方形 1:1' },
    { value: '4:3',  label: '横屏 4:3' },
    { value: '3:4',  label: '竖屏 3:4' },
    { value: '21:9', label: '宽屏 21:9' },
  ],
  defaultDuration: 5,
  defaultResolution: '720p',
  defaultRatio: '16:9',
  defaultWatermark: false,
  defaultSeed: -1,
};
// 内置模型默认列表（与服务端默认一致，作为服务器不可达时的兜底）
// 内置模型 = 部署在本地服务器的视频生成模型（当前为占位示例，由管理员在后台维护）
const DEFAULT_SEEDANCE_MODELS = [
  { id: 'local-video-lite-t2v', name: '本地视频模型 Lite 文生视频', desc: '本地部署 · 文生视频（占位）' },
  { id: 'local-video-lite-i2v', name: '本地视频模型 Lite 图生视频', desc: '本地部署 · 图生视频（占位）' },
  { id: 'local-video-pro-t2v', name: '本地视频模型 Pro 文生视频', desc: '本地部署 · 文生视频（占位）' },
  { id: 'local-video-pro-i2v', name: '本地视频模型 Pro 图生视频', desc: '本地部署 · 图生视频（占位）' },
];

// 自定义模型快捷预设：所有需要 API Key 的 Seedance 系列（1.x + 2.x）均归入自定义模型
const CUSTOM_MODEL_PRESETS = [
  { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生' },
  { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生' },
  { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生' },
  { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生' },
  { id: 'doubao-seedance-2-0-pro', name: 'Seedance 2.0 Pro' },
  { id: 'doubao-seedance-2-0-fast', name: 'Seedance 2.0 Fast' },
];

// 判断模型 ID 是否仅支持文生视频（t2v 后缀）
function isT2VOnly(modelId) {
  return typeof modelId === 'string' && /-t2v$/i.test(modelId);
}
// 判断模型 ID 是否仅支持图生视频（i2v 后缀）
function isI2VOnly(modelId) {
  return typeof modelId === 'string' && /-i2v$/i.test(modelId);
}

/**
 * 将本地文件路径转换为可在 <video> src 中使用的 URL
 * 优先使用 Electron 自定义协议 local-video://（更稳定，绕过 file:// 的 CSP 限制）
 * - Windows: C:\Users\x\a.mp4 -> local-video:///C:/Users/x/a.mp4
 * - Unix: /home/x/a.mp4 -> local-video:///home/x/a.mp4
 * 兜底：file:// 协议（非 Electron 环境下）
 */
function localPathToFileUrl(localPath) {
  if (!localPath) return '';
  // 统一反斜杠为正斜杠
  const normalized = localPath.replace(/\\/g, '/');
  // Windows 绝对路径（形如 C:/...）前面已自带斜杠结构，直接追加即可
  // 我们使用 local-video:///<path> 形式（三斜杠后接完整路径）
  return `local-video:///${normalized}`;
}

// 积分预估：duration × 2 × (1080p ? 2 : 1)
// 内置模型（本地服务器部署）统一消耗积分，无免费变体
function calcPointsCost(duration, resolution) {
  return duration * 2 * (resolution === '1080p' ? 2 : 1);
}

export default function VideoStudio() {
  const appConfig = useStore((s) => s.appConfig);
  const loadAppConfig = useStore((s) => s.loadAppConfig);
  const saveVideoConfig = useStore((s) => s.saveVideoConfig);
  const user = useStore((s) => s.user);
  const videoGenStatus = useStore((s) => s.videoGenStatus);
  const videoGenError = useStore((s) => s.videoGenError);
  const videoProgress = useStore((s) => s.videoProgress);
  const videoHistory = useStore((s) => s.videoHistory);
  const generateVideo = useStore((s) => s.generateVideo);
  const cancelVideoGeneration = useStore((s) => s.cancelVideoGeneration);
  const selectReferenceImage = useStore((s) => s.selectReferenceImage);
  const openVideoInFolder = useStore((s) => s.openVideoInFolder);
  const setActiveView = useStore((s) => s.setActiveView);
  const seedanceModels = useStore((s) => s.seedanceModels);
  const loadSeedanceModels = useStore((s) => s.loadSeedanceModels);
  const loadVideoHistory = useStore((s) => s.loadVideoHistory);

  const [mode, setMode] = useState('text'); // 'text' | 'image'
  const [prompt, setPrompt] = useState('');
  const [refImage, setRefImage] = useState(null); // { path, dataUrl }
  const [seedanceModel, setSeedanceModel] = useState('local-video-lite-t2v');
  // 视频参数：从服务器拉取（后台管理），兜底 FALLBACK_VIDEO_PARAMS
  const [videoParams, setVideoParams] = useState(FALLBACK_VIDEO_PARAMS);
  const [duration, setDuration] = useState(FALLBACK_VIDEO_PARAMS.defaultDuration);
  const [resolution, setResolution] = useState(FALLBACK_VIDEO_PARAMS.defaultResolution);
  const [ratio, setRatio] = useState(FALLBACK_VIDEO_PARAMS.defaultRatio);
  const [watermark, setWatermark] = useState(FALLBACK_VIDEO_PARAMS.defaultWatermark);
  const [seed, setSeed] = useState(FALLBACK_VIDEO_PARAMS.defaultSeed);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 自定义模型模式：模型选择（本地态，选择时持久化到配置）
  const [customModel, setCustomModel] = useState('');
  const [customInputMode, setCustomInputMode] = useState(false); // 是否显示自定义输入框
  const [customInputValue, setCustomInputValue] = useState('');

  // 当前在预览区播放的历史记录 id（null 时默认播放最新一条）
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);

  // 左右分栏拖拽：左侧宽度占比（0.2 ~ 0.8），从 localStorage 读取上次值
  const LAYOUT_STORAGE_KEY = 'videoStudio.leftRatio';
  const [leftRatio, setLeftRatio] = useState(() => {
    const saved = parseFloat(localStorage.getItem(LAYOUT_STORAGE_KEY));
    return Number.isFinite(saved) && saved >= 0.2 && saved <= 0.8 ? saved : 0.5;
  });
  const leftRatioRef = useRef(leftRatio);
  const layoutRef = useRef(null);
  const draggingRef = useRef(false);

  // 挂载时绑定一次 mousemove / mouseup，通过 draggingRef 控制是否响应，
  // 避免在 mousedown 中反复增删监听导致引用不一致与卸载残留。
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!draggingRef.current || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const RESIZER_WIDTH = 24;
      const usable = rect.width - RESIZER_WIDTH;
      if (usable <= 0) return;
      // 扣除分割条自身宽度，使鼠标贴住分割条中线
      let ratio = (e.clientX - rect.left - RESIZER_WIDTH / 2) / usable;
      // 限制范围 20% ~ 80%
      ratio = Math.min(0.8, Math.max(0.2, ratio));
      leftRatioRef.current = ratio;
      setLeftRatio(ratio);
    };
    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(LAYOUT_STORAGE_KEY, String(leftRatioRef.current));
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  // 开始拖拽：标记拖拽中，给 body 加禁用选择 + 列调整光标
  const handleResizerMouseDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  // 实际使用的时长/分辨率/比例：优先用服务器配置，缺失则用 FALLBACK 兜底
  const DURATIONS = (videoParams.durations && videoParams.durations.length)
    ? videoParams.durations
    : FALLBACK_VIDEO_PARAMS.durations;
  const RESOLUTIONS = (videoParams.resolutions && videoParams.resolutions.length)
    ? videoParams.resolutions
    : FALLBACK_VIDEO_PARAMS.resolutions;
  const RATIOS = (videoParams.ratios && videoParams.ratios.length)
    ? videoParams.ratios
    : FALLBACK_VIDEO_PARAMS.ratios;

  // 实际使用的模型列表：优先用服务器返回的，兜底用本地默认
  const allSeedanceModels = (seedanceModels && seedanceModels.length)
    ? seedanceModels
    : DEFAULT_SEEDANCE_MODELS;
  // 按当前文生/图生模式过滤：1.0 的 t2v/i2v 模型各自只支持一种模式
  const availableSeedanceModels = allSeedanceModels.filter((m) => {
    if (mode === 'image') return !isT2VOnly(m.id);
    return !isI2VOnly(m.id);
  });
  // 自定义模型模式可用预设模型（同样按 t2v/i2v 过滤）
  const availableCustomModels = CUSTOM_MODEL_PRESETS.filter((m) => {
    if (mode === 'image') return !isT2VOnly(m.id);
    return !isI2VOnly(m.id);
  });

  // 初始化配置 + 拉取模型列表 + 拉取后台管理的视频参数
  useEffect(() => {
    (async () => {
      // 1) 先拉取后台管理的 videoParams（若可用），决定基础默认值
      let serverParams = null;
      try {
        const s = await bridge.server.getSettings();
        if (s?.videoParams) serverParams = s.videoParams;
      } catch (err) {
        console.warn('拉取视频参数失败，使用兜底：', err.message);
      }
      const effectiveParams = serverParams || FALLBACK_VIDEO_PARAMS;
      // 过滤出合法结构，避免后台保存时误填导致 UI 崩溃
      const merged = {
        durations: Array.isArray(effectiveParams.durations) && effectiveParams.durations.length
          ? effectiveParams.durations
          : FALLBACK_VIDEO_PARAMS.durations,
        resolutions: Array.isArray(effectiveParams.resolutions) && effectiveParams.resolutions.length
          ? effectiveParams.resolutions
          : FALLBACK_VIDEO_PARAMS.resolutions,
        ratios: Array.isArray(effectiveParams.ratios) && effectiveParams.ratios.length
          ? effectiveParams.ratios
          : FALLBACK_VIDEO_PARAMS.ratios,
        defaultDuration: typeof effectiveParams.defaultDuration === 'number'
          ? effectiveParams.defaultDuration
          : FALLBACK_VIDEO_PARAMS.defaultDuration,
        defaultResolution: typeof effectiveParams.defaultResolution === 'string'
          ? effectiveParams.defaultResolution
          : FALLBACK_VIDEO_PARAMS.defaultResolution,
        defaultRatio: typeof effectiveParams.defaultRatio === 'string'
          ? effectiveParams.defaultRatio
          : FALLBACK_VIDEO_PARAMS.defaultRatio,
        defaultWatermark: typeof effectiveParams.defaultWatermark === 'boolean'
          ? effectiveParams.defaultWatermark
          : FALLBACK_VIDEO_PARAMS.defaultWatermark,
        defaultSeed: typeof effectiveParams.defaultSeed === 'number'
          ? effectiveParams.defaultSeed
          : FALLBACK_VIDEO_PARAMS.defaultSeed,
      };
      setVideoParams(merged);

      // 2) 再读取本地保存的 videoDefaults（用户上次选择），优先于后台默认值
      const config = await loadAppConfig();
      const vd = config?.videoDefaults || {};
      // 但如果本地值不在当前服务器可选范围内，则回退到服务器默认
      const durationFallback = (() => {
        if (typeof vd.duration === 'number' && merged.durations.includes(vd.duration)) return vd.duration;
        return merged.durations.includes(merged.defaultDuration)
          ? merged.defaultDuration
          : merged.durations[0];
      })();
      const resolutionFallback = (() => {
        if (typeof vd.resolution === 'string' && merged.resolutions.includes(vd.resolution)) return vd.resolution;
        return merged.resolutions.includes(merged.defaultResolution)
          ? merged.defaultResolution
          : merged.resolutions[0];
      })();
      const ratioFallback = (() => {
        const values = merged.ratios.map((r) => r.value);
        if (typeof vd.ratio === 'string' && values.includes(vd.ratio)) return vd.ratio;
        return values.includes(merged.defaultRatio)
          ? merged.defaultRatio
          : values[0];
      })();
      setDuration(durationFallback);
      setResolution(resolutionFallback);
      setRatio(ratioFallback);
      setWatermark(typeof vd.watermark === 'boolean' ? vd.watermark : merged.defaultWatermark);
      setSeed(typeof vd.seed === 'number' ? vd.seed : merged.defaultSeed);
    })();
    loadSeedanceModels();
    // 加载本地持久化的视频历史，启动后自动展示
    loadVideoHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 模式切换时，若当前选中的模型在新模式下不可用，则回退到默认本地模型
  useEffect(() => {
    if (isT2VOnly(seedanceModel) && mode === 'image') {
      setSeedanceModel('local-video-lite-i2v');
    } else if (isI2VOnly(seedanceModel) && mode === 'text') {
      setSeedanceModel('local-video-lite-t2v');
    }
    // 自定义模式：若当前选中模型在新模式下不可用且非自定义输入，回退到 2.0 Pro
    if (isCustom && !customInputMode) {
      if (isT2VOnly(customModel) && mode === 'image') {
        handleSelectCustomModel('doubao-seedance-2-0-pro');
      } else if (isI2VOnly(customModel) && mode === 'text') {
        handleSelectCustomModel('doubao-seedance-2-0-pro');
      }
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自定义模式：从配置同步模型 ID 到本地态
  // 若配置的模型不在预设列表中，自动切换到「自定义输入」模式
  useEffect(() => {
    const configured = appConfig?.customVideo?.modelId || '';
    setCustomModel(configured);
    setCustomInputValue(configured);
    const isPreset = CUSTOM_MODEL_PRESETS.some((p) => p.id === configured);
    setCustomInputMode(!!configured && !isPreset);
  }, [appConfig?.customVideo?.modelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const provider = appConfig?.videoProvider || 'seedance';
  const isCustom = provider === 'custom';
  // 内置模型（本地服务器部署）统一消耗积分，无免费变体
  const consumesPoints = provider === 'seedance';
  const isGenerating = ['queued', 'running', 'downloading'].includes(videoGenStatus);

  // 自定义模式：是否已配置 API Key
  const customReady = !!(appConfig?.customVideo?.apiKey && appConfig?.customVideo?.baseURL);
  // 内置模式：积分足够判断
  const pointsCost = calcPointsCost(duration, resolution);
  const userPoints = user?.points ?? 0;
  const pointsEnough = userPoints >= pointsCost;

  const providerReady = isCustom ? customReady : pointsEnough;
  const canGenerate = providerReady && (!!prompt.trim() || !!refImage);

  // 预览区显示的视频：优先显示用户在历史中点击选中的，否则默认最新一条
  const previewVideo = selectedHistoryId
    ? videoHistory.find((v) => v.id === selectedHistoryId)
    : videoHistory[0];

  const handleSelectImage = async () => {
    const result = await selectReferenceImage();
    if (result?.dataUrl) {
      setRefImage(result);
      setMode('image');
    }
  };

  const handleSwitchProvider = async (p) => {
    await saveVideoConfig({ videoProvider: p });
  };

  // 自定义模式：选择预设模型（持久化到配置）
  const handleSelectCustomModel = async (modelId) => {
    setCustomModel(modelId);
    setCustomInputMode(false);
    setCustomInputValue(modelId);
    await saveVideoConfig({ customVideo: { modelId } });
  };

  // 自定义模式：应用手动输入的模型 ID
  const handleApplyCustomModel = async () => {
    const val = customInputValue.trim();
    if (!val) return;
    setCustomModel(val);
    await saveVideoConfig({ customVideo: { modelId: val } });
  };

  // 自定义模式：切换到自定义输入
  const handleSwitchToCustomInput = () => {
    setCustomInputMode(true);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && !refImage) return;
    if (isCustom && !customReady) {
      setActiveView('settings');
      return;
    }
    await generateVideo({
      provider,
      mode,
      prompt: prompt.trim(),
      imageUrl: mode === 'image' ? refImage?.dataUrl : undefined,
      // 内置模式用 UI 选择的 Seedance 模型；自定义模式用 UI 选择/配置的 modelId
      model: isCustom ? (customModel || appConfig?.customVideo?.modelId) : seedanceModel,
      duration,
      resolution,
      ratio,
      watermark,
      seed,
    });
    // 生成完成后切回最新一条
    setSelectedHistoryId(null);
  };

  const handleCancel = () => cancelVideoGeneration();

  const stageLabel = {
    queued: '排队中...',
    running: '生成中...',
    downloading: '下载中...',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
    timeout: '超时',
    idle: '',
  }[videoProgress.stage || videoGenStatus] || '';

  const currentModelLabel = isCustom
    ? (customModel
      ? (CUSTOM_MODEL_PRESETS.find((p) => p.id === customModel)?.name || customModel)
      : '未配置')
    : (allSeedanceModels.find((m) => m.id === seedanceModel)?.name || seedanceModel);

  return (
    <div className="panel video-studio">
      <div className="panel-header">
        <Film size={20} />
        <h1 className="panel-title">视频工作室</h1>
        <span className="video-model-badge">{currentModelLabel}</span>
      </div>

      <p className="panel-desc">
        通过文本提示词或参考图生成短视频。支持<strong>内置模型</strong>（部署在本地服务器，消耗积分）、
        <strong>自定义模型</strong>（自带 API Key，如 Seedance 系列，方舟 API 兼容格式）。
      </p>

      {/* 提供商切换 */}
      <div className="video-mode-tabs" style={{ marginBottom: 16 }}>
        <button
          className={`mode-tab ${provider === 'seedance' ? 'mode-tab--active' : ''}`}
          onClick={() => handleSwitchProvider('seedance')}
          disabled={isGenerating}
        >
          <Sparkles size={15} />
          <span>内置模型</span>
          <Coins size={12} style={{ marginLeft: 4, opacity: 0.7 }} />
        </button>
        <button
          className={`mode-tab ${isCustom ? 'mode-tab--active' : ''}`}
          onClick={() => handleSwitchProvider('custom')}
          disabled={isGenerating}
        >
          <Wand2 size={15} />
          <span>自定义模型</span>
        </button>
      </div>

      {/* 内置模式：积分提示（内置模型统一消耗积分） */}
      {provider === 'seedance' && (
        <div className={`video-apikey-banner ${pointsEnough ? '' : 'video-apikey-banner--warn'}`}>
          <Coins size={16} />
          <span>
            本次预计消耗 <strong>{pointsCost}</strong> 积分，当前剩余 <strong>{userPoints}</strong> 积分
            {!pointsEnough && '（积分不足，无法生成）'}
          </span>
        </div>
      )}

      {/* 自定义模式：未配置提示 */}
      {isCustom && !customReady && (
        <div className="video-apikey-banner video-apikey-banner--warn" onClick={() => setActiveView('settings')}>
          <AlertCircle size={16} />
          <span>未配置自定义模型的 API Key / Base URL，点击前往「设置」填写</span>
        </div>
      )}

      <div
        className="video-layout"
        ref={layoutRef}
        style={{ gridTemplateColumns: `${leftRatio}fr 24px ${1 - leftRatio}fr` }}
      >
        {/* ===== 左侧：参数与生成 ===== */}
        <div className="video-form">
          {/* 模式切换：文生 / 图生 */}
          <div className="video-mode-tabs">
            <button
              className={`mode-tab ${mode === 'text' ? 'mode-tab--active' : ''}`}
              onClick={() => { setMode('text'); setRefImage(null); }}
              disabled={isGenerating}
            >
              <Sparkles size={15} />
              <span>文生视频</span>
            </button>
            <button
              className={`mode-tab ${mode === 'image' ? 'mode-tab--active' : ''}`}
              onClick={() => setMode('image')}
              disabled={isGenerating}
            >
              <ImageIcon size={15} />
              <span>图生视频</span>
            </button>
          </div>

          {/* 参考图（图生模式） */}
          {mode === 'image' && (
            <div className="video-ref-image">
              {refImage ? (
                <div className="ref-image-preview">
                  <img src={refImage.dataUrl} alt="参考图" className="ref-image-img" />
                  <div className="ref-image-actions">
                    <button className="btn btn-secondary" onClick={handleSelectImage}>
                      <ImageIcon size={14} />
                      <span>更换</span>
                    </button>
                    <button className="btn btn-secondary" onClick={() => setRefImage(null)}>
                      <span>移除</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button className="ref-image-upload" onClick={handleSelectImage}>
                  <ImageIcon size={28} />
                  <span>选择参考图</span>
                  <span className="ref-image-hint">支持 PNG / JPG / WEBP / GIF</span>
                </button>
              )}
            </div>
          )}

          {/* 提示词输入 */}
          <div className="video-prompt-section">
            <label className="field-label">提示词 {mode === 'image' && '(描述画面动效)'}</label>
            <textarea
              className="video-prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder={
                mode === 'image'
                  ? '描述参考图的运动方式，例如：镜头缓慢推进，人物微笑着转头...'
                  : '描述你想生成的视频画面，越具体效果越好。例如：一只柴犬在樱花树下奔跑，镜头跟随，慢动作，电影感...'
              }
              disabled={isGenerating}
            />
          </div>

          {/* 基础参数 */}
          <div className="video-params">
            {/* 内置 AI 模式：模型下拉框（直接显示在基础参数区） */}
            {!isCustom && (
              <div className="param-row">
                <span className="param-label">AI 模型</span>
                <select
                  className="video-model-select"
                  value={seedanceModel}
                  onChange={(e) => setSeedanceModel(e.target.value)}
                  disabled={isGenerating}
                >
                  {availableSeedanceModels.map((m) => (
                    <option key={m.id} value={m.id} title={m.desc || m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="param-row">
              <span className="param-label">时长</span>
              <div className="param-options">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    className={`param-option ${duration === d ? 'param-option--active' : ''}`}
                    onClick={() => setDuration(d)}
                    disabled={isGenerating}
                  >
                    {d}秒
                  </button>
                ))}
              </div>
            </div>

            <div className="param-row">
              <span className="param-label">分辨率</span>
              <div className="param-options">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    className={`param-option ${resolution === r ? 'param-option--active' : ''}`}
                    onClick={() => setResolution(r)}
                    disabled={isGenerating}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="param-row">
              <span className="param-label">画面比例</span>
              <div className="param-options">
                {RATIOS.map((r) => (
                  <button
                    key={r.value}
                    className={`param-option ${ratio === r.value ? 'param-option--active' : ''}`}
                    onClick={() => setRatio(r.value)}
                    disabled={isGenerating}
                    title={r.label}
                  >
                    {r.value}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 高级参数 */}
          <button className="video-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
            <Wand2 size={14} />
            <span>高级参数</span>
          </button>
          {showAdvanced && (
            <div className="video-advanced">
              {/* ===== 模型选择（仅自定义模型模式） ===== */}
              {isCustom && (
              <div className="video-advanced-section">
                <span className="video-advanced-section-title">模型</span>

                {/* 自定义模型模式：预设按钮 + 自定义输入 */}
                <div className="video-advanced-field">
                  <div className="param-options">
                    {availableCustomModels.map((m) => (
                      <button
                        key={m.id}
                        className={`param-option ${!customInputMode && customModel === m.id ? 'param-option--active' : ''}`}
                        onClick={() => handleSelectCustomModel(m.id)}
                        disabled={isGenerating}
                        title={m.id}
                      >
                        {m.name}
                      </button>
                    ))}
                    <button
                      className={`param-option param-option--custom ${customInputMode ? 'param-option--active' : ''}`}
                      onClick={handleSwitchToCustomInput}
                      disabled={isGenerating}
                    >
                      自定义...
                    </button>
                  </div>
                  {customInputMode && (
                    <div className="custom-model-input-row">
                      <input
                        type="text"
                        className="custom-model-input"
                        value={customInputValue}
                        onChange={(e) => setCustomInputValue(e.target.value)}
                        onBlur={handleApplyCustomModel}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        placeholder="输入模型 ID，如 doubao-seedance-2-0-pro"
                        disabled={isGenerating}
                      />
                    </div>
                  )}
                  <span className="video-advanced-hint">
                    点击「自定义」可输入其他模型 ID
                  </span>
                </div>
              </div>
              )}

              {/* ===== 输出选项 ===== */}
              <div className="video-advanced-section">
                <span className="video-advanced-section-title">输出选项</span>

                {/* 水印 */}
                <div className="video-advanced-field video-advanced-field--inline">
                  <span className="video-advanced-field-label">水印</span>
                  <button
                    className={`param-toggle ${watermark ? 'param-toggle--on' : ''}`}
                    onClick={() => setWatermark(!watermark)}
                    disabled={isGenerating}
                  >
                    <span className="param-toggle-knob" />
                  </button>
                </div>

                {/* 随机种子 */}
                <div className="video-advanced-field video-advanced-field--inline">
                  <span className="video-advanced-field-label">随机种子</span>
                  <input
                    type="number"
                    className="seed-input"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || -1)}
                    min={-1}
                    max={999999999}
                    disabled={isGenerating}
                  />
                  <span className="video-advanced-hint video-advanced-hint--inline">
                    -1 = 随机
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 生成按钮 */}
          <div className="video-actions">
            {isGenerating ? (
              <button className="btn btn-danger video-gen-btn" onClick={handleCancel}>
                <Square size={16} />
                <span>取消生成</span>
              </button>
            ) : (
              <button
                className="btn btn-primary video-gen-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                <Play size={16} />
                <span>{mode === 'text' ? '生成视频' : '图生视频'}</span>
              </button>
            )}
          </div>

          {/* 进度 */}
          {isGenerating && (
            <div className="video-progress">
              <Loader2 size={16} className="spin" />
              <span className="video-progress-text">{stageLabel}</span>
              <div className="video-progress-bar">
                <div className={`video-progress-fill video-progress-fill--${videoProgress.stage || videoGenStatus}`} />
              </div>
            </div>
          )}

          {/* 错误 */}
          {videoGenError && (
            <div className="error-banner">
              <AlertCircle size={14} />
              <span>{videoGenError}</span>
            </div>
          )}
        </div>

        {/* ===== 分割条：拖动调整左右两栏宽度 ===== */}
        <div
          className="video-resizer"
          onMouseDown={handleResizerMouseDown}
          title="拖动调整左右宽度"
        >
          <div className="video-resizer-handle" />
        </div>

        {/* ===== 右侧：结果预览 + 历史 ===== */}
        <div className="video-result">
          {/* 预览区：显示当前选中的历史视频，默认为最新一条 */}
          {previewVideo && (
            <div className="video-latest">
              <div className="video-latest-header">
                <CheckCircle2 size={16} className="video-latest-icon" />
                <span>{selectedHistoryId ? '预览' : '最新生成'}</span>
                <span className="video-latest-provider">
                  {previewVideo.provider === 'custom' ? '自定义' : '内置'}
                </span>
              </div>
              <div className="video-player-wrapper">
                <video
                  key={previewVideo.id}
                  src={localPathToFileUrl(previewVideo.localPath)}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="video-player"
                  onError={(e) => console.warn('视频预览加载失败:', previewVideo.localPath, e)}
                />
              </div>
              <div className="video-latest-meta">
                <p className="video-latest-prompt" title={previewVideo.prompt}>
                  {previewVideo.prompt || '(图生视频)'}
                </p>
                <div className="video-latest-tags">
                  <span>{previewVideo.duration}秒</span>
                  <span>{previewVideo.params.resolution}</span>
                  <span>{previewVideo.params.ratio}</span>
                </div>
                <div className="video-latest-actions">
                  <button className="btn btn-secondary" onClick={() => openVideoInFolder(previewVideo.localPath)}>
                    <FolderOpen size={14} />
                    <span>打开目录</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 历史记录 */}
          <div className="video-history">
            <div className="video-history-header">
              <Clock size={15} />
              <span>历史记录 ({videoHistory.length})</span>
            </div>
            {videoHistory.length === 0 ? (
              <div className="video-history-empty">
                <Film size={36} className="video-history-empty-icon" />
                <p>生成的视频将显示在这里</p>
              </div>
            ) : (
              <div className="video-history-list">
                {videoHistory.map((item) => {
                  const isActive = (previewVideo && previewVideo.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className={`video-history-item${isActive ? ' active' : ''}`}
                      onClick={() => setSelectedHistoryId(item.id)}
                      title="点击预览此视频"
                    >
                      <div className="video-history-thumb">
                        <video
                          src={localPathToFileUrl(item.localPath)}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          className="video-history-video"
                          onError={(e) => console.warn('历史缩略图加载失败:', item.localPath, e)}
                        />
                      </div>
                      <div className="video-history-info">
                        <p className="video-history-prompt">{item.prompt || '(图生视频)'}</p>
                        <div className="video-history-tags">
                          <span>{item.duration}秒</span>
                          <span>{item.params.resolution}</span>
                          <span>{item.params.ratio}</span>
                          <span>{item.provider === 'custom' ? '自定义' : '内置'}</span>
                        </div>
                        <span className="video-history-time">
                          {new Date(item.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <button
                        className="video-history-open"
                        onClick={(e) => { e.stopPropagation(); openVideoInFolder(item.localPath); }}
                        title="在文件夹中显示"
                      >
                        <FolderOpen size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
