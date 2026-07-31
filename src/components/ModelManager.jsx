import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { bridge } from '../ipc/bridge';
import { FolderOpen, Cpu, Loader2, CheckCircle2, HardDrive, Power, RefreshCw } from 'lucide-react';

export default function ModelManager() {
  const models = useStore((s) => s.models);
  const loadedModel = useStore((s) => s.loadedModel);
  const modelDir = useStore((s) => s.modelDir);
  const isLoadingModel = useStore((s) => s.isLoadingModel);
  const scanModels = useStore((s) => s.scanModels);
  const loadModel = useStore((s) => s.loadModel);
  const unloadModel = useStore((s) => s.unloadModel);
  const selectModelDirectory = useStore((s) => s.selectModelDirectory);
  const setModelDir = useStore((s) => s.setModelDir);

  const [loadingPath, setLoadingPath] = useState(null);
  const [error, setError] = useState(null);

  // 初始化：加载默认目录
  useEffect(() => {
    (async () => {
      if (!modelDir) {
        const dir = await bridge.getDefaultModelDir();
        setModelDir(dir);
      }
      await scanModels(modelDir || undefined);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoad = async (modelPath) => {
    setError(null);
    setLoadingPath(modelPath);
    try {
      await loadModel(modelPath);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPath(null);
    }
  };

  const handleUnload = async () => {
    setError(null);
    try {
      await unloadModel();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRefresh = async () => {
    await scanModels(modelDir);
  };

  const handleSelectDir = async () => {
    setError(null);
    try {
      await selectModelDirectory();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="panel model-manager">
      <div className="panel-header">
        <Cpu size={20} />
        <h1 className="panel-title">模型管理</h1>
      </div>

      {/* 模型目录 */}
      <div className="model-dir-section">
        <label className="field-label">模型目录</label>
        <div className="model-dir-row">
          <input className="model-dir-input" value={modelDir} readOnly placeholder="未选择目录" />
          <button className="btn btn-secondary" onClick={handleSelectDir}>
            <FolderOpen size={15} />
            <span>选择</span>
          </button>
          <button className="btn btn-secondary" onClick={handleRefresh} title="刷新">
            <RefreshCw size={15} />
          </button>
        </div>
        <p className="field-hint">
          将 .gguf 模型文件放入该目录，点击刷新即可在下方列表中看到。
        </p>
      </div>

      {/* 已加载模型信息 */}
      {loadedModel && (
        <div className="loaded-model-card">
          <div className="loaded-model-header">
            <CheckCircle2 size={18} className="loaded-model-icon" />
            <span className="loaded-model-label">当前已加载</span>
          </div>
          <div className="loaded-model-details">
            <div className="detail-row"><span>名称</span><strong>{loadedModel.name}</strong></div>
            <div className="detail-row"><span>大小</span><strong>{loadedModel.sizeLabel}</strong></div>
            <div className="detail-row"><span>上下文长度</span><strong>{loadedModel.contextSize}</strong></div>
            <div className="detail-row"><span>GPU 层</span><strong>{loadedModel.gpuLayers}</strong></div>
            <div className="detail-row"><span>加载时间</span><strong>{new Date(loadedModel.loadedAt).toLocaleString('zh-CN')}</strong></div>
          </div>
          <button className="btn btn-danger" onClick={handleUnload}>
            <Power size={15} />
            <span>卸载模型</span>
          </button>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {/* 模型列表 */}
      <div className="model-list-section">
        <div className="model-list-header">
          <HardDrive size={16} />
          <span>可用模型 ({models.length})</span>
        </div>
        {models.length === 0 ? (
          <div className="model-list-empty">
            <HardDrive size={40} className="model-list-empty-icon" />
            <p>该目录下暂无 .gguf 模型文件</p>
            <p className="model-list-empty-hint">
              你可以从 Hugging Face 下载 GGUF 量化模型（如 Llama、Qwen、Phi 等）放入目录
            </p>
          </div>
        ) : (
          <div className="model-list">
            {models.map((model) => {
              const isLoaded = loadedModel?.path === model.path;
              const isLoading = loadingPath === model.path;
              return (
                <div key={model.path} className={`model-card ${isLoaded ? 'model-card--loaded' : ''}`}>
                  <div className="model-card-info">
                    <div className="model-card-name">
                      <Cpu size={15} />
                      <span>{model.name}</span>
                      {isLoaded && <span className="badge badge--success">已加载</span>}
                    </div>
                    <div className="model-card-meta">
                      <span>{model.sizeLabel}</span>
                      <span className="model-card-path" title={model.path}>{model.path}</span>
                    </div>
                  </div>
                  <div className="model-card-actions">
                    {isLoading ? (
                      <button className="btn btn-primary" disabled>
                        <Loader2 size={15} className="spin" />
                        <span>加载中</span>
                      </button>
                    ) : isLoaded ? (
                      <button className="btn btn-secondary" onClick={handleUnload}>
                        <Power size={15} />
                        <span>卸载</span>
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleLoad(model.path)}
                        disabled={isLoadingModel}
                      >
                        <Power size={15} />
                        <span>加载</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
