/**
 * 用户路由：资料查询/更新、头像、积分、前端运行时配置
 *  - GET    /api/user/profile
 *  - PUT    /api/user/profile        { nickname?, avatar? }
 *  - GET    /api/user/points
 *  - POST   /api/user/points         { delta }   (演示用：增减积分)
 *  - GET    /api/user/settings                    前端运行时可变配置（视频参数等，由后台管理）
 *  - GET    /api/user/custom-model                用户私有的自定义模型配置（加密存储）
 *  - PUT    /api/user/custom-model                保存自定义模型配置
 */
const express = require('express');
const db = require('../db');
const settings = require('../settings');
const { encrypt, decrypt } = require('../crypto');
const { sanitizeUser } = require('./auth');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// 获取当前用户资料
router.get('/profile', authRequired, async (req, res) => {
  const row = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json(sanitizeUser(row));
});

// 更新资料（昵称、头像）
router.put('/profile', authRequired, async (req, res) => {
  const { nickname, avatar } = req.body || {};
  const updates = [];
  const params = [];
  if (typeof nickname === 'string' && nickname.trim()) {
    updates.push('nickname = ?');
    params.push(nickname.trim().slice(0, 32));
  }
  if (typeof avatar === 'string') {
    if (avatar.length > 1024 * 1024) {
      return res.status(400).json({ error: '头像数据过大' });
    }
    updates.push('avatar = ?');
    params.push(avatar);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }
  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(req.user.id);
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...params);
  const row = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  res.json(sanitizeUser(row));
});

// 查询积分
router.get('/points', authRequired, async (req, res) => {
  const row = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json({ points: row.points });
});

// 增减积分（演示用）
router.post('/points', authRequired, async (req, res) => {
  const delta = parseInt(req.body?.delta, 10);
  if (Number.isNaN(delta)) {
    return res.status(400).json({ error: 'delta 必须为整数' });
  }
  await db.run(
    'UPDATE users SET points = MAX(0, points + ?), updated_at = ? WHERE id = ?',
    delta, Date.now(), req.user.id
  );
  const row = await db.get('SELECT points FROM users WHERE id = ?', req.user.id);
  res.json({ points: row.points });
});

// 前端运行时可变配置（由后台管理）：当前仅返回 videoParams，后续可扩展
router.get('/settings', authRequired, async (_req, res) => {
  const videoParams = settings.get('videoParams') || {};
  res.json({ videoParams });
});

// 提交意见反馈
//   { category?, content, contact? }
router.post('/feedback', authRequired, async (req, res) => {
  const { category, content, contact } = req.body || {};
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    return res.status(400).json({ error: '反馈内容不能为空' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: '反馈内容过长（最多 2000 字）' });
  }
  const allowed = ['bug', 'feature', 'experience', 'other'];
  const cat = allowed.includes(category) ? category : 'other';
  const contactStr = typeof contact === 'string' ? contact.trim().slice(0, 100) : '';

  const info = await db.run(
    'INSERT INTO feedback (user_id, category, content, contact) VALUES (?, ?, ?, ?)',
    req.user.id, cat, text, contactStr
  );
  res.json({ id: info.lastInsertRowid, ok: true });
});

// ============================================================
// 用户私有的自定义模型配置（加密存储，随账号走）
//   GET /api/user/custom-model    → { videoProvider, customVideo }
//   PUT /api/user/custom-model    body: { videoProvider, customVideo }
// ============================================================
const CUSTOM_MODEL_KEY = 'videoConfig';

router.get('/custom-model', authRequired, async (req, res) => {
  const keyCol = db.dialect === 'mysql' ? '`key`' : 'key';
  const row = await db.get(
    `SELECT value FROM user_settings WHERE user_id = ? AND ${keyCol} = ?`,
    req.user.id, CUSTOM_MODEL_KEY
  );
  if (!row) return res.json(null);
  try {
    const json = decrypt(row.value);
    res.json(JSON.parse(json));
  } catch {
    // 解密失败（如密钥变更），返回空让客户端重新填写
    res.json(null);
  }
});

router.put('/custom-model', authRequired, async (req, res) => {
  const { videoProvider, customVideo } = req.body || {};
  const payload = {
    videoProvider: typeof videoProvider === 'string' ? videoProvider : 'seedance',
    customVideo: {
      baseURL: typeof customVideo?.baseURL === 'string' ? customVideo.baseURL : '',
      apiKey: typeof customVideo?.apiKey === 'string' ? customVideo.apiKey : '',
      modelId: typeof customVideo?.modelId === 'string' ? customVideo.modelId : '',
    },
  };
  const encrypted = encrypt(JSON.stringify(payload));
  await db.run(
    db.upsertUserSettingsSql(),
    req.user.id, CUSTOM_MODEL_KEY, encrypted, Date.now()
  );
  res.json(payload);
});

module.exports = router;
