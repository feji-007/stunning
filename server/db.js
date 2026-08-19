/**
 * 数据库连接 + 表结构 + 种子数据（支持 SQLite / MySQL 切换）
 *
 * 通过 config.db.driver 选择驱动：
 *   - 'sqlite'（默认）：Node 22.5+ 内置 node:sqlite，无需额外依赖
 *   - 'mysql'：基于 mysql2/promise，需 npm install mysql2
 *
 * 两种驱动暴露统一的 async 接口：
 *   db.exec(sql)              执行 DDL / 无参数语句
 *   db.run(sql, ...params)    INSERT/UPDATE/DELETE → { lastInsertRowid, changes }
 *   db.get(sql, ...params)    返回单行
 *   db.all(sql, ...params)    返回行数组
 *   db.transaction(fn)        事务，fn 接收具备相同方法的 tx 对象
 *   db.dialect                'sqlite' | 'mysql'
 *
 * 数据库连接信息全部留在服务器，客户端不直接访问。
 */
const config = require('./config');
const bcrypt = require('bcryptjs');

// 注意：settings.js 顶部 require('./db')，因此此处不能再 require('./settings')，
// 否则形成循环依赖（settings 拿到的 db 为空对象）。在 migrateLegacySettings 内部按需 require。

// ===== 根据驱动创建 adapter =====
let adapter;
function createAdapter() {
  const driver = config.db.driver;
  if (driver === 'mysql') {
    const { MysqlAdapter } = require('./db/mysqlAdapter');
    return new MysqlAdapter(config.db.mysql);
  }
  // 默认 sqlite
  const { SqliteAdapter } = require('./db/sqliteAdapter');
  return new SqliteAdapter(config.db.sqlite);
}

adapter = createAdapter();
const db = adapter;

// ===== 建表 SQL 生成（按 dialect 处理差异）=====
function buildSchema() {
  const dialect = db.dialect;
  const PK = dialect === 'mysql' ? 'INT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const NOW = db.nowExpr;

  // Choose types per dialect: for large text values use LONGTEXT on MySQL
  const TYPE_TEXT = dialect === 'mysql' ? 'LONGTEXT' : 'TEXT';
  const TYPE_SHORT = dialect === 'mysql' ? 'VARCHAR(255)' : 'TEXT';
  const TS_TYPE = dialect === 'mysql' ? 'BIGINT' : 'INTEGER';

  const KEY_COL = dialect === 'mysql' ? '`key`' : 'key';

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id            ${PK},
      username      ${TYPE_SHORT}    NOT NULL UNIQUE,
      password_hash ${TYPE_SHORT}    NOT NULL,
      nickname      ${TYPE_SHORT}    NOT NULL DEFAULT '',
      avatar        ${TYPE_SHORT}    NOT NULL DEFAULT '',
      points        INTEGER NOT NULL DEFAULT 0,
      created_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      updated_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS video_tasks (
      id            ${PK},
      user_id       INTEGER NOT NULL,
      ark_task_id   ${TYPE_SHORT},
      provider      ${TYPE_SHORT}    NOT NULL DEFAULT 'builtin',
      model         ${TYPE_SHORT},
      prompt        ${dialect === 'mysql' ? `${TYPE_TEXT}    NOT NULL` : `${TYPE_TEXT}    NOT NULL DEFAULT ''`},
      params        ${TYPE_TEXT},
      status        ${TYPE_SHORT}    NOT NULL DEFAULT 'queued',
      video_url     ${TYPE_TEXT},
      local_path    ${TYPE_TEXT},
      points_cost   INTEGER NOT NULL DEFAULT 0,
      refunded      INTEGER NOT NULL DEFAULT 0,
      error         ${TYPE_TEXT},
      created_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      updated_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS recharge_orders (
      id            ${PK},
      order_no      ${TYPE_SHORT}    NOT NULL UNIQUE,
      user_id       INTEGER NOT NULL,
      plan_id       ${TYPE_SHORT}    NOT NULL,
      price         INTEGER NOT NULL,
      points        INTEGER NOT NULL,
      bonus         INTEGER NOT NULL DEFAULT 0,
      status        ${TYPE_SHORT}    NOT NULL DEFAULT 'pending',
      paid_at       ${TS_TYPE},
      created_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      updated_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS admins (
      id            ${PK},
      username      ${TYPE_SHORT}    NOT NULL UNIQUE,
      password_hash ${TYPE_SHORT}    NOT NULL,
      nickname      ${TYPE_SHORT}    NOT NULL DEFAULT '管理员',
      created_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      updated_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS settings (
      ${KEY_COL}         ${TYPE_SHORT} PRIMARY KEY,
      value       ${TYPE_TEXT} NOT NULL,
      description ${TYPE_TEXT},
      updated_at  ${TS_TYPE} NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS user_settings (
      user_id     INTEGER NOT NULL,
      ${KEY_COL}   ${TYPE_SHORT} NOT NULL,
      value       ${TYPE_TEXT} NOT NULL,
      updated_at  ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      PRIMARY KEY (user_id, ${KEY_COL}),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS feedback (
      id            ${PK},
      user_id       INTEGER NOT NULL,
      category      ${TYPE_SHORT}    NOT NULL DEFAULT 'other',
      content       ${TYPE_TEXT}    NOT NULL,
      contact       ${TYPE_SHORT}    NOT NULL DEFAULT '',
      is_read       INTEGER NOT NULL DEFAULT 0,
      created_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      updated_at    ${TS_TYPE} NOT NULL DEFAULT (${NOW}),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ];

  // 索引：SQLite 支持 IF NOT EXISTS，MySQL 不支持（用 try/catch 忽略重复）
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_video_tasks_user ON video_tasks(user_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_recharge_orders_user ON recharge_orders(user_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_feedback_is_read ON feedback(is_read)',
  ];

  return { tables, indexes };
}

// ===== UPSERT SQL（方言差异）=====
function upsertSettingsSql() {
  if (db.dialect === 'mysql') {
    return `INSERT INTO settings (` + '\`key\`' + `, value, updated_at) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`;
  }
  return `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;
}

// ===== user_settings UPSERT（方言差异）=====
function upsertUserSettingsSql() {
  const keyCol = db.dialect === 'mysql' ? '`key`' : 'key';
  if (db.dialect === 'mysql') {
    return `INSERT INTO user_settings (user_id, ${keyCol}, value, updated_at) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`;
  }
  return `INSERT INTO user_settings (user_id, ${keyCol}, value, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, ${keyCol}) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;
}

// ===== 初始化：建表 + 种子数据 =====
async function initDb() {
  const { tables, indexes } = buildSchema();

  // 清理已废弃的旧表（旧版本含 AI Agent 功能，已移除）
  await db.exec('DROP TABLE IF EXISTS agent_messages');
  await db.exec('DROP TABLE IF EXISTS agents');

  // 建表（CREATE TABLE IF NOT EXISTS：已有则保留历史数据，缺失则新建）
  for (const sql of tables) {
    await db.exec(sql);
  }

  // 迁移：为已有 video_tasks 表补 local_path 列（列已存在则忽略错误）
  const localPathColType = db.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT';
  try {
    await db.exec(`ALTER TABLE video_tasks ADD COLUMN local_path ${localPathColType}`);
  } catch {}

  // 如果已有 video_url/local_path 列但类型过小（MySQL），尝试修改列类型以避免数据截断
  if (db.dialect === 'mysql') {
    try {
      await db.exec(`ALTER TABLE video_tasks MODIFY COLUMN video_url ${db.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'}`);
    } catch {}
    try {
      await db.exec(`ALTER TABLE video_tasks MODIFY COLUMN local_path ${db.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'}`);
    } catch {}
    // Ensure settings.value/description can hold large JSON
    try {
      await db.exec(`ALTER TABLE settings MODIFY COLUMN value ${db.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'}`);
    } catch {}
    try {
      await db.exec(`ALTER TABLE settings MODIFY COLUMN description ${db.dialect === 'mysql' ? 'LONGTEXT' : 'TEXT'}`);
    } catch {}
  }

  // 建索引（MySQL 不支持 IF NOT EXISTS，用 try/catch 忽略已存在）
  for (const sql of indexes) {
    try { await db.exec(sql); } catch {}
  }

  // ===== 种子数据 =====

  // 1. 内置默认管理员 admin / admin123（仅首次启动且无管理员时创建）
  const adminCount = await db.get('SELECT COUNT(*) AS c FROM admins');
  if (adminCount.c === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.run(
      'INSERT INTO admins (username, password_hash, nickname) VALUES (?, ?, ?)',
      'admin', hash, '超级管理员'
    );
    console.log('[db] 已创建默认管理员账号: admin / admin123（请尽快修改密码）');
  }

  // 2. 初始化默认系统配置（仅当 settings 表为空时）
  //    仅写入后台管理的可变配置；静态配置仍在 config.js
  const settingCount = await db.get('SELECT COUNT(*) AS c FROM settings');
  if (settingCount.c === 0) {
    const initSettings = [
      { key: 'defaultPoints', value: JSON.stringify(100), description: '新用户注册赠送积分' },
      { key: 'videoParams', value: JSON.stringify({
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
      }), description: '视频生成参数（时长/分辨率/比例选项及默认值）' },
      { key: 'videoPoints', value: JSON.stringify({ basePerSecond: 2, hdMultiplier: 2 }), description: '视频生成积分规则' },
      { key: 'rechargePlans', value: JSON.stringify([
        { id: 'plan_10',   price: 10,   points: 100,  bonus: 0,   label: '入门' },
        { id: 'plan_50',   price: 50,   points: 550,  bonus: 50,  label: '常用' },
        { id: 'plan_100',  price: 100,  points: 1200, bonus: 200, label: '超值' },
        { id: 'plan_200',  price: 200,  points: 2500, bonus: 500, label: '尊享' },
      ]), description: '充值套餐列表' },
      { key: 'builtinModels', value: JSON.stringify([
        // 部署在本地服务器的模型（占位符示例，将来对接本地模型服务后由后台维护）
        { id: 'local-video-lite-t2v', name: '本地视频模型 Lite 文生视频', desc: '本地部署 · 文生视频（占位）' },
        { id: 'local-video-lite-i2v', name: '本地视频模型 Lite 图生视频', desc: '本地部署 · 图生视频（占位）' },
        { id: 'local-video-pro-t2v',  name: '本地视频模型 Pro 文生视频',  desc: '本地部署 · 文生视频（占位）' },
        { id: 'local-video-pro-i2v',  name: '本地视频模型 Pro 图生视频',  desc: '本地部署 · 图生视频（占位）' },
      ]), description: '内置模型列表（本地服务器部署）' },
      { key: 'localModelService', value: JSON.stringify({
        baseURL: '', apiKey: '', enabled: false,
      }), description: '本地模型服务配置（地址/凭证，由后台管理）' },
    ];
    for (const s of initSettings) {
      const insertSql = db.dialect === 'mysql'
        ? `INSERT INTO settings (` + '\`key\`' + `, value, description) VALUES (?, ?, ?)`
        : `INSERT INTO settings (key, value, description) VALUES (?, ?, ?)`;
      try {
        await db.run(insertSql, s.key, s.value, s.description);
      } catch (err) {
        if (db.dialect === 'mysql' && err && err.code === 'ER_DATA_TOO_LONG') {
          try { await db.exec(`ALTER TABLE settings MODIFY COLUMN value LONGTEXT`); } catch {}
          try { await db.exec(`ALTER TABLE settings MODIFY COLUMN description LONGTEXT`); } catch {}
          await db.run(insertSql, s.key, s.value, s.description);
        } else throw err;
      }
    }
    console.log('[db] 已初始化默认系统配置');
  }

  // 3. 升级：迁移旧版本配置项 seedanceModels → builtinModels / ark → localModelService
  await migrateLegacySettings();

  console.log(`[db] 数据库就绪（驱动: ${db.dialect}）`);
}

/**
 * 升级：兼容旧版本配置项
 *  - seedanceModels → builtinModels（若 builtinModels 不存在则迁移）
 *  - ark            → localModelService（若 localModelService 不存在则迁移）
 *  - config.defaultPoints → settings.defaultPoints（若不存在则写入默认）
 *  - 新配置项 defaultPoints / videoParams（若 DB 不存在则写入默认值补齐）
 *  旧的 seedanceModels / ark 保留不动，不影响读取（settings.js 已做兜底）
 */
async function migrateLegacySettings() {
  // 延迟 require，避免与 settings.js 形成循环依赖
  const settings = require('./settings');

  // 迁移 seedanceModels → builtinModels
  const selKey = db.dialect === 'mysql' ? 'SELECT value FROM settings WHERE `key` = ?' : 'SELECT value FROM settings WHERE key = ?';
  const oldModelsRow = await db.get(selKey, 'seedanceModels');
  const newModelsRow = await db.get(selKey, 'builtinModels');
  if (oldModelsRow && !newModelsRow) {
    try {
      const models = JSON.parse(oldModelsRow.value);
      if (Array.isArray(models)) {
        try {
          await db.run(upsertSettingsSql(), 'builtinModels', JSON.stringify(models), Date.now());
        } catch (err) {
          if (db.dialect === 'mysql' && err && err.code === 'ER_DATA_TOO_LONG') {
            try { await db.exec(`ALTER TABLE settings MODIFY COLUMN value LONGTEXT`); } catch {}
            await db.run(upsertSettingsSql(), 'builtinModels', JSON.stringify(models), Date.now());
          } else throw err;
        }
        console.log('[db] 已迁移 seedanceModels → builtinModels');
      }
    } catch (err) {
      console.error('[db] 迁移 seedanceModels 失败:', err);
    }
  }

  // 迁移 ark → localModelService
  const oldArkRow = await db.get(selKey, 'ark');
  const newServiceRow = await db.get(selKey, 'localModelService');
  if (oldArkRow && !newServiceRow) {
    try {
      const ark = JSON.parse(oldArkRow.value);
      const service = {
        baseURL: ark.baseURL || '',
        apiKey: ark.apiKey || '',
        enabled: !!ark.apiKey,
      };
      try {
        await db.run(upsertSettingsSql(), 'localModelService', JSON.stringify(service), Date.now());
      } catch (err) {
        if (db.dialect === 'mysql' && err && err.code === 'ER_DATA_TOO_LONG') {
          try { await db.exec(`ALTER TABLE settings MODIFY COLUMN value LONGTEXT`); } catch {}
          await db.run(upsertSettingsSql(), 'localModelService', JSON.stringify(service), Date.now());
        } else throw err;
      }
      console.log('[db] 已迁移 ark → localModelService');
    } catch (err) {
      console.error('[db] 迁移 ark 失败:', err);
    }
  }

  // 补齐 defaultPoints：若 DB 不存在则写入（优先读 settings 默认值，其与 DEFAULTS 一致）
  const dftPointsRow = await db.get(selKey, 'defaultPoints');
  if (!dftPointsRow) {
    try {
      const dft = settings.get('defaultPoints');
      const insertSql = db.dialect === 'mysql'
        ? `INSERT INTO settings (` + '\`key\`' + `, value, description, updated_at) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), description = VALUES(description), updated_at = VALUES(updated_at)`
        : `INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description, updated_at = excluded.updated_at`;
      try {
        await db.run(insertSql, 'defaultPoints', JSON.stringify(dft), '新用户注册赠送积分', Date.now());
      } catch (err) {
        if (db.dialect === 'mysql' && err && err.code === 'ER_DATA_TOO_LONG') {
          try { await db.exec(`ALTER TABLE settings MODIFY COLUMN value LONGTEXT`); } catch {}
          await db.run(insertSql, 'defaultPoints', JSON.stringify(dft), '新用户注册赠送积分', Date.now());
        } else throw err;
      }
      console.log('[db] 已补齐 defaultPoints 配置（默认值：' + dft + '）');
    } catch (err) {
      console.error('[db] 补齐 defaultPoints 失败:', err);
    }
  }

  // 补齐 videoParams：若 DB 不存在则写入
  const videoParamsRow = await db.get(selKey, 'videoParams');
  if (!videoParamsRow) {
    try {
      const vd = settings.get('videoParams');
      const insertSql = db.dialect === 'mysql'
        ? `INSERT INTO settings (` + '\`key\`' + `, value, description, updated_at) VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value), description = VALUES(description), updated_at = VALUES(updated_at)`
        : `INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description, updated_at = excluded.updated_at`;
      try {
        await db.run(insertSql, 'videoParams', JSON.stringify(vd), '视频生成参数（时长/分辨率/比例选项及默认值）', Date.now());
      } catch (err) {
        if (db.dialect === 'mysql' && err && err.code === 'ER_DATA_TOO_LONG') {
          try { await db.exec(`ALTER TABLE settings MODIFY COLUMN value LONGTEXT`); } catch {}
          await db.run(insertSql, 'videoParams', JSON.stringify(vd), '视频生成参数（时长/分辨率/比例选项及默认值）', Date.now());
        } else throw err;
      }
      console.log('[db] 已补齐 videoParams 配置');
    } catch (err) {
      console.error('[db] 补齐 videoParams 失败:', err);
    }
  }
}

module.exports = db;
module.exports.initDb = initDb;
module.exports.upsertSettingsSql = upsertSettingsSql;
module.exports.upsertUserSettingsSql = upsertUserSettingsSql;
