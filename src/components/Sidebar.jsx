import { useStore } from '../store/useStore';
import { MessageSquare, Cpu, Server, Settings, Plus, Trash2, Box, Film } from 'lucide-react';

export default function Sidebar() {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const activeView = useStore((s) => s.activeView);
  const createSession = useStore((s) => s.createSession);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const setActiveView = useStore((s) => s.setActiveView);

  const navItems = [
    { id: 'chat', label: '聊天', icon: MessageSquare },
    { id: 'models', label: '模型', icon: Cpu },
    { id: 'video', label: '视频生成', icon: Film },
    { id: 'api', label: 'API 服务', icon: Server },
    { id: 'settings', label: '设置', icon: Settings },
  ];

  return (
    <aside className="sidebar">
      {/* Logo / 品牌 */}
      <div className="sidebar-brand">
        <Box size={22} className="sidebar-brand-icon" />
        <span className="sidebar-brand-text">绝色</span>
      </div>

      {/* 新建会话按钮 */}
      <button className="btn-new-chat" onClick={() => { createSession(); setActiveView('chat'); }}>
        <Plus size={16} />
        <span>新建对话</span>
      </button>

      {/* 导航 */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'nav-item--active' : ''}`}
              onClick={() => setActiveView(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 会话列表（仅聊天视图下高亮显示） */}
      <div className="sidebar-sessions">
        <div className="sidebar-sessions-header">
          <span>历史会话</span>
        </div>
        <div className="sidebar-sessions-list">
          {sessions.length === 0 && (
            <p className="sidebar-sessions-empty">暂无会话</p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${activeSessionId === session.id && activeView === 'chat' ? 'session-item--active' : ''}`}
              onClick={() => { setActiveSession(session.id); setActiveView('chat'); }}
            >
              <MessageSquare size={14} className="session-item-icon" />
              <span className="session-item-title">{session.title}</span>
              <button
                className="session-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(session.id);
                }}
                title="删除会话"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
