/**
 * 视频生成路由（内置 Seedance，由服务器调用方舟 API，消耗用户积分）
 *
 *  - POST /api/video/generate        创建视频生成任务（预扣积分 + 调用方舟建任务）
 *  - GET  /api/video/tasks/:taskId   查询任务状态（代理方舟；失败自动退还积分）
 *  - GET  /api/video/history         当前用户的历史任务列表
 *
 * 仅支持内置 Seedance 模式。用户自定义视频生成 AI（自带 key）由客户端直接调用，
 * 不经过此路由、不消耗积分。
 */
const express = require('express');
const db = require('../db');
const config = require('../config');
const settings = require('../settings');
const { authRequired } = require('../middleware/auth');
const { createVideoTask, getVideoTask } = require('../services/arkService');

const router = express.Router();

/**
 * 计算视频生成所需积分
 * 公式：duration × basePerSecond × (resolution==='1080p' ? hdMultiplier : 1)
 * 积分规则从数据库读取（后台可改）
 */
function calcPointsCost({ duration, resolution }) {
  const dur = parseInt(duration, 10) || 5;
  const { basePerSecond, hdMultiplier } = settings.get('videoPoints');
  const mult = resolution === '1080p' ? hdMultiplier : 1;
  return dur * basePerSecond * mult;
}

function serializeTask(row) {
  if (!row) return null;
  let params = {};
  try { params = row.params ? JSON.parse(row.params) : {}; } catch {}
  return {
    id: row.id,
    taskId: row.id,                 // 兼容字段：本地任务 ID
    arkTaskId: row.ark_task_id,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    params,
    status: row.status,
    videoUrl: row.video_url,
    pointsCost: row.points_cost,
    refunded: !!row.refunded,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 创建视频生成任务
 * 流程：校验积分 → 预扣积分 → 调用方舟建任务 → 入库
 */
router.post('/generate', authRequired, async (req, res) => {
  const { prompt, imageUrl, duration, resolution, ratio, watermark, seed, model } = req.body || {};

  if (!prompt && !imageUrl) {
    return res.status(400).json({ error: '提示词和参考图至少需要提供一项' });
  }

  // 1. 计算积分并校验余额
  const pointsCost = calcPointsCost({ duration, resolution });
  const userRow = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
  if (!userRow) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (userRow.points < pointsCost) {
    return res.status(402).json({
      error: `积分不足，本次需要 ${pointsCost} 积分，当前剩余 ${userRow.points}`,
      pointsRequired: pointsCost,
      pointsRemaining: userRow.points,
    });
  }

  // 2. 预扣积分
  db.prepare(`
    UPDATE users SET points = points - ?, updated_at = strftime('%s','now') * 1000 WHERE id = ?
  `).run(pointsCost, req.user.id);

  // 3. 调用方舟建任务
  let arkTask;
  try {
    arkTask = await createVideoTask({
      prompt,
      imageUrl,
      duration,
      resolution,
      ratio,
      watermark,
      seed,
      model,
    });
  } catch (err) {
    // 建任务失败 → 退还预扣积分
    db.prepare(`
      UPDATE users SET points = points + ?, updated_at = strftime('%s','now') * 1000 WHERE id = ?
    `).run(pointsCost, req.user.id);
    return res.status(502).json({ error: err.message || '调用方舟创建任务失败' });
  }

  // 4. 入库
  const params = { duration, resolution, ratio, watermark, seed };
  const info = db.prepare(`
    INSERT INTO video_tasks (user_id, ark_task_id, provider, model, prompt, params, status, points_cost)
    VALUES (?, ?, 'seedance', ?, ?, ?, 'queued', ?)
  `).run(
    req.user.id,
    arkTask.taskId,
    arkTask.model || (settings.get('ark') || {}).defaultModel,
    prompt || '',
    JSON.stringify(params),
    pointsCost
  );

  const row = db.prepare('SELECT * FROM video_tasks WHERE id = ?').get(info.lastInsertRowid);
  const remaining = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id).points;

  res.status(201).json({
    ...serializeTask(row),
    pointsRemaining: remaining,
  });
});

/**
 * 查询任务状态（代理方舟；若方舟任务失败且未退还，则自动退还积分）
 */
router.get('/tasks/:taskId', authRequired, async (req, res) => {
  const row = db.prepare('SELECT * FROM video_tasks WHERE id = ? AND user_id = ?').get(
    req.params.taskId,
    req.user.id
  );
  if (!row) {
    return res.status(404).json({ error: '任务不存在' });
  }

  // 终态直接返回本地记录
  if (row.status === 'succeeded' || (row.status === 'failed' && row.refunded)) {
    return res.json(serializeTask(row));
  }

  // 未到终态或失败未退还 → 查询方舟
  if (!row.ark_task_id) {
    return res.json(serializeTask(row));
  }

  try {
    const arkTask = await getVideoTask(row.ark_task_id);
    const status = arkTask.status; // queued|running|succeeded|failed
    const videoUrl = status === 'succeeded' ? (arkTask.content?.video_url || null) : null;
    const errorMsg = status === 'failed' ? (arkTask.error?.message || '视频生成失败') : null;

    if (status === 'succeeded') {
      db.prepare(`
        UPDATE video_tasks
        SET status = 'succeeded', video_url = ?, updated_at = strftime('%s','now') * 1000
        WHERE id = ?
      `).run(videoUrl, row.id);
    } else if (status === 'failed') {
      // 失败且未退还 → 退还积分
      if (!row.refunded) {
        db.prepare(`
          UPDATE users SET points = points + ?, updated_at = strftime('%s','now') * 1000 WHERE id = ?
        `).run(row.points_cost, row.user_id);
      }
      db.prepare(`
        UPDATE video_tasks
        SET status = 'failed', error = ?, refunded = 1, updated_at = strftime('%s','now') * 1000
        WHERE id = ?
      `).run(errorMsg, row.id);
    } else {
      // queued / running
      db.prepare(`
        UPDATE video_tasks SET status = ?, updated_at = strftime('%s','now') * 1000 WHERE id = ?
      `).run(status, row.id);
    }

    const updated = db.prepare('SELECT * FROM video_tasks WHERE id = ?').get(row.id);
    const remaining = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id).points;
    res.json({ ...serializeTask(updated), pointsRemaining: remaining });
  } catch (err) {
    res.status(502).json({ error: err.message || '查询方舟任务失败' });
  }
});

/**
 * 当前用户的历史任务
 */
router.get('/history', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM video_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(rows.map(serializeTask));
});

module.exports = router;
