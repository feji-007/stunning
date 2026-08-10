/**
 * 服务器配置
 *
 * 数据库连接信息、JWT 密钥、内置模型视频生成的方舟 API 凭证
 * 全部留在此处 —— 客户端无需、也无法感知这些信息。
 *
 * 客户端只通过账号密码登录，拿到 JWT 后访问业务接口；
 * 内置模型视频生成由服务器调用方舟 API（1.0 免费不扣积分，2.0 按规则扣减积分）。
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
    driver: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
    sqlite: {
      // SQLite 数据库文件路径
      dbPath: path.join(DATA_DIR, 'stunning.db'),
    },
    mysql: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
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

  // 默认新用户积分
  defaultPoints: 100,

  // 内置模型视频生成 —— 火山引擎方舟 API 凭证
  // 由服务器统一调用，客户端无需自己的 Key。
  // - Seedance 1.0 系列（seedance-1-0-*）：免费，不消耗积分
  // - Seedance 2.0 系列（doubao-seedance-2-0-*）：消耗积分，需配置 ARK_API_KEY
  ark: {
    baseURL: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: process.env.ARK_API_KEY || '',
    // 内置默认模型（Seedance 1.0 Lite 文生视频，免费）
    defaultModel: process.env.ARK_MODEL || 'seedance-1-0-lite-t2v',
  },

  // 视频生成积分扣减规则（仅 Seedance 2.0 系列生效，1.0 免费模型不扣积分）
  // 计算公式：duration(秒) × basePerSecond × (resolution==='1080p' ? hdMultiplier : 1)
  videoPoints: {
    basePerSecond: 2,   // 每秒基础消耗 2 积分
    hdMultiplier: 2,    // 1080p 分辨率倍率
  },

  // 充值套餐（固定套餐，price 单位：元）
  // points 为实际到账积分（含赠送）
  rechargePlans: [
    { id: 'plan_10',   price: 10,   points: 100,  bonus: 0,   label: '入门' },
    { id: 'plan_50',   price: 50,   points: 550,  bonus: 50,  label: '常用' },
    { id: 'plan_100',  price: 100,  points: 1200, bonus: 200, label: '超值' },
    { id: 'plan_200',  price: 200,  points: 2500, bonus: 500, label: '尊享' },
    { id: 'plan_test', price: 1,    points: 9999, bonus: 0,   label: '测试套餐' },
  ],
};
