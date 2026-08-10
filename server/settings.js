/**
 * 系统配置模块（数据库驱动）
 *
 * 把原本写在 config.js 中的运行时可变配置（方舟 Key、积分规则、充值套餐、模型列表）
 * 迁移到数据库 settings 表，由后台管理界面维护，运行时实时生效。
 *
 * 设计：
 *   - 启动时 init() 异步加载所有配置到内存缓存（由 index.js 在数据库初始化后调用）
 *   - get(key) 从缓存同步读，DB 缺失时回退到 config.js 默认值
 *   - set(key, value) 异步写 DB（UPSERT）并刷新缓存
 *   - 业务路由统一通过本模块读配置，不再直接读 config.js 的可变部分
 *
 * config.js 仍保留静态配置（端口、DB 配置、JWT 密钥等），作为兜底默认值。
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
  ],
};

/**
 * 启动时加载所有配置到缓存（异步）
 * 必须在 db.initDb() 之后调用
 */
async function loadAll() {
  try {
    const rows = await db.all('SELECT key, value FROM settings');
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
 * 读取单个配置（同步，从缓存读；DB 缺失时回退默认值）
 * @param {string} key - ark | videoPoints | rechargePlans | seedanceModels
 * @returns {*}
 */
function get(key) {
  if (cache.has(key)) return cache.get(key);
  return DEFAULTS[key];
}

/**
 * 读取所有配置（同步，用于后台展示）
 */
function getAll() {
  const result = {};
  for (const key of Object.keys(DEFAULTS)) {
    result[key] = get(key);
  }
  return result;
}

/**
 * 写入配置（异步：UPSERT DB + 刷新缓存）
 */
async function set(key, value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  await db.run(db.upsertSettingsSql(), key, json, Date.now());
  cache.set(key, value);
  return value;
}

/**
 * 读取配置项的描述信息（异步，用于后台展示）
 */
async function getMeta(key) {
  const row = await db.get('SELECT description, updated_at FROM settings WHERE key = ?', key);
  return row || null;
}

/**
 * 读取所有配置项（含描述、更新时间，用于后台列表）
 */
async function getAllWithMeta() {
  const rows = await db.all('SELECT key, value, description, updated_at FROM settings ORDER BY key');
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

module.exports = {
  get,        // 同步读缓存
  set,        // 异步写 DB
  getAll,     // 同步读缓存
  getMeta,    // 异步
  getAllWithMeta, // 异步
  loadAll,    // 异步初始化
  KEYS: Object.keys(DEFAULTS),
};
