import { useEffect } from 'react';
import { useStore } from './store/useStore';
import Sidebar from './components/Sidebar';
import VideoStudio from './components/VideoStudio';
import SettingsPanel from './components/SettingsPanel';
import UserMenu from './components/UserMenu';
import Login from './components/Login';

export default function App() {
  const activeView = useStore((s) => s.activeView);
  const loadAppConfig = useStore((s) => s.loadAppConfig);
  const appConfig = useStore((s) => s.appConfig);

  // 认证相关
  const authInitialized = useStore((s) => s.authInitialized);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const initAuth = useStore((s) => s.initAuth);
  const checkServer = useStore((s) => s.checkServer);

  // 应用启动：恢复登录态 + 检测服务器
  useEffect(() => {
    initAuth();
    checkServer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 已登录后才初始化主界面
  useEffect(() => {
    if (!isAuthenticated) return;
    loadAppConfig();
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
      case 'video':
        return <VideoStudio />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <VideoStudio />;
    }
  };

  // 顶栏左侧：当前视频生成提供商
  const provider = appConfig?.videoProvider || 'seedance';
  const providerLabel = provider === 'custom' ? '自定义 AI' : '内置 Seedance';

  return (
    <div className="app">
      <Sidebar />
      <main className="main-content">
        {/* 顶部状态栏：左侧提供商信息，右侧用户菜单 */}
        <div className="topbar">
          <div className="topbar-model-info">
            <span className={`status-dot ${provider === 'custom' ? 'status-dot--active' : 'status-dot--active'}`} />
            <span className="topbar-model-name">{providerLabel}</span>
            {provider === 'custom' && appConfig?.customVideo?.modelId && (
              <span className="topbar-model-size">{appConfig.customVideo.modelId}</span>
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
