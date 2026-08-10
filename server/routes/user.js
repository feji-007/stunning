/**
 * 用户路由：资料查询/更新、头像、积分
 *  - GET    /api/user/profile
 *  - PUT    /api/user/profile        { nickname?, avatar? }
 *  - GET    /api/user/points
 *  - POST   /api/user/points         { delta }   (演示用：增减积分)
 */
const express = require('express');
const db = require('../db');
const { sanitizeUser } = require('./auth');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// 获取当前用户资料
router.get('/profile', authRequired, async (req, res) => {
  const row = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json(sanitizeUser(row));
});

// 更新资料（昵称、头像）
router.put('/profile', authRequired, async (req, res) => {
  const { nickname, avatar } = req.body || {};
  const updates = [];
  const params = [];
  if (typeof nickname === 'string' && nickname.trim()) {
    updates.push('nickname = ?');
    params.push(nickname.trim().slice(0, 32));
  }
  if (typeof avatar === 'string') {
    if (avatar.length > 1024 * 1024) {
      return res.status(400).json({ error: '头像数据过大' });
    }
    updates.push('avatar = ?');
    params.push(avatar);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }
  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(req.user.id);
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...params);
  const row = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  res.json(sanitizeUser(row));
});

// 查询积分
router.get('/points', authRequired, async (req, res) => {
  const row = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json({ points: row.points });
});

// 增减积分（演示用）
router.post('/points', authRequired, async (req, res) => {
  const delta = parseInt(req.body?.delta, 10);
  if (Number.isNaN(delta)) {
    return res.status(400).json({ error: 'delta 必须为整数' });
  }
  await db.run(
    'UPDATE users SET points = MAX(0, points + ?), updated_at = ? WHERE id = ?',
    delta, Date.now(), req.user.id
  );
  const row = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);
  res.json({ points: row.points });
});

module.exports = router;
