/**
 * 视频任务管理路由（管理员）
 *  - GET   /api/admin/video/tasks       任务列表（分页 + 搜索 + 状态筛选）
 *  - GET   /api/admin/video/stats       任务统计
 *  - GET   /api/admin/video/users/:id/tasks  指定用户的任务
 */
const express = require('express');
const db = require('../../db');
const { adminRequired } = require('../../middleware/adminAuth');

const router = express.Router();

function serializeTask(r) {
  if (!r) return null;
  let params = {};
  try { params = r.params ? JSON.parse(r.params) : {}; } catch {}
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    nickname: r.nickname,
    arkTaskId: r.ark_task_id,
    provider: r.provider,
    model: r.model,
    prompt: r.prompt,
    params,
    status: r.status,
    videoUrl: r.video_url,
    pointsCost: r.points_cost,
    refunded: !!r.refunded,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

router.get('/tasks', adminRequired, async (req, res) => {
  const { keyword, status } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (status) { where.push('t.status = ?'); params.push(status); }
  if (keyword) {
    where.push('(t.prompt LIKE ? OR u.username LIKE ? OR u.nickname LIKE ? OR t.ark_task_id LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await db.get(
    `SELECT COUNT(*) AS c FROM video_tasks t LEFT JOIN users u ON t.user_id = u.id ${whereClause}`,
    ...params
  );
  const rows = await db.all(
    `SELECT t.*, u.username, u.nickname FROM video_tasks t LEFT JOIN users u ON t.user_id = u.id ${whereClause} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, offset
  );

  res.json({ list: rows.map(serializeTask), total: totalRow.c, page, pageSize });
});

router.get('/stats', adminRequired, async (_req, res) => {
  const byStatus = await db.all(
    'SELECT status, COUNT(*) AS count, COALESCE(SUM(points_cost), 0) AS points FROM video_tasks GROUP BY status'
  );
  // 今天 0 点的时间戳（应用层计算，数据库无关）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayRow = await db.get(
    'SELECT COUNT(*) AS count FROM video_tasks WHERE created_at >= ?',
    todayStart.getTime()
  );
  const stats = { byStatus: {}, total: 0, todayCount: todayRow.count, totalPointsCost: 0 };
  for (const r of byStatus) {
    stats.byStatus[r.status] = { count: r.count, points: r.points };
    stats.total += r.count;
    stats.totalPointsCost += r.points;
  }
  res.json(stats);
});

router.get('/users/:id/tasks', adminRequired, async (req, res) => {
  const rows = await db.all(
    `SELECT t.*, u.username, u.nickname FROM video_tasks t LEFT JOIN users u ON t.user_id = u.id WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 100`,
    req.params.id
  );
  res.json(rows.map(serializeTask));
});

module.exports = router;
