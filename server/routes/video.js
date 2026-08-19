/**
 * 视频生成路由（内置模型，由服务器调用本地模型服务）
 *
 *  - POST /api/video/generate        创建视频生成任务（预扣积分；失败自动退还）
 *  - GET  /api/video/tasks/:taskId   查询任务状态（代理本地模型服务；失败自动退还积分）
 *  - GET  /api/video/history         当前用户的历史任务列表
 *  - GET  /api/video/models          后台维护的内置模型列表
 *
 * 内置模型 = 部署在本地服务器的模型，由服务器统一调用，客户端无需感知 url / api_key。
 * 用户自定义模型（自带 key）由客户端直接调用，不经过此路由、不消耗积分。
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
    duration: params.duration,
    status: row.status,
    videoUrl: row.video_url,
    localPath: row.local_path,
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

  // 内置模型按规则扣积分
  const pointsCost = calcPointsCost({ duration, resolution });
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

  let localTask;
  try {
    localTask = await createVideoTask({ prompt, imageUrl, duration, resolution, ratio, watermark, seed, model });
  } catch (err) {
    if (pointsCost > 0) {
      await db.run('UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?', pointsCost, Date.now(), req.user.id);
    }
    return res.status(502).json({ error: err.message || '调用本地模型服务创建任务失败' });
  }

  const params = { duration, resolution, ratio, watermark, seed };
  const info = await db.run(
    'INSERT INTO video_tasks (user_id, ark_task_id, provider, model, prompt, params, status, points_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    req.user.id, localTask.taskId, 'builtin',
    localTask.model || model || '',
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
    const localTask = await getVideoTask(row.ark_task_id);
    const status = localTask.status;
    const videoUrl = status === 'succeeded' ? (localTask.content?.video_url || null) : null;
    const errorMsg = status === 'failed' ? (localTask.error?.message || '视频生成失败') : null;
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
    res.status(502).json({ error: err.message || '查询本地模型任务失败' });
  }
});

router.get('/history', authRequired, async (req, res) => {
  const rows = await db.all('SELECT * FROM video_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', req.user.id);
  res.json(rows.map(serializeTask));
});

/**
 * 自定义模型任务结果上报
 * 自定义模式由客户端直接调用方舟兼容端点，不经过服务器扣积分；
 * 但需在完成后上报结果到 video_tasks 表，供后台管理查看统计。
 * points_cost 固定为 0，refunded 固定为 0。
 */
router.post('/record', authRequired, async (req, res) => {
  const { provider, model, prompt, params, status, videoUrl, arkTaskId, localPath, error } = req.body || {};

  if (provider !== 'custom') {
    return res.status(400).json({ error: '此接口仅用于自定义模型任务上报' });
  }

  const finalStatus = ['succeeded', 'failed'].includes(status) ? status : 'succeeded';
  const info = await db.run(
    'INSERT INTO video_tasks (user_id, ark_task_id, provider, model, prompt, params, status, video_url, local_path, points_cost, refunded, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    req.user.id,
    arkTaskId || '',
    'custom',
    model || '',
    prompt || '',
    JSON.stringify(params || {}),
    finalStatus,
    finalStatus === 'succeeded' ? (videoUrl || '') : '',
    finalStatus === 'succeeded' ? (localPath || '') : '',
    0,
    0,
    finalStatus === 'failed' ? (error || '视频生成失败') : null
  );

  const row = await db.get('SELECT * FROM video_tasks WHERE id = ?', info.lastInsertRowid);
  res.status(201).json(serializeTask(row));
});

/**
 * 更新视频任务的本地下载路径
 * 视频下载到客户端本地后，客户端上报 localPath 到服务端，
 * 供历史记录播放（localPath 为客户端本地路径，仅同一机器有效）。
 */
router.patch('/tasks/:taskId/local-path', authRequired, async (req, res) => {
  const { localPath } = req.body || {};
  if (!localPath) {
    return res.status(400).json({ error: '缺少 localPath' });
  }
  const row = await db.get('SELECT * FROM video_tasks WHERE id = ? AND user_id = ?', req.params.taskId, req.user.id);
  if (!row) {
    return res.status(404).json({ error: '任务不存在' });
  }
  await db.run('UPDATE video_tasks SET local_path = ?, updated_at = ? WHERE id = ?', localPath, Date.now(), row.id);
  const updated = await db.get('SELECT * FROM video_tasks WHERE id = ?', row.id);
  res.json(serializeTask(updated));
});

/**
 * 内置模型列表（公开接口，需登录）
 * 供客户端动态拉取后台维护的内置模型列表（部署在本地服务器的模型）
 */
router.get('/models', authRequired, (_req, res) => {
  const models = settings.get('builtinModels') || [];
  res.json({ models });
});

module.exports = router;
