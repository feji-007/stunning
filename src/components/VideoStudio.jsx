import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  Film, Play, Square, Image as ImageIcon, Sparkles,
  Loader2, FolderOpen, Clock, AlertCircle, CheckCircle2, Wand2,
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
const MODELS = [
  { value: 'doubao-seedance-2-0-pro', label: 'Seedance 2.0 Pro', desc: '更高质量' },
  { value: 'doubao-seedance-2-0-fast', label: 'Seedance 2.0 Fast', desc: '更快速度' },
];

export default function VideoStudio() {
  const appConfig = useStore((s) => s.appConfig);
  const loadAppConfig = useStore((s) => s.loadAppConfig);
  const videoGenStatus = useStore((s) => s.videoGenStatus);
  const videoGenError = useStore((s) => s.videoGenError);
  const videoProgress = useStore((s) => s.videoProgress);
  const videoHistory = useStore((s) => s.videoHistory);
  const generateVideo = useStore((s) => s.generateVideo);
  const cancelVideoGeneration = useStore((s) => s.cancelVideoGeneration);
  const selectReferenceImage = useStore((s) => s.selectReferenceImage);
  const openVideoInFolder = useStore((s) => s.openVideoInFolder);
  const setActiveView = useStore((s) => s.setActiveView);

  const [mode, setMode] = useState('text'); // 'text' | 'image'
  const [prompt, setPrompt] = useState('');
  const [refImage, setRefImage] = useState(null); // { path, dataUrl }
  const [modelId, setModelId] = useState('doubao-seedance-2-0-pro');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('16:9');
  const [watermark, setWatermark] = useState(false);
  const [seed, setSeed] = useState(-1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 初始化配置
  useEffect(() => {
    (async () => {
      const config = await loadAppConfig();
      if (config?.videoModelId) setModelId(config.videoModelId);
      if (config?.videoDefaults) {
        const vd = config.videoDefaults;
        setDuration(vd.duration ?? 5);
        setResolution(vd.resolution ?? '720p');
        setRatio(vd.ratio ?? '16:9');
        setWatermark(vd.watermark ?? false);
        setSeed(vd.seed ?? -1);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isGenerating = ['queued', 'running', 'downloading'].includes(videoGenStatus);
  const hasApiKey = !!appConfig?.arkApiKey;

  const handleSelectImage = async () => {
    const result = await selectReferenceImage();
    if (result?.dataUrl) {
      setRefImage(result);
      setMode('image');
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && !refImage) return;
    if (!hasApiKey) {
      setActiveView('settings');
      return;
    }
    await generateVideo({
      mode,
      prompt: prompt.trim(),
      imageUrl: mode === 'image' ? refImage?.dataUrl : undefined,
      modelId,
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

  return (
    <div className="panel video-studio">
      <div className="panel-header">
        <Film size={20} />
        <h1 className="panel-title">视频工作室</h1>
        <span className="video-model-badge">{MODELS.find((m) => m.value === modelId)?.label || modelId}</span>
      </div>

      <p className="panel-desc">
        调用字节跳动 <strong>Seedance 2.0</strong> 模型，通过文本提示词或参考图生成短视频。
        支持文生视频与图生视频，可选时长、分辨率、画面比例。
      </p>

      {/* API Key 未配置提示 */}
      {!hasApiKey && (
        <div className="video-apikey-banner" onClick={() => setActiveView('settings')}>
          <AlertCircle size={16} />
          <span>未配置方舟 API Key，点击前往「设置」填写后即可生成视频</span>
        </div>
      )}

      <div className="video-layout">
        {/* ===== 左侧：参数与生成 ===== */}
        <div className="video-form">
          {/* 模式切换 */}
          <div className="video-mode-tabs">
            <button
              className={`mode-tab ${mode === 'text' ? 'mode-tab--active' : ''}`}
              onClick={() => { setMode('text'); setRefImage(null); }}
            >
              <Sparkles size={15} />
              <span>文生视频</span>
            </button>
            <button
              className={`mode-tab ${mode === 'image' ? 'mode-tab--active' : ''}`}
              onClick={() => setMode('image')}
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
              <div className="param-row">
                <span className="param-label">模型</span>
                <div className="param-options">
                  {MODELS.map((m) => (
                    <button
                      key={m.value}
                      className={`param-option ${modelId === m.value ? 'param-option--active' : ''}`}
                      onClick={() => setModelId(m.value)}
                      disabled={isGenerating}
                      title={m.desc}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="param-row">
                <span className="param-label">水印</span>
                <button
                  className={`param-toggle ${watermark ? 'param-toggle--on' : ''}`}
                  onClick={() => setWatermark(!watermark)}
                  disabled={isGenerating}
                >
                  <span className="param-toggle-knob" />
                </button>
              </div>
              <div className="param-row">
                <span className="param-label">随机种子</span>
                <input
                  type="number"
                  className="seed-input"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || -1)}
                  min={-1}
                  max={999999999}
                  disabled={isGenerating}
                />
                <span className="param-hint">-1 = 随机</span>
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
                disabled={(!prompt.trim() && !refImage) || !hasApiKey}
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
