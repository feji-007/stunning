import { useStore } from '../store/useStore';
import { Settings, Box, Film, MessageSquare } from 'lucide-react';

export default function Sidebar({ style }) {
  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);

  const navItems = [
    { id: 'video', label: '视频生成', icon: Film },
    { id: 'settings', label: '设置', icon: Settings },
    { id: 'feedback', label: '意见反馈', icon: MessageSquare },
  ];

  return (
    <aside className="sidebar" style={style}>
      {/* Logo / 品牌 */}
      <div className="sidebar-brand">
        <Box size={22} className="sidebar-brand-icon" />
        <span className="sidebar-brand-text">绝色</span>
      </div>

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
    </aside>
  );
}
