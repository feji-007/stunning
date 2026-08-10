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

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id            ${PK},
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      nickname      TEXT    NOT NULL DEFAULT '',
      avatar        TEXT    NOT NULL DEFAULT '',
      points        INTEGER NOT NULL DEFAULT ${config.defaultPoints},
      created_at    INTEGER NOT NULL DEFAULT (${NOW}),
      updated_at    INTEGER NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS video_tasks (
      id            ${PK},
      user_id       INTEGER NOT NULL,
      ark_task_id   TEXT,
      provider      TEXT    NOT NULL DEFAULT 'seedance',
      model         TEXT,
      prompt        TEXT    NOT NULL DEFAULT '',
      params        TEXT,
      status        TEXT    NOT NULL DEFAULT 'queued',
      video_url     TEXT,
      points_cost   INTEGER NOT NULL DEFAULT 0,
      refunded      INTEGER NOT NULL DEFAULT 0,
      error         TEXT,
      created_at    INTEGER NOT NULL DEFAULT (${NOW}),
      updated_at    INTEGER NOT NULL DEFAULT (${NOW}),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS recharge_orders (
      id            ${PK},
      order_no      TEXT    NOT NULL UNIQUE,
      user_id       INTEGER NOT NULL,
      plan_id       TEXT    NOT NULL,
      price         INTEGER NOT NULL,
      points        INTEGER NOT NULL,
      bonus         INTEGER NOT NULL DEFAULT 0,
      status        TEXT    NOT NULL DEFAULT 'pending',
      paid_at       INTEGER,
      created_at    INTEGER NOT NULL DEFAULT (${NOW}),
      updated_at    INTEGER NOT NULL DEFAULT (${NOW}),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS admins (
      id            ${PK},
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      nickname      TEXT    NOT NULL DEFAULT '管理员',
      created_at    INTEGER NOT NULL DEFAULT (${NOW}),
      updated_at    INTEGER NOT NULL DEFAULT (${NOW})
    )`,

    `CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      description TEXT,
      updated_at  INTEGER NOT NULL DEFAULT (${NOW})
    )`,
  ];

  // 索引：SQLite 支持 IF NOT EXISTS，MySQL 不支持（用 try/catch 忽略重复）
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_video_tasks_user ON video_tasks(user_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_recharge_orders_user ON recharge_orders(user_id, created_at)',
  ];

  return { tables, indexes };
}

// ===== UPSERT SQL（方言差异）=====
function upsertSettingsSql() {
  if (db.dialect === 'mysql') {
    return `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`;
  }
  return `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;
}

// ===== 初始化：建表 + 种子数据 =====
async function initDb() {
  const { tables, indexes } = buildSchema();

  // 清理已废弃的旧表（旧版本含 AI Agent 功能，已移除）
  await db.exec('DROP TABLE IF EXISTS agent_messages');
  await db.exec('DROP TABLE IF EXISTS agents');

  // 建表
  for (const sql of tables) {
    await db.exec(sql);
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
  const settingCount = await db.get('SELECT COUNT(*) AS c FROM settings');
  if (settingCount.c === 0) {
    const initSettings = [
      { key: 'ark', value: JSON.stringify(config.ark), description: '火山方舟 API 配置（内置模型）' },
      { key: 'videoPoints', value: JSON.stringify(config.videoPoints), description: '视频生成积分规则' },
      { key: 'rechargePlans', value: JSON.stringify(config.rechargePlans), description: '充值套餐列表' },
      { key: 'seedanceModels', value: JSON.stringify([
        // Seedance 1.x（免费，无需 API Key）
        { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生视频', desc: '1.0 Pro 文生视频（免费）' },
        { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生视频', desc: '1.0 Lite 文生视频（免费）' },
        { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生视频', desc: '1.0 Pro 图生视频（免费）' },
        { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生视频', desc: '1.0 Lite 图生视频（免费）' },
        // Seedance 2.0（消耗积分，需 API Key）
        { id: 'doubao-seedance-2-0-pro', name: 'Seedance 2.0 Pro', desc: '更高质量（消耗积分）' },
        { id: 'doubao-seedance-2-0-fast', name: 'Seedance 2.0 Fast', desc: '更快速度（消耗积分）' },
      ]), description: '内置可选 Seedance 模型列表' },
    ];
    for (const s of initSettings) {
      await db.run('INSERT INTO settings (key, value, description) VALUES (?, ?, ?)', s.key, s.value, s.description);
    }
    console.log('[db] 已初始化默认系统配置');
  }

  // 3. 升级：补入测试充值套餐（plan_test）
  const TEST_PLAN = { id: 'plan_test', price: 1, points: 9999, bonus: 0, label: '测试套餐' };
  const plansRow = await db.get('SELECT value FROM settings WHERE key = ?', 'rechargePlans');
  if (plansRow) {
    try {
      const plans = JSON.parse(plansRow.value);
      if (Array.isArray(plans) && !plans.find((p) => p.id === TEST_PLAN.id)) {
        plans.push(TEST_PLAN);
        await db.run(upsertSettingsSql(), 'rechargePlans', JSON.stringify(plans), Date.now());
        console.log('[db] 已补入测试充值套餐:', TEST_PLAN.id);
      }
    } catch (err) {
      console.error('[db] 补入测试套餐失败:', err);
    }
  }

  await upgradeSeedanceModels();

  console.log(`[db] 数据库就绪（驱动: ${db.dialect}）`);
}

/**
 * 升级：确保 seedanceModels 包含 Seedance 1.0 系列模型
 * 适用于已初始化的旧库（settings 已存在但仅含 2.0 模型）
 */
const SEEDANCE_1_0_MODELS = [
  { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生视频', desc: '1.0 Pro 文生视频' },
  { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生视频', desc: '1.0 Pro 图生视频' },
  { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生视频', desc: '1.0 Lite 文生视频' },
  { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生视频', desc: '1.0 Lite 文生视频' },
];

async function upgradeSeedanceModels() {
  const modelsRow = await db.get('SELECT value FROM settings WHERE key = ?', 'seedanceModels');
  if (!modelsRow) return;

  try {
    const models = JSON.parse(modelsRow.value);
    if (!Array.isArray(models)) return;

    let changed = false;
    for (const m of SEEDANCE_1_0_MODELS) {
      if (!models.find((x) => x.id === m.id)) {
        models.push(m);
        changed = true;
      }
    }

    if (changed) {
      await db.run(upsertSettingsSql(), 'seedanceModels', JSON.stringify(models), Date.now());
      console.log('[db] 已补入 Seedance 1.0 系列模型');
    }
  } catch (err) {
    console.error('[db] 补入 Seedance 1.0 模型失败:', err);
  }
}

module.exports = db;
module.exports.initDb = initDb;
module.exports.upsertSettingsSql = upsertSettingsSql;
