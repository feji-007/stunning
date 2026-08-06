import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Box, LogIn, UserPlus, Server, Loader2, CheckCircle2, AlertCircle, Wifi } from 'lucide-react';

/**
 * 登录 / 注册界面
 * 用户只感知账号密码；数据库连接信息全部留在服务器端（类似 QQ/微信登录）。
 */
export default function Login() {
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);
  const isAuthLoading = useStore((s) => s.isAuthLoading);
  const serverUrl = useStore((s) => s.serverUrl);
  const setServerUrl = useStore((s) => s.setServerUrl);
  const checkServer = useStore((s) => s.checkServer);
  const serverReachable = useStore((s) => s.serverReachable);

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [showServerCfg, setShowServerCfg] = useState(false);
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, nickname.trim() || username.trim());
      }
    } catch (err) {
      setError(err.message || '操作失败');
    }
  };

  const handleCheckServer = async () => {
    setChecking(true);
    const url = urlInput.trim();
    if (url && url !== serverUrl) {
      await setServerUrl(url);
    }
    await checkServer();
    setChecking(false);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <Box size={40} className="login-brand-icon" />
          <h1 className="login-title">绝色 · Stunning</h1>
          <p className="login-subtitle">登录后即可使用 AI Agent 与全部功能</p>
        </div>

        {/* 模式切换 */}
        <div className="login-tabs">
          <button
            className={`login-tab ${mode === 'login' ? 'login-tab--active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            <LogIn size={15} />
            <span>登录</span>
          </button>
          <button
            className={`login-tab ${mode === 'register' ? 'login-tab--active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            <UserPlus size={15} />
            <span>注册</span>
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-32 个字符"
              autoComplete="username"
              autoFocus
            />
          </div>

          {mode === 'register' && (
            <div className="login-field">
              <label>昵称（可选）</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="留空则用用户名"
              />
            </div>
          )}

          <div className="login-field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div className="login-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-submit" disabled={isAuthLoading}>
            {isAuthLoading ? <Loader2 size={16} className="spin" /> : (mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />)}
            <span>{mode === 'login' ? '登录' : '注册并登录'}</span>
          </button>
        </form>

        {/* 服务器连接状态 */}
        <div className="login-server">
          <button className="login-server-toggle" onClick={() => setShowServerCfg((v) => !v)}>
            <Server size={13} />
            <span>服务器</span>
            {serverReachable === true && <span className="login-server-ok"><CheckCircle2 size={12} /> 已连接</span>}
            {serverReachable === false && <span className="login-server-fail"><AlertCircle size={12} /> 未连接</span>}
          </button>
          {showServerCfg && (
            <div className="login-server-cfg">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="http://localhost:3001"
              />
              <button onClick={handleCheckServer} disabled={checking}>
                {checking ? <Loader2 size={13} className="spin" /> : <Wifi size={13} />}
                测试
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
