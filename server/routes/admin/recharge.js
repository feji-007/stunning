/**
 * 充值管理路由（管理员）
 *  - GET    /api/admin/recharge/plans       套餐列表
 *  - PUT    /api/admin/recharge/plans       保存套餐列表（整体替换）
 *  - GET    /api/admin/recharge/orders      订单列表（分页 + 搜索）
 *  - GET    /api/admin/recharge/stats       充值统计
 */
const express = require('express');
const db = require('../../db');
const settings = require('../../settings');
const { adminRequired } = require('../../middleware/adminAuth');

const router = express.Router();

router.get('/plans', adminRequired, (_req, res) => {
  res.json({ plans: settings.get('rechargePlans') });
});

router.put('/plans', adminRequired, async (req, res) => {
  const { plans } = req.body || {};
  if (!Array.isArray(plans)) {
    return res.status(400).json({ error: 'plans 必须为数组' });
  }
  for (const p of plans) {
    if (!p.id || typeof p.price !== 'number' || typeof p.points !== 'number') {
      return res.status(400).json({ error: '套餐格式错误：需包含 id / price / points' });
    }
    if (p.bonus == null) p.bonus = 0;
    if (!p.label) p.label = '';
  }
  await settings.set('rechargePlans', plans);
  res.json({ plans });
});

router.get('/orders', adminRequired, async (req, res) => {
  const { keyword, status } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (keyword) {
    where.push('(o.order_no LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await db.get(
    `SELECT COUNT(*) AS c FROM recharge_orders o LEFT JOIN users u ON o.user_id = u.id ${whereClause}`,
    ...params
  );
  const rows = await db.all(
    `SELECT o.*, u.username, u.nickname FROM recharge_orders o LEFT JOIN users u ON o.user_id = u.id ${whereClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, offset
  );

  const list = rows.map((r) => ({
    id: r.id,
    orderNo: r.order_no,
    userId: r.user_id,
    username: r.username,
    nickname: r.nickname,
    planId: r.plan_id,
    price: r.price,
    points: r.points,
    bonus: r.bonus,
    status: r.status,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  }));

  res.json({ list, total: totalRow.c, page, pageSize });
});

router.get('/stats', adminRequired, async (_req, res) => {
  const paid = await db.get(`
    SELECT
      COUNT(*) AS orderCount,
      COALESCE(SUM(price), 0) AS totalAmount,
      COALESCE(SUM(points), 0) AS totalPoints
    FROM recharge_orders WHERE status = 'paid'
  `);
  // 今天 0 点的时间戳（应用层计算，数据库无关）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = await db.get(`
    SELECT COUNT(*) AS orderCount, COALESCE(SUM(price), 0) AS totalAmount
    FROM recharge_orders WHERE status = 'paid' AND paid_at >= ?
  `, todayStart.getTime());
  res.json({ total: paid, today });
});

module.exports = router;
