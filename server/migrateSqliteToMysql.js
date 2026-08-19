/**
 * 一次性迁移脚本：将 SQLite 数据迁移到 MySQL
 *
 * 用法（Windows PowerShell）：
 *   $env:DB_DRIVER="mysql"
 *   $env:DB_HOST="127.0.0.1"
 *   $env:DB_PORT="3306"
 *   $env:DB_USER="root"
 *   $env:DB_PASSWORD="你的密码"
 *   $env:DB_NAME="stunning"
 *   node --experimental-sqlite server/migrateSqliteToMysql.js
 *
 * 可选参数：
 *   --dry-run    仅统计源数据行数，不写入目标库
 *   --no-reset   不清空目标表（默认会先 TRUNCATE，避免唯一键冲突）
 *
 * 设计要点：
 *   1. 复用项目统一 async 接口（db.get/all/run/transaction），不写方言相关 SQL
 *   2. 显式插入 id，保证外键关系不变
 *   3. 按依赖顺序迁移：users/admins → video_tasks/recharge_orders/feedback → settings
 *   4. 每张表一个事务，失败可单独重试
 *   5. 默认先 TRUNCATE 目标表，保证幂等可重跑
 */
const path = require('path');
const { SqliteAdapter } = require('./db/sqliteAdapter');
const config = require('./config');

// 目标库：require('./db') 会按 DB_DRIVER=mysql 初始化 adapter
// 注意：必须先确认 DB_DRIVER=mysql，否则会把数据写回 SQLite
const db = require('./db');
const { upsertSettingsSql } = db;

// 源库：直接实例化 SQLite adapter，读取本地 db 文件
const sqlite = new SqliteAdapter({
  dbPath: path.join(__dirname, 'data', 'stunning.db'),
});

// 迁移顺序（被依赖的表在前）
const TABLES_ORDER = [
  'users',
  'admins',
  'video_tasks',
  'recharge_orders',
  'feedback',
];

// 命令行参数解析
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const NO_RESET = argv.includes('--no-reset');

/**
 * 预检：确认目标驱动是 mysql，避免误写回 SQLite
 */
function preflight() {
  if (config.db.driver !== 'mysql') {
    console.error('[fatal] 当前 DB_DRIVER=' + config.db.driver + '，必须设为 mysql 才能迁移。');
    console.error('       请设置环境变量 DB_DRIVER=mysql 后重试。');
    process.exit(1);
  }
  console.log('[preflight] 目标驱动: mysql');
  console.log('[preflight] 目标库: ' + config.db.mysql.host + ':' + config.db.mysql.port + '/' + config.db.mysql.database);
  console.log('[preflight] 源 SQLite: ' + config.db.sqlite.dbPath);
  if (DRY_RUN) console.log('[preflight] DRY-RUN 模式：仅统计不写入');
  if (NO_RESET) console.log('[preflight] 不重置目标表（可能因唯一键冲突失败）');
}

/**
 * 清空目标表（按外键反序 truncate，避免约束报错）
 */
async function resetTargetTables() {
  if (NO_RESET || DRY_RUN) return;
  console.log('[reset] 清空目标表...');
  // 先关闭外键检查，避免依赖顺序问题
  await db.exec('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of [...TABLES_ORDER].reverse()) {
    await db.exec('TRUNCATE TABLE ' + t);
    console.log('  [reset] TRUNCATE ' + t);
  }
  await db.exec('TRUNCATE TABLE settings');
  console.log('  [reset] TRUNCATE settings');
  await db.exec('SET FOREIGN_KEY_CHECKS = 1');
}

/**
 * 通用表迁移：SELECT * → 显式插入所有列（含 id）
 */
async function copyTable(name) {
  const rows = await sqlite.all('SELECT * FROM ' + name);
  if (!rows.length) {
    console.log('[skip] ' + name + ': 0 行');
    return 0;
  }

  if (DRY_RUN) {
    console.log('[dry-run] ' + name + ': ' + rows.length + ' 行（不写入）');
    return rows.length;
  }

  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => '?').join(', ');
  const colList = cols.map(c => '`' + c + '`').join(', '); // MySQL 用反引号
  const sql = 'INSERT INTO ' + name + ' (' + colList + ') VALUES (' + placeholders + ')';

  let inserted = 0;
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.run(sql, ...cols.map(c => row[c]));
      inserted++;
    }
  });
  console.log('[ok] ' + name + ': ' + inserted + ' 行');
  return inserted;
}

/**
 * settings 表迁移：用 upsertSettingsSql() 处理 ON DUPLICATE KEY
 * 注意 settings 没有 id 列，主键是 key
 */
async function copySettings() {
  const rows = await sqlite.all('SELECT key, value, description, updated_at FROM settings');
  if (!rows.length) {
    console.log('[skip] settings: 0 行');
    return 0;
  }

  if (DRY_RUN) {
    console.log('[dry-run] settings: ' + rows.length + ' 行（不写入）');
    return rows.length;
  }

  const upsert = upsertSettingsSql();
  let inserted = 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.run(upsert, r.key, r.value, r.updated_at);
      inserted++;
    }
  });
  console.log('[ok] settings: ' + inserted + ' 行');
  return inserted;
}

/**
 * 校验：对比源/目标各表行数
 */
async function verify() {
  console.log('\n[verify] 行数对比：');
  const allTables = [...TABLES_ORDER, 'settings'];
  let ok = true;
  for (const t of allTables) {
    const srcCount = (await sqlite.get('SELECT COUNT(*) AS c FROM ' + t)).c;
    if (DRY_RUN) {
      console.log('  ' + t + ': 源=' + srcCount + '（dry-run 不校验目标）');
      continue;
    }
    const dstCount = (await db.get('SELECT COUNT(*) AS c FROM ' + t)).c;
    const match = srcCount === dstCount ? 'OK' : 'MISMATCH';
    if (srcCount !== dstCount) ok = false;
    console.log('  ' + t + ': 源=' + srcCount + ' 目标=' + dstCount + ' [' + match + ']');
  }
  return ok;
}

(async () => {
  try {
    preflight();

    // 1. 在 MySQL 上建表 + 种子（initDb 内部已 CREATE TABLE IF NOT EXISTS）
    if (!DRY_RUN) {
      console.log('\n[init] 在 MySQL 上初始化表结构...');
      await db.initDb();
    }

    // 2. 清空目标表
    await resetTargetTables();

    // 3. 按依赖顺序迁移
    console.log('\n[migrate] 开始迁移数据...');
    const stats = {};
    for (const t of TABLES_ORDER) {
      stats[t] = await copyTable(t);
    }
    stats.settings = await copySettings();

    // 4. 校验
    const ok = await verify();

    await sqlite.close();
    if (!DRY_RUN) await db.close();

    if (DRY_RUN) {
      console.log('\n[dry-run] 预览完成，未写入任何数据。');
    } else if (ok) {
      console.log('\n迁移完成，行数校验通过。');
    } else {
      console.log('\n迁移完成，但行数校验有不一致，请检查。');
      process.exitCode = 2;
    }
    process.exit(0);
  } catch (err) {
    console.error('\n[fatal] 迁移失败:', err);
    try { await sqlite.close(); } catch {}
    try { await db.close(); } catch {}
    process.exit(1);
  }
})();
