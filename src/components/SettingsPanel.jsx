import { useState } from 'react';
import { useStore } from '../store/useStore';
import {
  Settings, Key, Film, Save, FolderOpen, Check, ExternalLink,
  Sparkles, Wand2, Coins,
} from 'lucide-react';

export default function SettingsPanel() {
  const appConfig = useStore((s) => s.appConfig);
  const user = useStore((s) => s.user);
  const saveAppConfig = useStore((s) => s.saveAppConfig);
  const selectVideoOutputDir = useStore((s) => s.selectVideoOutputDir);
  const setActiveView = useStore((s) => s.setActiveView);

  // 自定义 AI 本地输入态（避免每次按键都写盘）
  const [baseURLInput, setBaseURLInput] = useState(appConfig?.customVideo?.baseURL || '');
  const [apiKeyInput, setApiKeyInput] = useState(appConfig?.customVideo?.apiKey || '');
  const [modelIdInput, setModelIdInput] = useState(appConfig?.customVideo?.modelId || '');
  const [savedFlash, setSavedFlash] = useState(false);

  const videoDefaults = appConfig?.videoDefaults || {};
  const outputDir = videoDefaults.outputDir || '';
  const provider = appConfig?.videoProvider || 'seedance';

  const handleSaveCustom = async () => {
    await saveAppConfig({
      customVideo: {
        baseURL: baseURLInput.trim(),
        apiKey: apiKeyInput.trim(),
        modelId: modelIdInput.trim() || 'doubao-seedance-2-0-pro',
      },
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleSelectProvider = async (p) => {
    await saveAppConfig({ videoProvider: p });
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
          选择视频生成方式：内置 Seedance（消耗积分）或自定义视频生成 AI（自带 Key）。
        </p>

        <div className="video-mode-tabs" style={{ marginBottom: 16 }}>
          <button
            className={`mode-tab ${provider === 'seedance' ? 'mode-tab--active' : ''}`}
            onClick={() => handleSelectProvider('seedance')}
          >
            <Sparkles size={15} />
            <span>内置 Seedance</span>
          </button>
          <button
            className={`mode-tab ${provider === 'custom' ? 'mode-tab--active' : ''}`}
            onClick={() => handleSelectProvider('custom')}
          >
            <Wand2 size={15} />
            <span>自定义 AI</span>
          </button>
        </div>

        {/* 内置 Seedance 说明 */}
        {provider === 'seedance' && (
          <div className="settings-section">
            <div className="video-apikey-banner">
              <Coins size={16} />
              <span>
                内置 Seedance 2.0 无需配置 API Key，由服务器调用方舟 API。
                当前剩余 <strong>{user?.points ?? 0}</strong> 积分。
              </span>
            </div>
            <ul className="settings-info-list" style={{ marginTop: 12 }}>
              <li>积分规则：5 秒 720p = 10 积分，5 秒 1080p = 20 积分，10 秒翻倍。</li>
              <li>生成失败会自动退还已扣除的积分。</li>
              <li>积分由服务器统一管理，注册账号即赠送 100 积分。</li>
            </ul>
          </div>
        )}

        {/* 自定义 AI 配置 */}
        {provider === 'custom' && (
          <div className="settings-section">
            <p className="field-hint" style={{ marginBottom: 12 }}>
              填写方舟 API 兼容的视频生成端点。使用你自己的 API Key，调用不消耗积分。
            </p>

            <div className="video-apikey-row">
              <label className="field-label">Base URL</label>
              <input
                type="text"
                className="video-apikey-input"
                value={baseURLInput}
                onChange={(e) => setBaseURLInput(e.target.value)}
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
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
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
                value={modelIdInput}
                onChange={(e) => setModelIdInput(e.target.value)}
                placeholder="doubao-seedance-2-0-pro"
              />
              <p className="field-hint">火山引擎方舟的视频生成模型 ID，如 doubao-seedance-2-0-pro</p>
            </div>

            <div className="video-apikey-input-row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveCustom}
                disabled={!baseURLInput.trim() || !apiKeyInput.trim()}
              >
                {savedFlash ? <Check size={15} /> : <Save size={15} />}
                <span>{savedFlash ? '已保存' : '保存配置'}</span>
              </button>
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
              创建 API Key，并确保已开通视频生成模型。
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

      {/* 说明 */}
      <div className="settings-section settings-info">
        <h3 className="settings-section-title">说明</h3>
        <ul className="settings-info-list">
          <li>内置 Seedance 由服务器调用方舟 API，消耗积分；生成失败自动退还。</li>
          <li>自定义 AI 由客户端直接调用你配置的端点，不消耗积分。</li>
          <li>两种模式均遵循方舟 API 异步任务格式（POST /contents/generations/tasks）。</li>
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
