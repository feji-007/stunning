/**
 * 服务器配置
 *
 * 仅保留静态配置（端口、DB、JWT 等）。
 * 运行时可变配置（积分规则、充值套餐、内置模型列表等）
 * 全部由后台管理界面维护，存于数据库 settings 表，参见 settings.js。
 *
 * 客户端只通过账号密码登录，拿到 JWT 后访问业务接口；
 * 内置模型由本地服务器部署，无需用户配置任何 url / api_key。
 */
const path = require('path');
const fs = require('fs');

// SQLite 数据库文件目录：优先用项目内 ./data，确保可写
const DATA_DIR = process.env.STUNNING_DATA_DIR || path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

module.exports = {
  // HTTP 监听端口
  port: parseInt(process.env.PORT || '3001', 10),

  // ===== 数据库配置（支持 SQLite / MySQL 切换）=====
  // 通过环境变量 DB_DRIVER 选择驱动：'sqlite'（默认）或 'mysql'
  // 数据库连接信息全部留在服务器，客户端无感
  db: {
    driver: (process.env.DB_DRIVER || 'mysql').toLowerCase(),
    sqlite: {
      // SQLite 数据库文件路径
      dbPath: path.join(DATA_DIR, 'stunning.db'),
    },
    mysql: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123456',
      database: process.env.DB_NAME || 'stunning',
      connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    },
  },
  // 保留 dbPath 用于日志输出（SQLite 模式）
  dbPath: path.join(DATA_DIR, 'stunning.db'),

  // JWT 签名密钥（生产环境请通过环境变量覆盖）
  jwtSecret: process.env.JWT_SECRET || 'stunning-dev-secret-change-me',

  // Token 有效期
  jwtExpiresIn: '7d',
};
