/**
 * 系统配置管理路由（管理员）
 *
 *  - GET  /api/admin/settings          所有配置（含描述/更新时间）
 *  - GET  /api/admin/settings/:key     单个配置
 *  - PUT  /api/admin/settings/:key     更新单个配置
 *
 * 可配置项：ark（方舟Key/BaseURL/模型）、videoPoints（积分规则）、
 *          rechargePlans（套餐）、seedanceModels（模型列表）
 */
const express = require('express');
const settings = require('../../settings');
const { adminRequired } = require('../../middleware/adminAuth');

const router = express.Router();

/**
 * 所有配置
 */
router.get('/', adminRequired, (_req, res) => {
  res.json({ settings: settings.getAllWithMeta() });
});

/**
 * 单个配置
 */
router.get('/:key', adminRequired, (req, res) => {
  const { key } = req.params;
  if (!settings.KEYS.includes(key)) {
    return res.status(404).json({ error: '配置项不存在' });
  }
  const value = settings.get(key);
  const meta = settings.getMeta(key);
  res.json({ key, value, description: meta?.description, updatedAt: meta?.updated_at });
});

/**
 * 更新单个配置
 * body: { value }
 */
router.put('/:key', adminRequired, (req, res) => {
  const { key } = req.params;
  if (!settings.KEYS.includes(key)) {
    return res.status(404).json({ error: '配置项不存在' });
  }
  const { value } = req.body || {};
  if (value === undefined) {
    return res.status(400).json({ error: '缺少 value 字段' });
  }
  // 基础校验
  if (key === 'videoPoints') {
    if (typeof value.basePerSecond !== 'number' || typeof value.hdMultiplier !== 'number') {
      return res.status(400).json({ error: '积分规则需包含 basePerSecond 和 hdMultiplier 数字字段' });
    }
  }
  if (key === 'ark') {
    if (typeof value.baseURL !== 'string' || typeof value.apiKey !== 'string') {
      return res.status(400).json({ error: '方舟配置需包含 baseURL 和 apiKey 字段' });
    }
  }
  if (key === 'rechargePlans' && !Array.isArray(value)) {
    return res.status(400).json({ error: '套餐必须为数组' });
  }
  if (key === 'seedanceModels' && !Array.isArray(value)) {
    return res.status(400).json({ error: '模型列表必须为数组' });
  }

  const updated = settings.set(key, value);
  const meta = settings.getMeta(key);
  res.json({ key, value: updated, description: meta?.description, updatedAt: meta?.updated_at });
});

module.exports = router;
