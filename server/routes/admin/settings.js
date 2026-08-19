/**
 * 系统配置管理路由（管理员）
 *  - GET  /api/admin/settings          所有配置（含描述/更新时间）
 *  - GET  /api/admin/settings/:key     单个配置
 *  - PUT  /api/admin/settings/:key     更新单个配置
 *
 * 可配置项：videoPoints（积分规则）、rechargePlans（套餐）、
 *          builtinModels（内置模型列表，部署在本地服务器）、
 *          localModelService（本地模型服务配置，由后台维护）
 */
const express = require('express');
const settings = require('../../settings');
const { adminRequired } = require('../../middleware/adminAuth');

const router = express.Router();

router.get('/', adminRequired, async (_req, res) => {
  const all = await settings.getAllWithMeta();
  res.json({ settings: all });
});

router.get('/:key', adminRequired, async (req, res) => {
  const { key } = req.params;
  if (!settings.KEYS.includes(key)) {
    return res.status(404).json({ error: '配置项不存在' });
  }
  const value = settings.get(key);
  const meta = await settings.getMeta(key);
  res.json({ key, value, description: meta?.description, updatedAt: meta?.updated_at });
});

router.put('/:key', adminRequired, async (req, res) => {
  const { key } = req.params;
  if (!settings.KEYS.includes(key)) {
    return res.status(404).json({ error: '配置项不存在' });
  }
  const { value } = req.body || {};
  if (value === undefined) {
    return res.status(400).json({ error: '缺少 value 字段' });
  }
  if (key === 'defaultPoints') {
    if (typeof value !== 'number' || value < 0 || !Number.isFinite(value)) {
      return res.status(400).json({ error: '新用户赠送积分必须为非负整数' });
    }
  }
  if (key === 'videoParams') {
    const v = value;
    if (!v || typeof v !== 'object') {
      return res.status(400).json({ error: '视频参数必须为对象' });
    }
    if (!Array.isArray(v.durations) || !v.durations.every((d) => typeof d === 'number' && d > 0)) {
      return res.status(400).json({ error: '视频参数 durations 需为正数数组（如 [5, 10]）' });
    }
    if (!Array.isArray(v.resolutions) || !v.resolutions.every((r) => typeof r === 'string')) {
      return res.status(400).json({ error: '视频参数 resolutions 需为字符串数组' });
    }
    if (!Array.isArray(v.ratios) || !v.ratios.every((r) => r && typeof r.value === 'string' && typeof r.label === 'string')) {
      return res.status(400).json({ error: '视频参数 ratios 需为 [{value,label}] 数组' });
    }
    if (typeof v.defaultDuration !== 'number') {
      return res.status(400).json({ error: '视频参数 defaultDuration 需为数字' });
    }
    if (typeof v.defaultResolution !== 'string') {
      return res.status(400).json({ error: '视频参数 defaultResolution 需为字符串' });
    }
    if (typeof v.defaultRatio !== 'string') {
      return res.status(400).json({ error: '视频参数 defaultRatio 需为字符串' });
    }
    if (typeof v.defaultWatermark !== 'boolean') {
      return res.status(400).json({ error: '视频参数 defaultWatermark 需为布尔' });
    }
    if (typeof v.defaultSeed !== 'number') {
      return res.status(400).json({ error: '视频参数 defaultSeed 需为数字' });
    }
  }
  if (key === 'videoPoints') {
    if (typeof value.basePerSecond !== 'number' || typeof value.hdMultiplier !== 'number') {
      return res.status(400).json({ error: '积分规则需包含 basePerSecond 和 hdMultiplier 数字字段' });
    }
  }
  if (key === 'localModelService') {
    if (typeof value.baseURL !== 'string' || typeof value.apiKey !== 'string' || typeof value.enabled !== 'boolean') {
      return res.status(400).json({ error: '本地模型服务配置需包含 baseURL、apiKey（字符串）和 enabled（布尔）字段' });
    }
  }
  if (key === 'rechargePlans' && !Array.isArray(value)) {
    return res.status(400).json({ error: '套餐必须为数组' });
  }
  if (key === 'builtinModels' && !Array.isArray(value)) {
    return res.status(400).json({ error: '模型列表必须为数组' });
  }

  const updated = await settings.set(key, value);
  const meta = await settings.getMeta(key);
  res.json({ key, value: updated, description: meta?.description, updatedAt: meta?.updated_at });
});

module.exports = router;
