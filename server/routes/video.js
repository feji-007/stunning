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
const settings = require('../settings');
const { authRequired } = require('../middleware/auth');
const { createVideoTask, getVideoTask } = require('../services/arkService');

const router = express.Router();

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
    taskId: row.id,
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

router.post('/generate', authRequired, async (req, res) => {
  const { prompt, imageUrl, duration, resolution, ratio, watermark, seed, model } = req.body || {};

  if (!prompt && !imageUrl) {
    return res.status(400).json({ error: '提示词和参考图至少需要提供一项' });
  }

  const pointsCost = calcPointsCost({ duration, resolution });
  const userRow = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);
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

  const now = Date.now();
  await db.run('UPDATE users SET points = points - ?, updated_at = ? WHERE id = ?', pointsCost, now, req.user.id);

  let arkTask;
  try {
    arkTask = await createVideoTask({ prompt, imageUrl, duration, resolution, ratio, watermark, seed, model });
  } catch (err) {
    await db.run('UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?', pointsCost, Date.now(), req.user.id);
    return res.status(502).json({ error: err.message || '调用方舟创建任务失败' });
  }

  const params = { duration, resolution, ratio, watermark, seed };
  const info = await db.run(
    'INSERT INTO video_tasks (user_id, ark_task_id, provider, model, prompt, params, status, points_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    req.user.id, arkTask.taskId, 'seedance',
    arkTask.model || (settings.get('ark') || {}).defaultModel,
    prompt || '', JSON.stringify(params), 'queued', pointsCost
  );

  const row = await db.get('SELECT * FROM video_tasks WHERE id = ?', info.lastInsertRowid);
  const remainingRow = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);

  res.status(201).json({
    ...serializeTask(row),
    pointsRemaining: remainingRow.points,
  });
});

router.get('/tasks/:taskId', authRequired, async (req, res) => {
  const row = await db.get('SELECT * FROM video_tasks WHERE id = ? AND user_id = ?', req.params.taskId, req.user.id);
  if (!row) {
    return res.status(404).json({ error: '任务不存在' });
  }

  if (row.status === 'succeeded' || (row.status === 'failed' && row.refunded)) {
    return res.json(serializeTask(row));
  }

  if (!row.ark_task_id) {
    return res.json(serializeTask(row));
  }

  try {
    const arkTask = await getVideoTask(row.ark_task_id);
    const status = arkTask.status;
    const videoUrl = status === 'succeeded' ? (arkTask.content?.video_url || null) : null;
    const errorMsg = status === 'failed' ? (arkTask.error?.message || '视频生成失败') : null;
    const now = Date.now();

    if (status === 'succeeded') {
      await db.run('UPDATE video_tasks SET status = ?, video_url = ?, updated_at = ? WHERE id = ?', 'succeeded', videoUrl, now, row.id);
    } else if (status === 'failed') {
      if (!row.refunded) {
        await db.run('UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?', row.points_cost, now, row.user_id);
      }
      await db.run('UPDATE video_tasks SET status = ?, error = ?, refunded = ?, updated_at = ? WHERE id = ?', 'failed', errorMsg, 1, now, row.id);
    } else {
      await db.run('UPDATE video_tasks SET status = ?, updated_at = ? WHERE id = ?', status, now, row.id);
    }

    const updated = await db.get('SELECT * FROM video_tasks WHERE id = ?', row.id);
    const remainingRow = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);
    res.json({ ...serializeTask(updated), pointsRemaining: remainingRow.points });
  } catch (err) {
    res.status(502).json({ error: err.message || '查询方舟任务失败' });
  }
});

router.get('/history', authRequired, async (req, res) => {
  const rows = await db.all('SELECT * FROM video_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', req.user.id);
  res.json(rows.map(serializeTask));
});

module.exports = router;
