import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, message, Spin } from 'antd';
import {
  DashboardOutlined, UserOutlined, GiftOutlined, SettingOutlined,
  VideoCameraOutlined, LogoutOutlined, DownOutlined, LockOutlined,
} from '@ant-design/icons';
import { authApi, getToken, setToken } from './api';
import LoginPage from './pages/Login.jsx';
import DashboardPage from './pages/Dashboard.jsx';
import UsersPage from './pages/Users.jsx';
import RechargePage from './pages/Recharge.jsx';
import OrdersPage from './pages/Orders.jsx';
import VideoTasksPage from './pages/VideoTasks.jsx';
import SettingsPage from './pages/Settings.jsx';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <UserOutlined />, label: '用户管理' },
  { key: '/recharge', icon: <GiftOutlined />, label: '充值套餐' },
  { key: '/orders', icon: <GiftOutlined />, label: '订单记录' },
  { key: '/video-tasks', icon: <VideoCameraOutlined />, label: '视频任务' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统配置' },
];

/** 鉴权守卫：无 token 跳登录 */
function ProtectedRoute({ children, admin, onLogout }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

/** 主布局 */
function AdminLayout({ children }) {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAdmin = useCallback(async () => {
    try {
      const data = await authApi.me();
      setAdmin(data);
    } catch {
      setToken('');
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { loadAdmin(); }, [loadAdmin]);

  const handleLogout = () => {
    setToken('');
    navigate('/login', { replace: true });
  };

  const handleEditPassword = () => {
    let oldPwd, newPwd;
    import('antd').then(({ Modal, Input }) => {
      Modal.confirm({
        title: '修改密码',
        content: (
          <div>
            <Input.Password placeholder="原密码" onChange={(e) => { oldPwd = e.target.value; }} style={{ marginBottom: 8 }} />
            <Input.Password placeholder="新密码（至少 6 位）" onChange={(e) => { newPwd = e.target.value; }} />
          </div>
        ),
        onOk: async () => {
          if (!oldPwd || !newPwd) { message.error('请填写完整'); return false; }
          if (newPwd.length < 6) { message.error('新密码至少 6 位'); return false; }
          try {
            await authApi.changePassword(oldPwd, newPwd);
            message.success('密码已修改');
          } catch (err) {
            message.error(err.message);
            return false;
          }
        },
      });
    });
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>;
  }

  const userMenu = {
    items: [
      { key: 'pwd', icon: <LockOutlined />, label: '修改密码', onClick: handleEditPassword },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700 }}>
          绝色 · 后台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={[window.location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Dropdown menu={userMenu}>
            <Button type="text">
              <UserOutlined /> {admin?.nickname || admin?.username || '管理员'} <DownOutlined />
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8, minHeight: 280 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><AdminLayout><DashboardPage /></AdminLayout></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><AdminLayout><UsersPage /></AdminLayout></ProtectedRoute>} />
        <Route path="/recharge" element={<ProtectedRoute><AdminLayout><RechargePage /></AdminLayout></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><AdminLayout><OrdersPage /></AdminLayout></ProtectedRoute>} />
        <Route path="/video-tasks" element={<ProtectedRoute><AdminLayout><VideoTasksPage /></AdminLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><AdminLayout><SettingsPage /></AdminLayout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
