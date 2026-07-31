import { useState } from 'react';
import { useStore } from '../store/useStore';
import {
  Settings, RotateCcw, Thermometer, Hash, Layers, Sliders,
  Key, Film, Save, FolderOpen, Check, ExternalLink,
} from 'lucide-react';

export default function SettingsPanel() {
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const resetParams = useStore((s) => s.resetParams);
  const appConfig = useStore((s) => s.appConfig);
  const saveAppConfig = useStore((s) => s.saveAppConfig);
  const selectVideoOutputDir = useStore((s) => s.selectVideoOutputDir);
  const setActiveView = useStore((s) => s.setActiveView);

  // 视频 API Key 本地输入态（避免每次按键都写盘）
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const videoDefaults = appConfig?.videoDefaults || {};
  const outputDir = videoDefaults.outputDir || '';

  // 滑块参数配置
  const sliders = [
    { key: 'temperature', label: 'Temperature', icon: Thermometer, min: 0, max: 2, step: 0.05, hint: '控制生成随机性，越高越有创造性' },
    { key: 'topP', label: 'Top P', icon: Sliders, min: 0, max: 1, step: 0.01, hint: '核采样概率阈值' },
    { key: 'topK', label: 'Top K', icon: Hash, min: 0, max: 100, step: 1, hint: '候选 token 数量上限' },
    { key: 'minP', label: 'Min P', icon: Sliders, min: 0, max: 1, step: 0.01, hint: '最小概率过滤阈值' },
    { key: 'repeatPenalty', label: 'Repeat Penalty', icon: RotateCcw, min: 1, max: 2, step: 0.01, hint: '重复惩罚系数，抑制重复输出' },
  ];

  const numInputs = [
    { key: 'maxTokens', label: 'Max Tokens', hint: '最大生成 token 数 (-1 = 不限制)', min: -1, max: 32768, step: 1 },
    { key: 'contextSize', label: 'Context Size', hint: '上下文窗口大小（加载模型时生效）', min: 512, max: 32768, step: 512 },
    { key: 'gpuLayers', label: 'GPU Layers', hint: '卸载到 GPU 的层数 (0 = 纯 CPU)', min: 0, max: 100, step: 1 },
  ];

  return (
    <div className="panel settings-panel">
      <div className="panel-header">
        <Settings size={20} />
        <h1 className="panel-title">推理设置</h1>
        <button className="btn btn-secondary settings-reset-btn" onClick={resetParams}>
          <RotateCcw size={14} />
          <span>重置默认</span>
        </button>
      </div>

      {/* 视频生成 API 配置 */}
      <div className="settings-section video-api-section">
        <h3 className="settings-section-title">
          <Film size={16} />
          视频生成 API（Seedance 2.0）
        </h3>

        <div className="video-apikey-row">
          <label className="field-label">
            <Key size={13} />
            方舟 API Key
          </label>
          <div className="video-apikey-input-row">
            <input
              type="password"
              className="video-apikey-input"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={appConfig?.arkApiKeyMasked || '输入方舟 API Key'}
            />
            <button
              className="btn btn-primary"
              onClick={async () => {
                if (!apiKeyInput.trim()) return;
                await saveAppConfig({ arkApiKey: apiKeyInput.trim() });
                setApiKeyInput('');
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 1800);
              }}
              disabled={!apiKeyInput.trim()}
            >
              {savedFlash ? <Check size={15} /> : <Save size={15} />}
              <span>{savedFlash ? '已保存' : '保存'}</span>
            </button>
          </div>
          {appConfig?.arkApiKey && (
            <p className="field-hint">
              当前已配置: <code className="inline-code">{appConfig.arkApiKeyMasked}</code>
            </p>
          )}
          <p className="field-hint">
            在
            <a
              className="settings-link"
              href="#"
              onClick={(e) => { e.preventDefault(); window.open('https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', '_blank'); }}
            >
              火山引擎方舟控制台 <ExternalLink size={11} />
            </a>
            创建 API Key，并确保已开通「Doubao-Seedance-2.0」模型。
          </p>
        </div>

        <div className="video-output-row">
          <label className="field-label">视频保存目录</label>
          <div className="model-dir-row">
            <input className="model-dir-input" value={outputDir} readOnly placeholder="默认: ~/Videos/stunning" />
            <button className="btn btn-secondary" onClick={selectVideoOutputDir}>
              <FolderOpen size={15} />
              <span>选择</span>
            </button>
          </div>
        </div>

        <button
          className="btn btn-secondary video-goto-studio"
          onClick={() => setActiveView('video')}
        >
          <Film size={15} />
          <span>前往视频工作室 →</span>
        </button>
      </div>

      {/* 系统提示词 */}
      <div className="settings-section">
        <label className="field-label">系统提示词 (System Prompt)</label>
        <textarea
          className="settings-textarea"
          value={params.systemPrompt}
          onChange={(e) => setParam('systemPrompt', e.target.value)}
          rows={4}
          placeholder="设定助手的行为和角色..."
        />
        <p className="field-hint">引导模型扮演特定角色或遵循特定规则</p>
      </div>

      {/* 滑块参数 */}
      <div className="settings-section">
        <h3 className="settings-section-title">采样参数</h3>
        <div className="settings-sliders">
          {sliders.map((slider) => {
            const Icon = slider.icon;
            return (
              <div key={slider.key} className="slider-row">
                <div className="slider-header">
                  <div className="slider-label">
                    <Icon size={15} />
                    <span>{slider.label}</span>
                  </div>
                  <span className="slider-value">{Number(params[slider.key]).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  className="slider"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={params[slider.key]}
                  onChange={(e) => setParam(slider.key, parseFloat(e.target.value))}
                />
                <p className="slider-hint">{slider.hint}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 数值输入参数 */}
      <div className="settings-section">
        <h3 className="settings-section-title">
          <Layers size={16} />
          模型参数
        </h3>
        <div className="settings-numbers">
          {numInputs.map((field) => (
            <div key={field.key} className="number-input-row">
              <div className="number-input-label">
                <label>{field.label}</label>
                <p className="field-hint">{field.hint}</p>
              </div>
              <input
                type="number"
                className="number-input"
                value={params[field.key]}
                onChange={(e) => setParam(field.key, parseInt(e.target.value) || 0)}
                min={field.min}
                max={field.max}
                step={field.step}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 参数说明 */}
      <div className="settings-section settings-info">
        <h3 className="settings-section-title">说明</h3>
        <ul className="settings-info-list">
          <li>「Context Size」与「GPU Layers」仅在加载模型时生效，修改后需重新加载模型。</li>
          <li>采样参数（Temperature、Top P 等）在每次发送消息时实时生效。</li>
          <li>Max Tokens 设为 -1 表示不限制生成长度，模型会自动判断何时停止。</li>
          <li>所有推理均在本地完成，数据不会离开你的设备。</li>
        </ul>
      </div>
    </div>
  );
}
