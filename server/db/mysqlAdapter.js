/**
 * MySQL Adapter
 *
 * 基于 mysql2/promise（连接池），实现与 SQLite adapter 一致的 async 接口。
 * 业务层代码无需关心底层数据库类型。
 *
 * 依赖：npm install mysql2
 * 要求：MySQL 8.0+（建表使用 DEFAULT 表达式）
 */
const mysql = require('mysql2/promise');

class MysqlAdapter {
  constructor(opts) {
    this.dialect = 'mysql';
    this.pool = mysql.createPool({
      host: opts.host || '127.0.0.1',
      port: opts.port || 3306,
      user: opts.user,
      password: opts.password,
      database: opts.database,
      waitForConnections: true,
      connectionLimit: opts.connectionLimit || 10,
      charset: 'utf8mb4',
      timezone: 'Z',
    });
  }

  /** 当前时间戳的 SQL 表达式（用于建表 DEFAULT） */
  get nowExpr() {
    return '(UNIX_TIMESTAMP() * 1000)';
  }

  async exec(sql) {
    // DDL 语句用 query（execute 对 DDL 支持不佳）
    await this.pool.query(sql);
  }

  async run(sql, ...params) {
    const [result] = await this.pool.execute(sql, params);
    return {
      lastInsertRowid: result.insertId,
      changes: result.affectedRows,
    };
  }

  async get(sql, ...params) {
    const [rows] = await this.pool.execute(sql, params);
    return rows[0];
  }

  async all(sql, ...params) {
    const [rows] = await this.pool.execute(sql, params);
    return rows;
  }

  /**
   * 事务：从连接池获取独立连接，使用 beginTransaction/commit/rollback
   * fn 接收一个 tx 对象，具有与本对象相同的 exec/run/get/all 方法（绑定到该连接）
   */
  async transaction(fn) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const tx = {
        exec: (sql) => conn.query(sql),
        run: async (sql, ...p) => {
          const [r] = await conn.execute(sql, p);
          return { lastInsertRowid: r.insertId, changes: r.affectedRows };
        },
        get: async (sql, ...p) => {
          const [rows] = await conn.execute(sql, p);
          return rows[0];
        },
        all: async (sql, ...p) => {
          const [rows] = await conn.execute(sql, p);
          return rows;
        },
      };
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (err) {
      try { await conn.rollback(); } catch {}
      throw err;
    } finally {
      conn.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { MysqlAdapter };
