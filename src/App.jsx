import { useEffect } from 'react';
import { useStore } from './store/useStore';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import ModelManager from './components/ModelManager';
import VideoStudio from './components/VideoStudio';
import ApiServerPanel from './components/ApiServerPanel';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const activeView = useStore((s) => s.activeView);
  const sessions = useStore((s) => s.sessions);
  const createSession = useStore((s) => s.createSession);
  const refreshApiStatus = useStore((s) => s.refreshApiStatus);
  const loadAppConfig = useStore((s) => s.loadAppConfig);
  const loadedModel = useStore((s) => s.loadedModel);

  // 应用启动时初始化
  useEffect(() => {
    // 创建初始会话（如果没有任何会话）
    if (sessions.length === 0) {
      createSession();
    }
    // 刷新 API 服务器状态
    refreshApiStatus();
    // 加载应用配置（含方舟 API Key，供视频生成使用）
    loadAppConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderMainContent = () => {
    switch (activeView) {
      case 'chat':
        return <ChatPanel />;
      case 'models':
        return <ModelManager />;
      case 'video':
        return <VideoStudio />;
      case 'api':
        return <ApiServerPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <ChatPanel />;
    }
  };

  return (
    <div className="app">
      <Sidebar />
      <main className="main-content">
        {/* 顶部状态栏：显示已加载模型 */}
        <div className="topbar">
          <div className="topbar-model-info">
            {loadedModel ? (
              <>
                <span className="status-dot status-dot--active" />
                <span className="topbar-model-name">{loadedModel.name}</span>
                <span className="topbar-model-size">{loadedModel.sizeLabel}</span>
              </>
            ) : (
              <>
                <span className="status-dot status-dot--inactive" />
                <span className="topbar-model-name topbar-model-name--none">未加载模型</span>
              </>
            )}
          </div>
        </div>
        <div className="view-container">{renderMainContent()}</div>
      </main>
    </div>
  );
}
