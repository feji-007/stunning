/**
 * 服务器配置
 *
 * 数据库连接信息（SQLite 文件路径）、JWT 密钥、AI Agent 调用的 LLM 端点
 * 全部留在此处 —— 客户端无需、也无法感知这些信息（类似 QQ/微信的后端连接）。
 * 客户端只通过账号密码登录，拿到 JWT 后访问业务接口。
 */
const path = require('path');
const fs = require('fs');

// 数据库文件目录：优先用项目内 ./data，确保可写
const DATA_DIR = process.env.STUNNING_DATA_DIR || path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

module.exports = {
  // HTTP 监听端口
  port: parseInt(process.env.PORT || '3001', 10),

  // SQLite 数据库文件路径（部署在服务器上）
  dbPath: path.join(DATA_DIR, 'stunning.db'),

  // JWT 签名密钥（生产环境请通过环境变量覆盖）
  jwtSecret: process.env.JWT_SECRET || 'stunning-dev-secret-change-me',

  // Token 有效期
  jwtExpiresIn: '7d',

  // 默认新用户积分
  defaultPoints: 100,

  // AI Agent 对话所调用的 OpenAI 兼容 LLM 端点
  // 默认指向桌面应用自带的本地 API 服务器（端口 1234），
  // 也可改为任意 OpenAI 兼容服务（如官方 OpenAI、方舟、自建 vLLM 等）。
  llm: {
    baseURL: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
    apiKey: process.env.LLM_API_KEY || 'stunning',
    model: process.env.LLM_MODEL || 'local',
  },
};
