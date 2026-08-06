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

/**
 * 生成业务订单号: RC + 时间戳 + 随机串
 */
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
    status: row.status,           // pending | paid | cancelled
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

/**
 * 获取套餐列表
 */
router.get('/plans', (_req, res) => {
  res.json({ plans: settings.get('rechargePlans') });
});

/**
 * 创建充值订单
 * body: { planId }
 */
router.post('/orders', authRequired, (req, res) => {
  const { planId } = req.body || {};
  if (!planId) {
    return res.status(400).json({ error: '请选择充值套餐' });
  }
  const plan = settings.get('rechargePlans').find((p) => p.id === planId);
  if (!plan) {
    return res.status(400).json({ error: '套餐不存在' });
  }

  const orderNo = genOrderNo();
  const info = db.prepare(`
    INSERT INTO recharge_orders (order_no, user_id, plan_id, price, points, bonus, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(orderNo, req.user.id, plan.id, plan.price, plan.points, plan.bonus);

  const row = db.prepare('SELECT * FROM recharge_orders WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializeOrder(row));
});

/**
 * 模拟支付完成
 * 立即将订单置为 paid，并给用户增加积分
 * 生产环境：替换为支付平台异步回调
 */
router.post('/orders/:id/pay', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM recharge_orders WHERE id = ? AND user_id = ?').get(
    req.params.id,
    req.user.id
  );
  if (!row) {
    return res.status(404).json({ error: '订单不存在' });
  }
  if (row.status === 'paid') {
    return res.status(400).json({ error: '订单已支付', order: serializeOrder(row) });
  }
  if (row.status === 'cancelled') {
    return res.status(400).json({ error: '订单已取消' });
  }

  // 事务：订单置 paid + 用户加积分
  // node:sqlite 的 DatabaseSync 没有 .transaction() 方法，手动用 BEGIN/COMMIT/ROLLBACK
  try {
    db.exec('BEGIN');
    db.prepare(`
      UPDATE recharge_orders
      SET status = 'paid', paid_at = strftime('%s','now') * 1000,
          updated_at = strftime('%s','now') * 1000
      WHERE id = ?
    `).run(row.id);
    db.prepare(`
      UPDATE users SET points = points + ?, updated_at = strftime('%s','now') * 1000 WHERE id = ?
    `).run(row.points, req.user.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updated = db.prepare('SELECT * FROM recharge_orders WHERE id = ?').get(row.id);
  const pointsRow = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);

  res.json({
    order: serializeOrder(updated),
    pointsRemaining: pointsRow.points,
    addedPoints: row.points,
  });
});

/**
 * 当前用户充值历史
 */
router.get('/history', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM recharge_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(rows.map(serializeOrder));
});

module.exports = router;
