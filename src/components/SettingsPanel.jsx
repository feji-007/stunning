import { useState } from 'react';
import { useStore } from '../store/useStore';
import { bridge } from '../ipc/bridge';
import {
  Settings, Key, Film, Save, FolderOpen, Check, ExternalLink,
  Sparkles, Wand2, Coins, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';

// 自定义模型快捷预设：所有需要 API Key 的 Seedance 系列（1.x + 2.x）均归入自定义模型
const CUSTOM_MODEL_PRESETS = [
  { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生' },
  { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生' },
  { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生' },
  { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生' },
  { id: 'doubao-seedance-2-0-pro', name: 'Seedance 2.0 Pro' },
  { id: 'doubao-seedance-2-0-fast', name: 'Seedance 2.0 Fast' },
];

export default function SettingsPanel() {
  const appConfig = useStore((s) => s.appConfig);
  const user = useStore((s) => s.user);
  const saveAppConfig = useStore((s) => s.saveAppConfig);
  const saveVideoConfig = useStore((s) => s.saveVideoConfig);
  const selectVideoOutputDir = useStore((s) => s.selectVideoOutputDir);
  const setActiveView = useStore((s) => s.setActiveView);

  // 自定义模型本地输入态（避免每次按键都写盘）
  const [baseURLInput, setBaseURLInput] = useState(appConfig?.customVideo?.baseURL || '');
  const [apiKeyInput, setApiKeyInput] = useState(appConfig?.customVideo?.apiKey || '');
  const [modelIdInput, setModelIdInput] = useState(appConfig?.customVideo?.modelId || '');
  const [savedFlash, setSavedFlash] = useState(false);
  // 自定义模型连通性测试状态
  const [customTestState, setCustomTestState] = useState('idle'); // 'idle' | 'testing' | 'ok' | 'fail'
  const [customTestMsg, setCustomTestMsg] = useState('');

  const videoDefaults = appConfig?.videoDefaults || {};
  const outputDir = videoDefaults.outputDir || '';
  const provider = appConfig?.videoProvider || 'seedance';

  const handleSaveCustom = async () => {
    await saveVideoConfig({
      customVideo: {
        baseURL: baseURLInput.trim(),
        apiKey: apiKeyInput.trim(),
        modelId: modelIdInput.trim() || 'doubao-seedance-2-0-pro',
      },
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  // 测试自定义模型连通性（调用方舟 /models 接口验证 API Key）
  const handleTestCustom = async () => {
    setCustomTestState('testing');
    setCustomTestMsg('');
    try {
      // 优先用输入框中的值，未输入则用已保存的配置（便于测试已保存的 key）
      const base = baseURLInput.trim() || appConfig?.customVideo?.baseURL || '';
      const key = apiKeyInput.trim() || appConfig?.customVideo?.apiKey || '';
      const model = modelIdInput.trim() || appConfig?.customVideo?.modelId || '';
      const res = await bridge.video.testCustom(base, key, model);
      const modelCount = res?.modelCount;
      const matched = res?.modelMatched;
      let msg = '连接成功';
      if (modelCount != null) msg += `，可访问 ${modelCount} 个模型`;
      if (model && matched === false) msg += `；注意：当前模型 ID「${model}」未在返回列表中找到，请确认是否已开通`;
      setCustomTestState('ok');
      setCustomTestMsg(msg);
    } catch (err) {
      setCustomTestState('fail');
      setCustomTestMsg(err?.message || '连接失败');
    }
  };

  // 快速选择预设模型 ID
  const handlePickPreset = (presetId) => {
    setModelIdInput(presetId);
    setCustomTestState('idle');
    setCustomTestMsg('');
  };

  const handleSelectProvider = async (p) => {
    await saveVideoConfig({ videoProvider: p });
  };

  return (
    <div className="panel settings-panel">
      <div className="panel-header">
        <Settings size={20} />
        <h1 className="panel-title">设置</h1>
      </div>

      {/* 视频生成提供商选择 */}
      <div className="settings-section video-api-section">
        <h3 className="settings-section-title">
          <Film size={16} />
          视频生成提供商
        </h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          选择视频生成方式：内置模型（部署在本地服务器，消耗积分）或自定义模型（自带 API Key，例如 Seedance 系列）。
        </p>

        <div className="video-mode-tabs" style={{ marginBottom: 16 }}>
          <button
            className={`mode-tab ${provider === 'seedance' ? 'mode-tab--active' : ''}`}
            onClick={() => handleSelectProvider('seedance')}
          >
            <Sparkles size={15} />
            <span>内置模型</span>
          </button>
          <button
            className={`mode-tab ${provider === 'custom' ? 'mode-tab--active' : ''}`}
            onClick={() => handleSelectProvider('custom')}
          >
            <Wand2 size={15} />
            <span>自定义模型</span>
          </button>
        </div>

        {/* 内置模型说明 */}
        {provider === 'seedance' && (
          <div className="settings-section">
            <div className="video-apikey-banner">
              <Coins size={16} />
              <span>
                内置模型部署在本地服务器，由服务器统一调用，用户无需配置 URL / API Key。
                当前剩余 <strong>{user?.points ?? 0}</strong> 积分。
              </span>
            </div>
            <ul className="settings-info-list" style={{ marginTop: 12 }}>
              <li><strong>内置模型</strong>：部署在本地服务器的视频生成模型（当前为占位示例，由管理员在后台维护）。</li>
              <li>积分规则：5 秒 720p = 10 积分，5 秒 1080p = 20 积分，10 秒翻倍。</li>
              <li>生成失败会自动退还已扣除的积分。</li>
              <li>积分由服务器统一管理，注册账号即赠送 100 积分。</li>
            </ul>
          </div>
        )}

        {/* 自定义模型配置 */}
        {provider === 'custom' && (
          <div className="settings-section">
            <p className="field-hint" style={{ marginBottom: 12 }}>
              填写方舟 API 兼容的视频生成端点。使用你自己的 API Key（例如 Seedance 系列），调用不消耗积分。
            </p>

            <div className="video-apikey-row">
              <label className="field-label">Base URL</label>
              <input
                type="text"
                className="video-apikey-input"
                style={{ width: '80%' }}
                value={baseURLInput}
                onChange={(e) => { setBaseURLInput(e.target.value); setCustomTestState('idle'); setCustomTestMsg(''); }}
                placeholder="https://ark.cn-beijing.volces.com/api/v3"
              />
            </div>

            <div className="video-apikey-row">
              <label className="field-label">
                <Key size={13} />
                API Key
              </label>
              <input
                type="password"
                className="video-apikey-input"
                style={{ width: '80%' }}
                value={apiKeyInput}
                onChange={(e) => { setApiKeyInput(e.target.value); setCustomTestState('idle'); setCustomTestMsg(''); }}
                placeholder={appConfig?.customVideo?.apiKey ? '已配置（重新输入可覆盖）' : '输入方舟 API Key'}
              />
              {appConfig?.customVideo?.apiKey && (
                <p className="field-hint">
                  当前已配置: <code className="inline-code">
                    {appConfig.customVideo.apiKey.slice(0, 4)}****{appConfig.customVideo.apiKey.slice(-4)}
                  </code>
                </p>
              )}
            </div>

            <div className="video-apikey-row">
              <label className="field-label">模型 ID</label>
              <input
                type="text"
                className="video-apikey-input"
                style={{ width: '80%' }}
                value={modelIdInput}
                onChange={(e) => { setModelIdInput(e.target.value); setCustomTestState('idle'); setCustomTestMsg(''); }}
                placeholder="doubao-seedance-2-0-pro"
              />
              <p className="field-hint">火山引擎方舟的视频生成模型 ID，如 doubao-seedance-2-0-pro</p>
              {/* 模型快捷预设 */}
              <div className="comfyui-url-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                {CUSTOM_MODEL_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`btn btn-secondary ${modelIdInput.trim() === p.id ? 'btn-primary' : ''}`}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => handlePickPreset(p.id)}
                    title={p.id}
                  >
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="video-apikey-input-row" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveCustom}
                disabled={!baseURLInput.trim() || !apiKeyInput.trim()}
              >
                {savedFlash ? <Check size={15} /> : <Save size={15} />}
                <span>{savedFlash ? '已保存' : '保存配置'}</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleTestCustom}
                disabled={
                  customTestState === 'testing' ||
                  (!baseURLInput.trim() && !appConfig?.customVideo?.baseURL) ||
                  (!apiKeyInput.trim() && !appConfig?.customVideo?.apiKey)
                }
              >
                {customTestState === 'testing' ? <Loader2 size={15} className="spin" /> : <Key size={15} />}
                <span>{customTestState === 'testing' ? '测试中' : '测试连通性'}</span>
              </button>
              {customTestState === 'ok' && (
                <span className="field-hint comfyui-test-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={13} />
                  <span>{customTestMsg}</span>
                </span>
              )}
              {customTestState === 'fail' && (
                <span className="field-hint comfyui-test-fail" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={13} />
                  <span>{customTestMsg}</span>
                </span>
              )}
            </div>

            <p className="field-hint" style={{ marginTop: 12 }}>
              在
              <a
                className="settings-link"
                href="#"
                onClick={(e) => { e.preventDefault(); window.open('https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', '_blank'); }}
              >
                火山引擎方舟控制台 <ExternalLink size={11} />
              </a>
              创建 API Key，并确保已开通视频生成模型。点击「测试连通性」可验证 API Key 是否有效。
            </p>
          </div>
        )}
      </div>

      {/* 视频保存目录 */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <FolderOpen size={16} />
          视频保存目录
        </h3>
        <div className="model-dir-row">
          <input className="model-dir-input" value={outputDir} readOnly placeholder="默认: ~/Videos/stunning" />
          <button className="btn btn-secondary" onClick={selectVideoOutputDir}>
            <FolderOpen size={15} />
            <span>选择</span>
          </button>
        </div>
      </div>

      {/* 外部链接打开方式 */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <ExternalLink size={16} />
          外部链接打开方式
        </h3>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          点击应用内的外部链接时，选择默认打开方式。选择「每次询问」时会在点击时弹出选择框，勾选「记住选择」后会自动应用此处设置。
        </p>
        <div className="model-dir-row">
          <select
            className="model-dir-input"
            value={appConfig?.linkOpenBehavior || 'ask'}
            onChange={(e) => saveAppConfig({ linkOpenBehavior: e.target.value })}
            style={{ cursor: 'pointer' }}
          >
            <option value="ask">每次询问</option>
            <option value="internal">在应用内打开</option>
            <option value="external">用系统浏览器打开</option>
          </select>
        </div>
      </div>

      {/* 说明 */}
      <div className="settings-section settings-info">
        <h3 className="settings-section-title">说明</h3>
        <ul className="settings-info-list">
          <li>内置模型部署在本地服务器，由服务器统一调用，用户无需配置 URL / API Key；消耗积分，失败自动退还。</li>
          <li>自定义模型由客户端直接调用你配置的端点（如 Seedance 系列，自带 API Key），不消耗积分。</li>
          <li>两种模式均遵循方舟异步任务格式（POST /contents/generations/tasks）。</li>
          <li>生成的视频会自动下载到「视频保存目录」。</li>
        </ul>
      </div>

      <button
        className="btn btn-secondary video-goto-studio"
        onClick={() => setActiveView('video')}
      >
        <Film size={15} />
        <span>前往视频工作室 →</span>
      </button>
    </div>
  );
}
