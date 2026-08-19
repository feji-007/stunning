/**
 * 意见反馈管理路由（管理员）
 *  - GET    /api/admin/feedback               反馈列表（搜索/筛选/分页）
 *  - GET    /api/admin/feedback/unread-count   未读反馈数量
 *  - PUT    /api/admin/feedback/:id/read       标记为已读 / 未读（body: { isRead }）
 *  - DELETE /api/admin/feedback/:id            删除反馈
 *  - DELETE /api/admin/feedback                批量删除反馈（body: { ids: number[] }）
 */
const express = require('express');
const db = require('../../db');
const { adminRequired } = require('../../middleware/adminAuth');

const router = express.Router();

// 分类映射：DB 存英文 key，前端展示中文 label
const CATEGORY_LABEL = {
  bug: '缺陷报告',
  feature: '功能建议',
  experience: '体验问题',
  other: '其他',
};

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    nickname: row.nickname,
    category: row.category,
    categoryLabel: CATEGORY_LABEL[row.category] || row.category,
    content: row.content,
    contact: row.contact,
    isRead: !!row.is_read,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 反馈列表
router.get('/', adminRequired, async (req, res) => {
  const { keyword, status, category } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (status === 'unread') { where.push('f.is_read = 0'); }
  else if (status === 'read') { where.push('f.is_read = 1'); }
  if (category) { where.push('f.category = ?'); params.push(category); }
  if (keyword) {
    where.push('(f.content LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await db.get(
    `SELECT COUNT(*) AS c FROM feedback f LEFT JOIN users u ON f.user_id = u.id ${whereClause}`,
    ...params
  );
  const rows = await db.all(
    `SELECT f.*, u.username, u.nickname FROM feedback f
       LEFT JOIN users u ON f.user_id = u.id
       ${whereClause}
       ORDER BY f.is_read ASC, f.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
    ...params
  );

  res.json({
    list: rows.map(serialize),
    total: totalRow.c,
    page,
    pageSize,
  });
});

// 未读反馈数量
router.get('/unread-count', adminRequired, async (_req, res) => {
  const row = await db.get('SELECT COUNT(*) AS c FROM feedback WHERE is_read = 0');
  res.json({ count: row.c });
});

// 标记已读 / 未读
router.put('/:id/read', adminRequired, async (req, res) => {
  const isRead = req.body?.isRead ? 1 : 0;
  const row = await db.get('SELECT * FROM feedback WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '反馈不存在' });
  await db.run(
    'UPDATE feedback SET is_read = ?, updated_at = ? WHERE id = ?',
    isRead, Date.now(), req.params.id
  );
  const updated = await db.get('SELECT * FROM feedback WHERE id = ?', req.params.id);
  res.json({ ok: true, isRead: !!isRead });
});

// 删除反馈
router.delete('/:id', adminRequired, async (req, res) => {
  const row = await db.get('SELECT * FROM feedback WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '反馈不存在' });
  await db.run('DELETE FROM feedback WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

// 批量删除反馈（body: { ids: number[] }）
//   - ids 数组去重并校验为正整数
//   - 使用事务确保原子性
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
      await tx.run(`DELETE FROM feedback WHERE id IN (${placeholders})`, ...ids);
    });
    res.json({ ok: true, deleted: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message || '批量删除失败' });
  }
});

module.exports = router;
