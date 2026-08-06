import { useEffect } from 'react';
import { useStore } from './store/useStore';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import ModelManager from './components/ModelManager';
import VideoStudio from './components/VideoStudio';
import ApiServerPanel from './components/ApiServerPanel';
import SettingsPanel from './components/SettingsPanel';
import AgentPanel from './components/AgentPanel';
import UserMenu from './components/UserMenu';
import Login from './components/Login';

export default function App() {
  const activeView = useStore((s) => s.activeView);
  const sessions = useStore((s) => s.sessions);
  const createSession = useStore((s) => s.createSession);
  const refreshApiStatus = useStore((s) => s.refreshApiStatus);
  const loadAppConfig = useStore((s) => s.loadAppConfig);
  const loadedModel = useStore((s) => s.loadedModel);

  // 认证相关
  const authInitialized = useStore((s) => s.authInitialized);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const initAuth = useStore((s) => s.initAuth);
  const checkServer = useStore((s) => s.checkServer);
  const loadAgents = useStore((s) => s.loadAgents);

  // 应用启动：恢复登录态 + 检测服务器
  useEffect(() => {
    initAuth();
    checkServer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 已登录后才初始化主界面
  useEffect(() => {
    if (!isAuthenticated) return;
    if (sessions.length === 0) createSession();
    refreshApiStatus();
    loadAppConfig();
    loadAgents();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // 未初始化完成时显示加载
  if (!authInitialized) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  // 未登录显示登录界面
  if (!isAuthenticated) {
    return <Login />;
  }

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
      case 'agents':
        return <AgentPanel />;
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
        {/* 顶部状态栏：左侧模型信息，右侧用户菜单 */}
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
          <div className="topbar-right">
            <UserMenu />
          </div>
        </div>
        <div className="view-container">{renderMainContent()}</div>
      </main>
    </div>
  );
}
