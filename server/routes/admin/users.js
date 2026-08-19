/**
 * 用户管理路由（管理员）
 *  - GET    /api/admin/users          用户列表（搜索/分页）
 *  - GET    /api/admin/users/:id      用户详情
 *  - PUT    /api/admin/users/:id      编辑用户（昵称/积分）
 *  - POST   /api/admin/users/:id/points  调整积分
 *  - DELETE /api/admin/users/:id      删除用户
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

router.get('/', adminRequired, async (req, res) => {
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

  const totalRow = await db.get(`SELECT COUNT(*) AS c FROM users ${where}`, ...params);
  // Some MySQL servers/clients have issues binding LIMIT/OFFSET with prepared
  // statements. `pageSize` and `offset` are validated integers, so safely
  // interpolate them directly into the SQL string.
  const rows = await db.all(
    `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    ...params
  );

  res.json({
    list: rows.map(serializeUser),
    total: totalRow.c,
    page,
    pageSize,
  });
});

router.get('/:id', adminRequired, async (req, res) => {
  const row = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json(serializeUser(row));
});

router.put('/:id', adminRequired, async (req, res) => {
  const { nickname, points } = req.body || {};
  const row = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
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
  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(req.params.id);
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...params);

  const updated = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  res.json(serializeUser(updated));
});

router.post('/:id/points', adminRequired, async (req, res) => {
  const { delta } = req.body || {};
  const d = parseInt(delta, 10);
  if (isNaN(d)) {
    return res.status(400).json({ error: 'delta 必须为整数' });
  }
  const row = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });

  const newPoints = Math.max(0, row.points + d);
  await db.run('UPDATE users SET points = ?, updated_at = ? WHERE id = ?', newPoints, Date.now(), req.params.id);
  res.json({ points: newPoints });
});

router.delete('/:id', adminRequired, async (req, res) => {
  const row = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  await db.run('DELETE FROM users WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
