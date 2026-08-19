/**
 * 系统配置模块（数据库驱动）
 *
 * 把运行时可变配置（积分规则、充值套餐、内置模型列表）
 * 存于数据库 settings 表，由后台管理界面维护，运行时实时生效。
 *
 * 设计：
 *   - 启动时 loadAll() 异步加载所有配置到内存缓存（由 index.js 在数据库初始化后调用）
 *   - get(key) 从缓存同步读，DB 缺失时回退到内联默认值
 *   - set(key, value) 异步写 DB（UPSERT）并刷新缓存
 *   - 业务路由统一通过本模块读配置
 *
 * config.js 仅保留静态配置（端口、DB、JWT 等），不再包含可变配置。
 */
const db = require('./db');

// 内存缓存
const cache = new Map();

// 内联默认值（兜底）—— 不再依赖 config.js 的可变部分
const DEFAULTS = {
  // 新用户注册赠送积分（由后台管理，config.js 不再维护）
  defaultPoints: 100,

  // 视频生成参数可选项（由后台管理，客户端不再硬编码）
  //  包含支持的时长 / 分辨率 / 画面比例，以及默认值
  videoParams: {
    durations: [5, 10],
    resolutions: ['720p', '1080p'],
    ratios: [
      { value: '16:9', label: '横屏 16:9' },
      { value: '9:16', label: '竖屏 9:16' },
      { value: '1:1',  label: '方形 1:1' },
      { value: '4:3',  label: '横屏 4:3' },
      { value: '3:4',  label: '竖屏 3:4' },
      { value: '21:9', label: '宽屏 21:9' },
    ],
    defaultDuration: 5,
    defaultResolution: '720p',
    defaultRatio: '16:9',
    defaultWatermark: false,
    defaultSeed: -1,
  },

  // 视频生成积分扣减规则（仅内置模型且开启积分时生效）
  // 计算公式：duration(秒) × basePerSecond × (resolution==='1080p' ? hdMultiplier : 1)
  videoPoints: {
    basePerSecond: 2,   // 每秒基础消耗 2 积分
    hdMultiplier: 2,    // 1080p 分辨率倍率
  },

  // 充值套餐（price 单位：元，points 为实际到账积分含赠送）
  rechargePlans: [
    { id: 'plan_10',   price: 10,   points: 100,  bonus: 0,   label: '入门' },
    { id: 'plan_50',   price: 50,   points: 550,  bonus: 50,  label: '常用' },
    { id: 'plan_100',  price: 100,  points: 1200, bonus: 200, label: '超值' },
    { id: 'plan_200',  price: 200,  points: 2500, bonus: 500, label: '尊享' },
  ],

  // 内置模型列表 —— 部署在本地服务器的模型（占位符示例）
  // 将来对接本地模型服务后，由后台管理界面维护实际可用模型
  builtinModels: [
    { id: 'local-video-lite-t2v',  name: '本地视频模型 Lite 文生视频', desc: '本地部署 · 文生视频（占位）' },
    { id: 'local-video-lite-i2v',  name: '本地视频模型 Lite 图生视频', desc: '本地部署 · 图生视频（占位）' },
    { id: 'local-video-pro-t2v',   name: '本地视频模型 Pro 文生视频',  desc: '本地部署 · 文生视频（占位）' },
    { id: 'local-video-pro-i2v',   name: '本地视频模型 Pro 图生视频',  desc: '本地部署 · 图生视频（占位）' },
  ],

  // 本地模型服务配置（由后台管理，用户无需感知）
  // 将来对接本地模型服务时填写实际地址与凭证
  localModelService: {
    baseURL: '',    // 本地模型服务地址，如 http://127.0.0.1:8000
    apiKey: '',     // 本地模型服务凭证（如需）
    enabled: false, // 是否已启用本地模型服务
  },
};

/**
 * 启动时加载所有配置到缓存（异步）
 * 必须在 db.initDb() 之后调用
 */
async function loadAll() {
  try {
    const selAllSql = db.dialect === 'mysql' ? 'SELECT `key` AS `key`, value FROM settings' : 'SELECT key, value FROM settings';
    const rows = await db.all(selAllSql);
    for (const row of rows) {
      try {
        cache.set(row.key, JSON.parse(row.value));
      } catch {
        cache.set(row.key, row.value);
      }
    }

    // ===== 兼容旧数据迁移 =====
    // 旧版本使用 'seedanceModels' / 'ark'，迁移到 'builtinModels' / 'localModelService'
    if (cache.has('seedanceModels') && !cache.has('builtinModels')) {
      cache.set('builtinModels', cache.get('seedanceModels'));
      await db.run(db.upsertSettingsSql(), 'builtinModels', JSON.stringify(cache.get('seedanceModels')), Date.now());
    }
    if (cache.has('ark') && !cache.has('localModelService')) {
      const oldArk = cache.get('ark');
      cache.set('localModelService', {
        baseURL: oldArk.baseURL || '',
        apiKey: oldArk.apiKey || '',
        enabled: !!oldArk.apiKey,
      });
      await db.run(db.upsertSettingsSql(), 'localModelService', JSON.stringify(cache.get('localModelService')), Date.now());
    }
  } catch (err) {
    console.error('[settings] 加载配置失败，使用默认值:', err);
  }
}

/**
 * 读取单个配置（同步，从缓存读；DB 缺失时回退默认值）
 * @param {string} key - defaultPoints | videoParams | videoPoints | rechargePlans | builtinModels | localModelService
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
  const selMetaSql = db.dialect === 'mysql' ? 'SELECT description, updated_at FROM settings WHERE `key` = ?' : 'SELECT description, updated_at FROM settings WHERE key = ?';
  const row = await db.get(selMetaSql, key);
  return row || null;
}

/**
 * 读取所有配置项（含描述、更新时间，用于后台列表）
 */
async function getAllWithMeta() {
  const selAllMetaSql = db.dialect === 'mysql'
    ? 'SELECT `key` AS `key`, value, description, updated_at FROM settings ORDER BY `key`'
    : 'SELECT key, value, description, updated_at FROM settings ORDER BY key';
  const rows = await db.all(selAllMetaSql);
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
