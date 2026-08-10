/**
 * 系统配置模块（数据库驱动）
 *
 * 把原本写在 config.js 中的运行时可变配置（方舟 Key、积分规则、充值套餐、模型列表）
 * 迁移到数据库 settings 表，由后台管理界面维护，运行时实时生效。
 *
 * 设计：
 *   - 启动时 loadAll() 一次性加载到内存缓存
 *   - get(key) 从缓存读，DB 缺失时回退到 config.js 默认值
 *   - set(key, value) 写 DB 并刷新缓存
 *   - 业务路由统一通过本模块读配置，不再直接读 config.js 的可变部分
 *
 * config.js 仍保留静态配置（端口、DB 路径、JWT 密钥等），作为兜底默认值。
 */
const db = require('./db');
const config = require('./config');

// 内存缓存
const cache = new Map();

// config.js 中对应字段的默认值（兜底）
const DEFAULTS = {
  ark: config.ark,
  videoPoints: config.videoPoints,
  rechargePlans: config.rechargePlans,
  seedanceModels: [
    { id: 'doubao-seedance-2-0-pro', name: 'Seedance 2.0 Pro', desc: '更高质量' },
    { id: 'doubao-seedance-2-0-fast', name: 'Seedance 2.0 Fast', desc: '更快速度' },
    { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生视频', desc: '1.0 Pro 文生视频' },
    { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生视频', desc: '1.0 Pro 图生视频' },
    { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生视频', desc: '1.0 Lite 文生视频' },
    { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生视频', desc: '1.0 Lite 图生视频' },
  ],
};

/**
 * 启动时加载所有配置到缓存
 */
function loadAll() {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    for (const row of rows) {
      try {
        cache.set(row.key, JSON.parse(row.value));
      } catch {
        cache.set(row.key, row.value);
      }
    }
  } catch (err) {
    console.error('[settings] 加载配置失败，使用默认值:', err);
  }
}

/**
 * 读取单个配置（带默认值兜底）
 * @param {string} key - ark | videoPoints | rechargePlans | seedanceModels
 * @returns {*}
 */
function get(key) {
  if (cache.has(key)) return cache.get(key);
  return DEFAULTS[key];
}

/**
 * 读取所有配置（用于后台展示）
 */
function getAll() {
  const result = {};
  for (const key of Object.keys(DEFAULTS)) {
    result[key] = get(key);
  }
  return result;
}

/**
 * 写入配置（更新 DB + 刷新缓存）
 */
function set(key, value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%s','now') * 1000)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, json);
  cache.set(key, value);
  return value;
}

/**
 * 读取配置项的描述信息（用于后台展示）
 */
function getMeta(key) {
  const row = db.prepare('SELECT description, updated_at FROM settings WHERE key = ?').get(key);
  return row || null;
}

/**
 * 读取所有配置项（含描述、更新时间，用于后台列表）
 */
function getAllWithMeta() {
  const rows = db.prepare('SELECT key, value, description, updated_at FROM settings ORDER BY key').all();
  return rows.map((row) => {
    let value;
    try { value = JSON.parse(row.value); } catch { value = row.value; }
    return {
      key: row.key,
      value,
      description: row.description,
      updatedAt: row.updated_at,
    };
  });
}

// 模块加载时预加载缓存
loadAll();

module.exports = {
  get,
  set,
  getAll,
  getMeta,
  getAllWithMeta,
  loadAll,
  KEYS: Object.keys(DEFAULTS),
};
