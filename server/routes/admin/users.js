/**
 * 用户管理路由（管理员）
 *  - GET    /api/admin/users          用户列表（搜索/分页）
 *  - GET    /api/admin/users/:id      用户详情
 *  - PUT    /api/admin/users/:id      编辑用户（昵称/积分）
 *  - POST   /api/admin/users/:id/points  调整积分
 *  - DELETE /api/admin/users/:id      删除用户
 *  - DELETE /api/admin/users          批量删除用户（body: { ids: number[] }）
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

// 批量删除用户（body: { ids: number[] }）
//   - ids 数组去重并校验为正整数
//   - 使用事务确保原子性；关联表（video_tasks / feedback 等）通过外键 ON DELETE CASCADE 自动清理
router.delete('/', adminRequired, async (req, res) => {
  const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = Array.from(new Set(raw.map((v) => parseInt(v, 10)).filter((v) => Number.isInteger(v) && v > 0)));
  if (ids.length === 0) {
    return res.status(400).json({ error: 'ids 不能为空' });
  }
  if (ids.length > 500) {
    return res.status(400).json({ error: '单次最多删除 500 条' });
  }
  try {
    await db.transaction(async (tx) => {
      const placeholders = ids.map(() => '?').join(', ');
      await tx.run(`DELETE FROM users WHERE id IN (${placeholders})`, ...ids);
    });
    res.json({ ok: true, deleted: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message || '批量删除失败' });
  }
});

module.exports = router;
