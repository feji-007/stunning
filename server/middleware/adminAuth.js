/**
 * 管理员鉴权中间件
 *
 * 与普通用户鉴权（middleware/auth.js）独立，使用管理员专属 JWT。
 * 管理员登录后获得 { admin: true } 标记的 token，此中间件校验该标记。
 */
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * 校验管理员 token
 * token 必须包含 admin: true 标记
 */
function adminRequired(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.admin) {
      return res.status(403).json({ error: '无管理员权限' });
    }
    req.admin = { id: payload.sub, username: payload.username, nickname: payload.nickname };
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

module.exports = { adminRequired };
