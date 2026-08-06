/**
 * 认证路由：注册 / 登录
 *  - POST /api/auth/register   { username, password, nickname? }
 *  - POST /api/auth/login      { username, password }
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');

const router = express.Router();

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname || row.username,
    avatar: row.avatar || '',
    points: row.points,
    createdAt: row.created_at,
  };
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// 注册
router.post('/register', (req, res) => {
  const { username, password, nickname } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: '用户名长度需为 3-32 个字符' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度至少 6 位' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.status(409).json({ error: '该用户名已被注册' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, nickname, points)
    VALUES (?, ?, ?, ?)
  `).run(username, hash, nickname || username, config.defaultPoints);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const user = sanitizeUser(row);
  const token = issueToken(row);
  res.json({ token, user });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const user = sanitizeUser(row);
  const token = issueToken(row);
  res.json({ token, user });
});

module.exports = router;
module.exports.sanitizeUser = sanitizeUser;
