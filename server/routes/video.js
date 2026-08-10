/**
 * 视频生成路由（内置模型，由服务器调用方舟 API）
 *
 *  - POST /api/video/generate        创建视频生成任务（Seedance 2.0 预扣积分；1.x 免费；失败自动退还）
 *  - GET  /api/video/tasks/:taskId   查询任务状态（代理方舟；失败自动退还积分）
 *  - GET  /api/video/history         当前用户的历史任务列表
 *
 * Seedance 1.0（模型 ID 以 seedance-1-0- 开头）：免费，不扣积分，不做 API Key 校验。
 * Seedance 2.0（模型 ID 以 doubao-seedance-2-0- 开头）：消耗积分，需 ARK_API_KEY。
 *
 * 仅支持内置模型模式。用户自定义模型（自带 key）由客户端直接调用，
 * 不经过此路由、不消耗积分。
 */
const express = require('express');
const db = require('../db');
const settings = require('../settings');
const { authRequired } = require('../middleware/auth');
const { createVideoTask, getVideoTask } = require('../services/arkService');

const router = express.Router();

// 判断是否 Seedance 1.x 免费模型（无需 API Key、不扣积分）
function isSeedance1xFree(modelId) {
  return typeof modelId === 'string' && /^seedance-1-0-/i.test(modelId);
}

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

  // Seedance 1.x 免费模型：不扣积分；其他模型按规则扣积分
  const free = isSeedance1xFree(model);
  const pointsCost = free ? 0 : calcPointsCost({ duration, resolution });
  const userRow = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);
  if (!userRow) {
    return res.status(404).json({ error: '用户不存在' });
  }
  if (pointsCost > 0 && userRow.points < pointsCost) {
    return res.status(402).json({
      error: `积分不足，本次需要 ${pointsCost} 积分，当前剩余 ${userRow.points}`,
      pointsRequired: pointsCost,
      pointsRemaining: userRow.points,
    });
  }

  const now = Date.now();
  if (pointsCost > 0) {
    await db.run('UPDATE users SET points = points - ?, updated_at = ? WHERE id = ?', pointsCost, now, req.user.id);
  }

  let arkTask;
  try {
    arkTask = await createVideoTask({ prompt, imageUrl, duration, resolution, ratio, watermark, seed, model });
  } catch (err) {
    if (pointsCost > 0) {
      await db.run('UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?', pointsCost, Date.now(), req.user.id);
    }
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
    pointsCost,
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
      if (!row.refunded && row.points_cost > 0) {
        await db.run('UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?', row.points_cost, now, row.user_id);
      }
      const refunded = row.points_cost > 0 ? 1 : 0;
      await db.run('UPDATE video_tasks SET status = ?, error = ?, refunded = ?, updated_at = ? WHERE id = ?', 'failed', errorMsg, refunded, now, row.id);
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

/**
 * 可选 Seedance 模型列表（公开接口，需登录）
 * 供客户端动态拉取后台维护的内置模型列表
 */
router.get('/models', authRequired, (_req, res) => {
  const models = settings.get('seedanceModels') || [];
  res.json({ models });
});

module.exports = router;
