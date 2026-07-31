import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Server, Play, Square, Copy, Check, Link, Terminal } from 'lucide-react';

export default function ApiServerPanel() {
  const apiServer = useStore((s) => s.apiServer);
  const isApiStarting = useStore((s) => s.isApiStarting);
  const startApiServer = useStore((s) => s.startApiServer);
  const stopApiServer = useStore((s) => s.stopApiServer);
  const loadedModel = useStore((s) => s.loadedModel);

  const [port, setPort] = useState(1234);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const baseUrl = apiServer.baseUrl || `http://localhost:${port}/v1`;

  const handleStart = async () => {
    setError(null);
    try {
      await startApiServer(port);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStop = async () => {
    setError(null);
    await stopApiServer();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer stunning" \\
  -d '{
    "model": "local",
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "temperature": 0.7
  }'`;

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="stunning"
)

response = client.chat.completions.create(
    model="local",
    messages=[{"role": "user", "content": "你好"}],
    temperature=0.7
)
print(response.choices[0].message.content)`;

  return (
    <div className="panel api-server-panel">
      <div className="panel-header">
        <Server size={20} />
        <h1 className="panel-title">本地 API 服务器</h1>
      </div>

      <p className="panel-desc">
        启动一个与 OpenAI API 兼容的本地 HTTP 服务器，允许其他应用（如 Cursor、Continue、代码脚本等）
        通过标准 OpenAI SDK 调用你本地加载的模型。
      </p>

      {/* 服务器控制 */}
      <div className="api-control-card">
        <div className="api-control-status">
          <span className={`api-status-dot ${apiServer.running ? 'api-status-dot--on' : 'api-status-dot--off'}`} />
          <span className="api-status-text">
            {apiServer.running ? `运行中 · 端口 ${apiServer.port}` : '已停止'}
          </span>
        </div>
        <div className="api-control-actions">
          <div className="port-input-group">
            <label>端口</label>
            <input
              type="number"
              className="port-input"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 1234)}
              min={1}
              max={65535}
              disabled={apiServer.running}
            />
          </div>
          {apiServer.running ? (
            <button className="btn btn-danger" onClick={handleStop} disabled={isApiStarting}>
              <Square size={15} />
              <span>停止服务</span>
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleStart} disabled={isApiStarting}>
              <Play size={15} />
              <span>启动服务</span>
            </button>
          )}
        </div>
      </div>

      {/* Base URL */}
      <div className="api-endpoint-card">
        <label className="field-label">Base URL</label>
        <div className="api-endpoint-row">
          <Link size={15} className="api-endpoint-icon" />
          <input className="api-endpoint-input" value={baseUrl} readOnly />
          <button className="btn btn-secondary" onClick={handleCopy}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
        {!loadedModel && (
          <p className="field-hint field-hint--warn">
            ⚠️ 尚未加载模型，请先在「模型」面板加载后再启动 API 调用。
          </p>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* 接口文档 */}
      <div className="api-docs">
        <h3 className="api-docs-title">
          <Terminal size={16} />
          支持的接口
        </h3>
        <div className="api-endpoint-list">
          <div className="api-endpoint-item">
            <span className="method method--get">GET</span>
            <code>/v1/models</code>
            <span className="api-endpoint-desc">列出已加载模型</span>
          </div>
          <div className="api-endpoint-item">
            <span className="method method--post">POST</span>
            <code>/v1/chat/completions</code>
            <span className="api-endpoint-desc">聊天补全（支持 stream）</span>
          </div>
          <div className="api-endpoint-item">
            <span className="method method--post">POST</span>
            <code>/v1/completions</code>
            <span className="api-endpoint-desc">文本补全</span>
          </div>
          <div className="api-endpoint-item">
            <span className="method method--get">GET</span>
            <code>/v1/health</code>
            <span className="api-endpoint-desc">健康检查</span>
          </div>
        </div>
      </div>

      {/* 调用示例 */}
      <div className="api-examples">
        <h3 className="api-docs-title">
          <Terminal size={16} />
          调用示例
        </h3>
        <div className="example-tabs">
          <div className="example-block">
            <div className="example-block-label">cURL</div>
            <pre className="example-code"><code>{curlExample}</code></pre>
          </div>
          <div className="example-block">
            <div className="example-block-label">Python (OpenAI SDK)</div>
            <pre className="example-code"><code>{pythonExample}</code></pre>
          </div>
        </div>
      </div>
    </div>
  );
}
