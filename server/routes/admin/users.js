/**
 * 用户管理路由（管理员）
 *
 *  - GET    /api/admin/users          用户列表（支持搜索/分页）
 *  - GET    /api/admin/users/:id      用户详情
 *  - PUT    /api/admin/users/:id      编辑用户（昵称/积分/禁用状态）
 *  - POST   /api/admin/users/:id/points  调整积分
 *  - DELETE /api/admin/users/:id      删除用户
 *
 * 注意：当前 users 表无 disabled 字段，编辑暂支持昵称与积分调整。
 */
const express = require('express');
const db = require('../../db');
const { adminRequired } = require('../../middleware/adminAuth');

const router = express.Router();

function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatar: row.avatar,
    points: row.points,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 用户列表（分页 + 搜索）
 * query: { keyword, page=1, pageSize=20 }
 */
router.get('/', adminRequired, (req, res) => {
  const { keyword } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  let where = '';
  const params = [];
  if (keyword) {
    where = 'WHERE username LIKE ? OR nickname LIKE ?';
    const kw = `%${keyword}%`;
    params.push(kw, kw);
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM users ${where}`).get(...params).c;
  const rows = db.prepare(`
    SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json({
    list: rows.map(serializeUser),
    total,
    page,
    pageSize,
  });
});

/**
 * 用户详情
 */
router.get('/:id', adminRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json(serializeUser(row));
});

/**
 * 编辑用户（昵称 / 积分）
 */
router.put('/:id', adminRequired, (req, res) => {
  const { nickname, points } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });

  const updates = [];
  const params = [];
  if (nickname !== undefined) { updates.push('nickname = ?'); params.push(String(nickname).slice(0, 32)); }
  if (points !== undefined) {
    const p = Math.max(0, parseInt(points, 10) || 0);
    updates.push('points = ?'); params.push(p);
  }
  if (updates.length === 0) {
    return res.json(serializeUser(row));
  }
  updates.push("updated_at = strftime('%s','now') * 1000");
  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json(serializeUser(updated));
});

/**
 * 调整积分（增量）
 * body: { delta, remark? }
 */
router.post('/:id/points', adminRequired, (req, res) => {
  const { delta } = req.body || {};
  const d = parseInt(delta, 10);
  if (isNaN(d)) {
    return res.status(400).json({ error: 'delta 必须为整数' });
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });

  const newPoints = Math.max(0, row.points + d);
  db.prepare("UPDATE users SET points = ?, updated_at = strftime('%s','now') * 1000 WHERE id = ?")
    .run(newPoints, req.params.id);
  res.json({ points: newPoints });
});

/**
 * 删除用户
 */
router.delete('/:id', adminRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
