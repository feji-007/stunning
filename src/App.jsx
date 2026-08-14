import { useEffect, useRef, useState } from 'react';
import { useStore } from './store/useStore';
import Sidebar from './components/Sidebar';
import VideoStudio from './components/VideoStudio';
import SettingsPanel from './components/SettingsPanel';
import FeedbackPanel from './components/FeedbackPanel';
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

  // 侧边栏宽度（可拖拽调整，默认 260px，夹取 180 ~ 360px）
  const SIDEBAR_STORAGE_KEY = 'app.sidebarWidth';
  const MIN_SIDEBAR = 180;
  const MAX_SIDEBAR = 360;
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = parseFloat(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    return Number.isFinite(saved) && saved >= MIN_SIDEBAR && saved <= MAX_SIDEBAR
      ? saved
      : 260;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  const sidebarDragRef = useRef(null); // { startX, startWidth }

  // 挂载时绑定 mousemove / mouseup（全局拖拽响应）
  useEffect(() => {
    const onMouseMove = (e) => {
      const drag = sidebarDragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      let w = drag.startWidth + delta;
      w = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, w));
      sidebarWidthRef.current = w;
      setSidebarWidth(w);
    };
    const onMouseUp = () => {
      if (!sidebarDragRef.current) return;
      sidebarDragRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidthRef.current));
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  const handleSidebarResizerMouseDown = (e) => {
    e.preventDefault();
    sidebarDragRef.current = {
      startX: e.clientX,
      startWidth: sidebarWidthRef.current,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

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
      case 'feedback':
        return <FeedbackPanel />;
      default:
        return <VideoStudio />;
    }
  };

  // 顶栏左侧：当前视频生成提供商
  const provider = appConfig?.videoProvider || 'seedance';
  const providerLabel = provider === 'custom' ? '自定义模型' : '内置模型';

  return (
    <div className="app">
      <Sidebar style={{ width: `${sidebarWidth}px` }} />
      {/* 侧边栏与主面板之间的拖拽分割条 */}
      <div
        className="sidebar-resizer"
        onMouseDown={handleSidebarResizerMouseDown}
        title="拖动调整侧边栏宽度"
      >
        <div className="sidebar-resizer-handle" />
      </div>
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
