import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  User, Coins, LogOut, ChevronDown, Camera, Edit3, Save, X, Plus,
} from 'lucide-react';
import RechargeModal from './RechargeModal';

/**
 * 顶栏右上角用户菜单
 * 展示：头像 / 昵称 / 积分；下拉：充值、编辑资料（昵称、头像）、退出登录
 */
export default function UserMenu() {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const updateProfile = useStore((s) => s.updateProfile);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
        setEditing(false);
        setEditError('');
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // 进入编辑时同步当前值
  useEffect(() => {
    if (editing) {
      setNickname(user?.nickname || '');
      setAvatar(user?.avatar || '');
      setEditError('');
    }
  }, [editing, user]);

  const initials = (user?.nickname || user?.username || '?').slice(0, 1).toUpperCase();

  const handleSelectAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setEditError('头像不能超过 1MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setEditError('');
    try {
      await updateProfile({ nickname: nickname.trim() || user.username, avatar });
      setEditing(false);
    } catch (err) {
      setEditError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  // 打开充值弹窗（关闭下拉菜单）
  const handleOpenRecharge = () => {
    setOpen(false);
    setShowRecharge(true);
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className={`user-menu-trigger ${open ? 'user-menu-trigger--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="user-menu-avatar">
          {user?.avatar ? (
            <img src={user.avatar} alt="avatar" />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <span className="user-menu-name">{user?.nickname || user?.username}</span>
        <span
          className="user-menu-points user-menu-points--clickable"
          onClick={(e) => { e.stopPropagation(); handleOpenRecharge(); }}
          title="点击充值"
        >
          <Coins size={12} />
          {user?.points ?? 0}
          <Plus size={11} className="user-menu-points-add" />
        </span>
        <ChevronDown size={14} className={`user-menu-chevron ${open ? 'user-menu-chevron--open' : ''}`} />
      </button>

      {open && (
        <div className="user-menu-dropdown">
          {!editing ? (
            <>
              {/* 用户信息卡片 */}
              <div className="user-menu-card">
                <div className="user-menu-card-avatar">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="avatar" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="user-menu-card-info">
                  <div className="user-menu-card-name">{user?.nickname || user?.username}</div>
                  <div className="user-menu-card-username">@{user?.username}</div>
                </div>
              </div>

              <div className="user-menu-stats">
                <div className="user-menu-stat">
                  <Coins size={14} />
                  <span className="user-menu-stat-label">积分</span>
                  <span className="user-menu-stat-value">{user?.points ?? 0}</span>
                </div>
                <button className="user-menu-recharge-btn" onClick={handleOpenRecharge}>
                  <Plus size={12} />
                  <span>充值</span>
                </button>
              </div>

              <div className="user-menu-actions">
                <button className="user-menu-action" onClick={handleOpenRecharge}>
                  <Coins size={14} />
                  <span>积分充值</span>
                </button>
                <button className="user-menu-action" onClick={() => setEditing(true)}>
                  <Edit3 size={14} />
                  <span>编辑资料</span>
                </button>
                <button className="user-menu-action user-menu-action--danger" onClick={handleLogout}>
                  <LogOut size={14} />
                  <span>退出登录</span>
                </button>
              </div>
            </>
          ) : (
            <div className="user-menu-edit">
              <div className="user-menu-edit-title">
                <User size={14} />
                <span>编辑资料</span>
              </div>

              <div className="user-menu-edit-avatar">
                <div className="user-menu-card-avatar user-menu-card-avatar--lg">
                  {avatar ? (
                    <img src={avatar} alt="avatar" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <button
                  className="user-menu-avatar-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={13} />
                  更换头像
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleSelectAvatar}
                />
              </div>

              <div className="user-menu-edit-field">
                <label>昵称</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={32}
                  placeholder="输入昵称"
                />
              </div>

              {editError && <div className="user-menu-edit-error">{editError}</div>}

              <div className="user-menu-edit-actions">
                <button
                  className="user-menu-edit-btn user-menu-edit-btn--cancel"
                  onClick={() => { setEditing(false); setEditError(''); }}
                  disabled={saving}
                >
                  <X size={13} />
                  取消
                </button>
                <button
                  className="user-menu-edit-btn user-menu-edit-btn--save"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save size={13} />
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 充值弹窗 */}
      <RechargeModal open={showRecharge} onClose={() => setShowRecharge(false)} />
    </div>
  );
}
