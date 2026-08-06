/**
 * 管理员认证路由
 *
 *  - POST /api/admin/auth/login    管理员登录
 *  - GET  /api/admin/auth/me       当前管理员信息（需鉴权）
 *  - PUT  /api/admin/auth/password 修改密码（需鉴权）
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../db');
const config = require('../../config');
const { adminRequired } = require('../../middleware/adminAuth');

const router = express.Router();

function issueToken(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, nickname: admin.nickname, admin: true },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function sanitizeAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    createdAt: row.created_at,
  };
}

/**
 * 管理员登录
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }
  const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!row) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (!bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = issueToken(row);
  res.json({ token, admin: sanitizeAdmin(row) });
});

/**
 * 当前管理员信息
 */
router.get('/me', adminRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!row) return res.status(404).json({ error: '管理员不存在' });
  res.json(sanitizeAdmin(row));
});

/**
 * 修改密码
 */
router.put('/password', adminRequired, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请输入原密码和新密码' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码至少 6 位' });
  }
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(oldPassword, row.password_hash)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password_hash = ?, updated_at = strftime(\'%s\',\'now\') * 1000 WHERE id = ?')
    .run(hash, req.admin.id);
  res.json({ ok: true });
});

module.exports = router;
