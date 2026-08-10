/**
 * SQLite Adapter
 *
 * 基于 Node 22.5+ 内置的 node:sqlite（DatabaseSync，同步 API）。
 * 本文件将其包装为与其他 adapter 一致的 async 接口（run/get/all/transaction），
 * 使业务层代码无需关心底层数据库类型。
 *
 * 启动需加 --experimental-sqlite 标志。
 */
const { DatabaseSync } = require('node:sqlite');

class SqliteAdapter {
  constructor(opts) {
    this.dialect = 'sqlite';
    this.db = new DatabaseSync(opts.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  /** 当前时间戳的 SQL 表达式（用于建表 DEFAULT） */
  get nowExpr() {
    return "(strftime('%s','now') * 1000)";
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  async run(sql, ...params) {
    const r = this.db.prepare(sql).run(...params);
    return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
  }

  async get(sql, ...params) {
    return this.db.prepare(sql).get(...params);
  }

  async all(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  /**
   * 事务：SQLite 使用 BEGIN / COMMIT / ROLLBACK
   * fn 接收一个与本对象接口相同的 tx 对象
   */
  async transaction(fn) {
    this.db.exec('BEGIN');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw err;
    }
  }

  async close() {
    this.db.close();
  }
}

module.exports = { SqliteAdapter };
