/**
 * 绝色（Stunning）后端服务器入口
 *
 * 提供：
 *   - 用户认证（注册 / 登录，JWT）
 *   - 用户资料 / 头像 / 积分
 *   - 内置 Seedance 视频生成（服务器持有方舟 Key，消耗用户积分）
 *   - SQLite 数据库（部署在服务器上，客户端无感）
 *
 * 启动：  cd server && npm install && npm start
 */
const express = require('express');
const cors = require('cors');
const config = require('./config');

// 初始化数据库（建表）
require('./db');

const app = express();

app.use(cors());
app.use(express.json({ limit: '8mb' }));

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'stunning-server', time: Date.now() });
});

// 路由挂载
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/video', require('./routes/video'));
app.use('/api/recharge', require('./routes/recharge'));

// 管理后台 API
app.use('/api/admin', require('./routes/admin'));

// 统一错误处理
app.use((err, _req, res, _next) => {
  console.error('[server] 未捕获错误:', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(config.port, () => {
  console.log(`[stunning-server] 已启动: http://localhost:${config.port}`);
  console.log(`[stunning-server] 数据库: ${config.dbPath}`);
  console.log(`[stunning-server] 内置 Seedance: ${config.ark.baseURL} (模型 ${config.ark.defaultModel})`);
  if (!config.ark.apiKey) {
    console.warn('[stunning-server] ⚠️  未配置 ARK_API_KEY，内置 Seedance 视频生成将不可用');
  }
});
