/**
 * SQLite 数据库连接 + 表结构 + 种子数据
 *
 * 使用 Node 22.5+ 内置的 `node:sqlite`（无需安装任何原生依赖）。
 * 启动需加 --experimental-sqlite 标志（已配置在 package.json 的 scripts 中）。
 *
 * 表：
 *   - users          用户（账号、密码哈希、昵称、头像、积分）
 *   - video_tasks    视频生成任务（内置 Seedance 调用记录，用于积分扣减与审计）
 *
 * 数据库文件部署在服务器上，客户端不直接访问。
 */
const config = require('./config');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.error('[db] 无法加载 node:sqlite，请使用 Node 22.5+ 并加 --experimental-sqlite 标志启动');
  throw err;
}

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ===== 清理已废弃的旧表（旧版本含 AI Agent 功能，已移除）=====
db.exec(`
  DROP TABLE IF EXISTS agent_messages;
  DROP TABLE IF EXISTS agents;
`);

// ===== 建表 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    nickname      TEXT    NOT NULL DEFAULT '',
    avatar        TEXT    NOT NULL DEFAULT '',
    points        INTEGER NOT NULL DEFAULT ${config.defaultPoints},
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS video_tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    ark_task_id   TEXT,                       -- 方舟任务 ID
    provider      TEXT    NOT NULL DEFAULT 'seedance',  -- 'seedance'（内置）
    model         TEXT,
    prompt        TEXT    NOT NULL DEFAULT '',
    params        TEXT,                       -- JSON 字符串，生成参数
    status        TEXT    NOT NULL DEFAULT 'queued',     -- queued|running|succeeded|failed
    video_url     TEXT,                       -- 成功后的视频下载地址
    points_cost   INTEGER NOT NULL DEFAULT 0, -- 预扣积分
    refunded      INTEGER NOT NULL DEFAULT 0, -- 失败是否已退还
    error         TEXT,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_video_tasks_user
    ON video_tasks(user_id, created_at);

  -- 充值订单（模拟支付）
  CREATE TABLE IF NOT EXISTS recharge_orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no      TEXT    NOT NULL UNIQUE,    -- 业务订单号
    user_id       INTEGER NOT NULL,
    plan_id       TEXT    NOT NULL,           -- 套餐 ID
    price         INTEGER NOT NULL,           -- 金额（元）
    points        INTEGER NOT NULL,           -- 到账积分（含赠送）
    bonus         INTEGER NOT NULL DEFAULT 0, -- 赠送积分
    status        TEXT    NOT NULL DEFAULT 'pending',  -- pending|paid|cancelled
    paid_at       INTEGER,                    -- 支付完成时间
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_recharge_orders_user
    ON recharge_orders(user_id, created_at);

  -- 管理员账号（独立体系，与普通用户隔离）
  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    nickname      TEXT    NOT NULL DEFAULT '管理员',
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  -- 系统配置（key-value，value 存 JSON 字符串）
  -- 由后台管理界面维护，运行时实时读取
  CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,           -- JSON 字符串
    description TEXT,
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
`);

// ===== 种子数据 =====

/**
 * 内置默认管理员账号 admin / admin123（仅首次启动且无管理员时创建）
 */
const bcrypt = require('bcryptjs');
const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
if (adminCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO admins (username, password_hash, nickname) VALUES (?, ?, ?)
  `).run('admin', hash, '超级管理员');
  console.log('[db] 已创建默认管理员账号: admin / admin123（请尽快修改密码）');
}

/**
 * 初始化默认系统配置（仅当 settings 表为空时）
 * 把 config.js 中的 ark / videoPoints / rechargePlans 写入数据库，之后由后台管理
 */
const settingCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
if (settingCount === 0) {
  const config = require('./config');
  const initSettings = [
    { key: 'ark', value: JSON.stringify(config.ark), description: '火山方舟 API 配置（内置 Seedance）' },
    { key: 'videoPoints', value: JSON.stringify(config.videoPoints), description: '视频生成积分规则' },
    { key: 'rechargePlans', value: JSON.stringify(config.rechargePlans), description: '充值套餐列表' },
    { key: 'seedanceModels', value: JSON.stringify([
      { id: 'doubao-seedance-2-0-pro', name: 'Seedance 2.0 Pro', desc: '更高质量' },
      { id: 'doubao-seedance-2-0-fast', name: 'Seedance 2.0 Fast', desc: '更快速度' },
      { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生视频', desc: '1.0 Pro 文生视频' },
      { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生视频', desc: '1.0 Pro 图生视频' },
      { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生视频', desc: '1.0 Lite 文生视频' },
      { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生视频', desc: '1.0 Lite 图生视频' },
    ]), description: '内置可选 Seedance 模型列表' },
  ];
  const stmt = db.prepare(`INSERT INTO settings (key, value, description) VALUES (?, ?, ?)`);
  for (const s of initSettings) stmt.run(s.key, s.value, s.description);
  console.log('[db] 已初始化默认系统配置');
}

/**
 * 升级：确保充值套餐中包含测试套餐（plan_test）
 * 适用于已初始化的旧库（settings 已存在但 rechargePlans 无测试套餐）
 * 1 元换 9999 积分，仅用于测试充值流程
 */
const TEST_PLAN = { id: 'plan_test', price: 1, points: 9999, bonus: 0, label: '测试套餐' };
const plansRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('rechargePlans');
if (plansRow) {
  try {
    const plans = JSON.parse(plansRow.value);
    if (Array.isArray(plans) && !plans.find((p) => p.id === TEST_PLAN.id)) {
      plans.push(TEST_PLAN);
      db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%s','now') * 1000)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run('rechargePlans', JSON.stringify(plans));
      console.log('[db] 已补入测试充值套餐:', TEST_PLAN.id);
    }
  } catch (err) {
    console.error('[db] 补入测试套餐失败:', err);
  }
}

/**
 * 升级：确保 seedanceModels 包含 Seedance 1.0 系列模型
 * 适用于已初始化的旧库（settings 已存在但仅含 2.0 模型）
 */
const SEEDANCE_1_0_MODELS = [
  { id: 'seedance-1-0-pro-t2v', name: 'Seedance 1.0 Pro 文生视频', desc: '1.0 Pro 文生视频' },
  { id: 'seedance-1-0-pro-i2v', name: 'Seedance 1.0 Pro 图生视频', desc: '1.0 Pro 图生视频' },
  { id: 'seedance-1-0-lite-t2v', name: 'Seedance 1.0 Lite 文生视频', desc: '1.0 Lite 文生视频' },
  { id: 'seedance-1-0-lite-i2v', name: 'Seedance 1.0 Lite 图生视频', desc: '1.0 Lite 图生视频' },
];
const modelsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('seedanceModels');
if (modelsRow) {
  try {
    const models = JSON.parse(modelsRow.value);
    if (Array.isArray(models)) {
      let changed = false;
      for (const m of SEEDANCE_1_0_MODELS) {
        if (!models.find((x) => x.id === m.id)) {
          models.push(m);
          changed = true;
        }
      }
      if (changed) {
        db.prepare(`
          INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%s','now') * 1000)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run('seedanceModels', JSON.stringify(models));
        console.log('[db] 已补入 Seedance 1.0 系列模型');
      }
    }
  } catch (err) {
    console.error('[db] 补入 Seedance 1.0 模型失败:', err);
  }
}

module.exports = db;
