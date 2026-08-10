/**
 * 充值路由（模拟支付）
 *
 *  - GET  /api/recharge/plans          获取充值套餐列表
 *  - POST /api/recharge/orders         创建充值订单（status=pending）
 *  - POST /api/recharge/orders/:id/pay 模拟支付完成（增加积分，status=paid）
 *  - GET  /api/recharge/history        当前用户充值历史
 *
 * 模拟支付：调用 pay 接口即视为支付成功，立即增加积分。
 * 生产环境接入真实支付时，pay 接口替换为支付回调即可。
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const settings = require('../settings');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function genOrderNo() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `RC${ts}${rand}`.toUpperCase();
}

function serializeOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderNo: row.order_no,
    planId: row.plan_id,
    price: row.price,
    points: row.points,
    bonus: row.bonus,
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

router.get('/plans', (_req, res) => {
  res.json({ plans: settings.get('rechargePlans') });
});

router.post('/orders', authRequired, async (req, res) => {
  const { planId } = req.body || {};
  if (!planId) {
    return res.status(400).json({ error: '请选择充值套餐' });
  }
  const plan = settings.get('rechargePlans').find((p) => p.id === planId);
  if (!plan) {
    return res.status(400).json({ error: '套餐不存在' });
  }

  const orderNo = genOrderNo();
  const info = await db.run(
    'INSERT INTO recharge_orders (order_no, user_id, plan_id, price, points, bonus, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    orderNo, req.user.id, plan.id, plan.price, plan.points, plan.bonus, 'pending'
  );

  const row = await db.get('SELECT * FROM recharge_orders WHERE id = ?', info.lastInsertRowid);
  res.status(201).json(serializeOrder(row));
});

router.post('/orders/:id/pay', authRequired, async (req, res) => {
  const row = await db.get('SELECT * FROM recharge_orders WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: '订单不存在' });
  }
  if (row.status === 'paid') {
    return res.status(400).json({ error: '订单已支付', order: serializeOrder(row) });
  }
  if (row.status === 'cancelled') {
    return res.status(400).json({ error: '订单已取消' });
  }

  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.run(
      'UPDATE recharge_orders SET status = ?, paid_at = ?, updated_at = ? WHERE id = ?',
      'paid', now, now, row.id
    );
    await tx.run(
      'UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?',
      row.points, now, req.user.id
    );
  });

  const updated = await db.get('SELECT * FROM recharge_orders WHERE id = ?', row.id);
  const pointsRow = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);

  res.json({
    order: serializeOrder(updated),
    pointsRemaining: pointsRow.points,
    addedPoints: row.points,
  });
});

router.get('/history', authRequired, async (req, res) => {
  const rows = await db.all(
    'SELECT * FROM recharge_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    req.user.id
  );
  res.json(rows.map(serializeOrder));
});

module.exports = router;
