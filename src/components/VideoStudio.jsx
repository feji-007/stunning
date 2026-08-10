import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  Film, Play, Square, Image as ImageIcon, Sparkles,
  Loader2, FolderOpen, Clock, AlertCircle, CheckCircle2, Wand2, Coins, Cpu,
} from 'lucide-react';

const DURATIONS = [5, 10];
const RESOLUTIONS = ['720p', '1080p'];
const RATIOS = [
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
  { value: '1:1', label: '方形 1:1' },
  { value: '4:3', label: '横屏 4:3' },
  { value: '3:4', label: '竖屏 3:4' },
  { value: '21:9', label: '宽屏 21:9' },
];
// 内置 Seedance 默认模型列表（与服务端默认一致，作为服务器不可达时的兜底）
// 同时覆盖 1.0 / 2.0 系列；1.0 区分 t2v / i2v
const DEFAULT_SEEDANCE_MODELS = [
  { id: 'doubao-seedance-2-0-pro', name: 'Seedance 2.0 Pro', desc: '更高质量' },
  { id: 'doubao-seedance-2-0-fast', name: 'Seedance 2.0 Fast', desc: '更快速度' },
  { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生视频', desc: '1.0 Pro 文生视频' },
  { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生视频', desc: '1.0 Pro 图生视频' },
  { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生视频', desc: '1.0 Lite 文生视频' },
  { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生视频', desc: '1.0 Lite 图生视频' },
];

// 自定义 AI 模式常用模型快捷预设（方舟兼容视频生成模型）
const CUSTOM_MODEL_PRESETS = [
  { id: 'doubao-seedance-2-0-pro', name: 'Seedance 2.0 Pro' },
  { id: 'doubao-seedance-2-0-fast', name: 'Seedance 2.0 Fast' },
  { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生' },
  { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生' },
  { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生' },
  { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生' },
];

// 判断模型 ID 是否仅支持文生视频（t2v 后缀）
function isT2VOnly(modelId) {
  return typeof modelId === 'string' && /-t2v$/i.test(modelId);
}
// 判断模型 ID 是否仅支持图生视频（i2v 后缀）
function isI2VOnly(modelId) {
  return typeof modelId === 'string' && /-i2v$/i.test(modelId);
}

// 积分预估：duration × 2 × (1080p ? 2 : 1)
function calcPointsCost(duration, resolution) {
  return duration * 2 * (resolution === '1080p' ? 2 : 1);
}

export default function VideoStudio() {
  const appConfig = useStore((s) => s.appConfig);
  const loadAppConfig = useStore((s) => s.loadAppConfig);
  const saveAppConfig = useStore((s) => s.saveAppConfig);
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

  const [mode, setMode] = useState('text'); // 'text' | 'image'
  const [prompt, setPrompt] = useState('');
  const [refImage, setRefImage] = useState(null); // { path, dataUrl }
  const [seedanceModel, setSeedanceModel] = useState('doubao-seedance-2-0-pro');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('16:9');
  const [watermark, setWatermark] = useState(false);
  const [seed, setSeed] = useState(-1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 自定义 AI 模式：模型选择（本地态，选择时持久化到配置）
  const [customModel, setCustomModel] = useState('');
  const [customInputMode, setCustomInputMode] = useState(false); // 是否显示自定义输入框
  const [customInputValue, setCustomInputValue] = useState('');

  // 实际使用的模型列表：优先用服务器返回的，兜底用本地默认
  const allSeedanceModels = (seedanceModels && seedanceModels.length)
    ? seedanceModels
    : DEFAULT_SEEDANCE_MODELS;
  // 按当前文生/图生模式过滤：1.0 的 t2v/i2v 模型各自只支持一种模式
  const availableSeedanceModels = allSeedanceModels.filter((m) => {
    if (mode === 'image') return !isT2VOnly(m.id);
    return !isI2VOnly(m.id);
  });
  // 自定义 AI 模式可用预设模型（同样按 t2v/i2v 过滤）
  const availableCustomModels = CUSTOM_MODEL_PRESETS.filter((m) => {
    if (mode === 'image') return !isT2VOnly(m.id);
    return !isI2VOnly(m.id);
  });

  // 初始化配置 + 拉取模型列表
  useEffect(() => {
    (async () => {
      const config = await loadAppConfig();
      if (config?.videoDefaults) {
        const vd = config.videoDefaults;
        setDuration(vd.duration ?? 5);
        setResolution(vd.resolution ?? '720p');
        setRatio(vd.ratio ?? '16:9');
        setWatermark(vd.watermark ?? false);
        setSeed(vd.seed ?? -1);
      }
    })();
    loadSeedanceModels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 模式切换时，若当前选中的模型在新模式下不可用，则回退到 2.0 Pro
  useEffect(() => {
    if (isT2VOnly(seedanceModel) && mode === 'image') {
      setSeedanceModel('doubao-seedance-2-0-pro');
    } else if (isI2VOnly(seedanceModel) && mode === 'text') {
      setSeedanceModel('doubao-seedance-2-0-pro');
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
  const isComfyui = provider === 'comfyui';
  const consumesPoints = provider === 'seedance';
  const isGenerating = ['queued', 'running', 'downloading'].includes(videoGenStatus);

  // 自定义模式：是否已配置 API Key
  const customReady = !!(appConfig?.customVideo?.apiKey && appConfig?.customVideo?.baseURL);
  // ComfyUI 模式：是否已配置服务地址 + 工作流
  const comfyuiReady = !!(appConfig?.comfyui?.baseURL && appConfig?.comfyui?.workflow?.trim());
  // 内置模式：积分是否足够
  const pointsCost = calcPointsCost(duration, resolution);
  const userPoints = user?.points ?? 0;
  const pointsEnough = userPoints >= pointsCost;

  const providerReady = isCustom ? customReady : isComfyui ? comfyuiReady : pointsEnough;
  const canGenerate = providerReady && (!!prompt.trim() || !!refImage);

  const handleSelectImage = async () => {
    const result = await selectReferenceImage();
    if (result?.dataUrl) {
      setRefImage(result);
      setMode('image');
    }
  };

  const handleSwitchProvider = async (p) => {
    await saveAppConfig({ videoProvider: p });
  };

  // 自定义模式：选择预设模型（持久化到配置）
  const handleSelectCustomModel = async (modelId) => {
    setCustomModel(modelId);
    setCustomInputMode(false);
    setCustomInputValue(modelId);
    await saveAppConfig({ customVideo: { modelId } });
  };

  // 自定义模式：应用手动输入的模型 ID
  const handleApplyCustomModel = async () => {
    const val = customInputValue.trim();
    if (!val) return;
    setCustomModel(val);
    await saveAppConfig({ customVideo: { modelId: val } });
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
    if (isComfyui && !comfyuiReady) {
      setActiveView('settings');
      return;
    }
    await generateVideo({
      provider,
      mode,
      prompt: prompt.trim(),
      imageUrl: mode === 'image' ? refImage?.dataUrl : undefined,
      // 内置模式用 UI 选择的 Seedance 模型；自定义模式用 UI 选择/配置的 modelId；ComfyUI 无需 model
      model: isCustom ? (customModel || appConfig?.customVideo?.modelId) : (isComfyui ? undefined : seedanceModel),
      duration,
      resolution,
      ratio,
      watermark,
      seed,
    });
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
    : isComfyui
      ? 'ComfyUI 本地'
      : (allSeedanceModels.find((m) => m.id === seedanceModel)?.name || seedanceModel);

  return (
    <div className="panel video-studio">
      <div className="panel-header">
        <Film size={20} />
        <h1 className="panel-title">视频工作室</h1>
        <span className="video-model-badge">{currentModelLabel}</span>
      </div>

      <p className="panel-desc">
        通过文本提示词或参考图生成短视频。支持<strong>内置 Seedance 2.0</strong>（消耗积分）、
        <strong>自定义视频生成 AI</strong>（自带 Key，方舟 API 兼容格式）与
        <strong>ComfyUI 本地部署</strong>（完全免费）。
      </p>

      {/* 提供商切换 */}
      <div className="video-mode-tabs" style={{ marginBottom: 16 }}>
        <button
          className={`mode-tab ${provider === 'seedance' ? 'mode-tab--active' : ''}`}
          onClick={() => handleSwitchProvider('seedance')}
          disabled={isGenerating}
        >
          <Sparkles size={15} />
          <span>内置 Seedance</span>
          <Coins size={12} style={{ marginLeft: 4, opacity: 0.7 }} />
        </button>
        <button
          className={`mode-tab ${isCustom ? 'mode-tab--active' : ''}`}
          onClick={() => handleSwitchProvider('custom')}
          disabled={isGenerating}
        >
          <Wand2 size={15} />
          <span>自定义 AI</span>
        </button>
        <button
          className={`mode-tab ${isComfyui ? 'mode-tab--active' : ''}`}
          onClick={() => handleSwitchProvider('comfyui')}
          disabled={isGenerating}
        >
          <Cpu size={15} />
          <span>ComfyUI 本地</span>
        </button>
      </div>

      {/* 内置模式：积分提示 */}
      {consumesPoints && (
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
          <span>未配置自定义视频生成 AI 的 API Key / Base URL，点击前往「设置」填写</span>
        </div>
      )}

      {/* ComfyUI 模式：未配置提示 */}
      {isComfyui && !comfyuiReady && (
        <div className="video-apikey-banner video-apikey-banner--warn" onClick={() => setActiveView('settings')}>
          <AlertCircle size={16} />
          <span>未配置 ComfyUI 服务地址 / 工作流模板，点击前往「设置」填写</span>
        </div>
      )}

      <div className="video-layout">
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
              {/* ===== 模型选择 ===== */}
              <div className="video-advanced-section">
                <span className="video-advanced-section-title">模型</span>

                {/* 内置 Seedance 模式：按钮选择 */}
                {!isCustom && !isComfyui && (
                  <div className="video-advanced-field">
                    <div className="param-options">
                      {availableSeedanceModels.map((m) => (
                        <button
                          key={m.id}
                          className={`param-option ${seedanceModel === m.id ? 'param-option--active' : ''}`}
                          onClick={() => setSeedanceModel(m.id)}
                          disabled={isGenerating}
                          title={m.desc || m.name}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                    <span className="video-advanced-hint">
                      {mode === 'image' ? '图生模式下仅显示支持图生的模型' : '文生模式下仅显示支持文生的模型'}
                    </span>
                  </div>
                )}

                {/* 自定义 AI 模式：预设按钮 + 自定义输入 */}
                {isCustom && (
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
                      {mode === 'image' ? '图生模式下仅显示支持图生的模型，' : '文生模式下仅显示支持文生的模型，'}
                      点击「自定义」可输入其他模型 ID
                    </span>
                  </div>
                )}

                {/* ComfyUI 模式：显示工作流配置状态 */}
                {isComfyui && (
                  <div className="video-advanced-field">
                    <span className="video-advanced-hint">
                      {appConfig?.comfyui?.workflow?.trim()
                        ? '已配置工作流（参数通过占位符注入）'
                        : '未配置工作流（请在设置中填写）'}
                    </span>
                  </div>
                )}
              </div>

              {/* ===== 输出选项 ===== */}
              <div className="video-advanced-section">
                <span className="video-advanced-section-title">输出选项</span>

                {/* 水印：仅方舟模式支持；ComfyUI 由工作流节点控制 */}
                {!isComfyui && (
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
                )}

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
                    {isComfyui ? '-1 随机（注入 {{seed}}）' : '-1 = 随机'}
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

        {/* ===== 右侧：结果预览 + 历史 ===== */}
        <div className="video-result">
          {/* 最新结果 */}
          {videoHistory[0] && (
            <div className="video-latest">
              <div className="video-latest-header">
                <CheckCircle2 size={16} className="video-latest-icon" />
                <span>最新生成</span>
                <span className="video-latest-provider">
                  {videoHistory[0].provider === 'custom' ? '自定义' : videoHistory[0].provider === 'comfyui' ? 'ComfyUI' : 'Seedance'}
                </span>
              </div>
              <div className="video-player-wrapper">
                <video
                  src={`file://${videoHistory[0].localPath}`}
                  controls
                  autoPlay
                  loop
                  className="video-player"
                />
              </div>
              <div className="video-latest-meta">
                <p className="video-latest-prompt" title={videoHistory[0].prompt}>
                  {videoHistory[0].prompt || '(图生视频)'}
                </p>
                <div className="video-latest-tags">
                  <span>{videoHistory[0].duration}秒</span>
                  <span>{videoHistory[0].params.resolution}</span>
                  <span>{videoHistory[0].params.ratio}</span>
                </div>
                <div className="video-latest-actions">
                  <button className="btn btn-secondary" onClick={() => openVideoInFolder(videoHistory[0].localPath)}>
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
                {videoHistory.map((item) => (
                  <div key={item.id} className="video-history-item">
                    <div className="video-history-thumb">
                      <video src={`file://${item.localPath}`} muted className="video-history-video" />
                    </div>
                    <div className="video-history-info">
                      <p className="video-history-prompt">{item.prompt || '(图生视频)'}</p>
                      <div className="video-history-tags">
                        <span>{item.duration}秒</span>
                        <span>{item.params.resolution}</span>
                        <span>{item.params.ratio}</span>
                        <span>{item.provider === 'custom' ? '自定义' : item.provider === 'comfyui' ? 'ComfyUI' : 'Seedance'}</span>
                      </div>
                      <span className="video-history-time">
                        {new Date(item.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <button
                      className="video-history-open"
                      onClick={() => openVideoInFolder(item.localPath)}
                      title="在文件夹中显示"
                    >
                      <FolderOpen size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
