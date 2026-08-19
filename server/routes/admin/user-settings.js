/**
 * 用户自定义模型配置管理路由（管理员）
 *  - GET /api/admin/user-settings   列出所有用户的自定义模型配置（解密后返回）
 *
 * 数据来源：user_settings 表，key = 'videoConfig'（AES-256-GCM 加密存储）
 * 管理员可查看各用户配置的 baseURL / apiKey / modelId / videoProvider，
 * 用于排查"自定义模型无法使用"等问题。
 */
const express = require('express');
const db = require('../../db');
const { decrypt } = require('../../crypto');
const { adminRequired } = require('../../middleware/adminAuth');

const router = express.Router();

const KEY_COL = db.dialect === 'mysql' ? '`key`' : 'key';
const CUSTOM_MODEL_KEY = 'videoConfig';

router.get('/', adminRequired, async (req, res) => {
  const { keyword } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  // JOIN users 表获取用户名/昵称，仅取 videoConfig 这一条
  let where = `WHERE us.${KEY_COL} = ?`;
  const params = [CUSTOM_MODEL_KEY];
  if (keyword) {
    where += ' AND (u.username LIKE ? OR u.nickname LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw);
  }

  const totalRow = await db.get(
    `SELECT COUNT(*) AS c FROM user_settings us LEFT JOIN users u ON u.id = us.user_id ${where}`,
    ...params
  );

  const rows = await db.all(
    `SELECT us.user_id, us.value, us.updated_at, u.username, u.nickname
     FROM user_settings us
     LEFT JOIN users u ON u.id = us.user_id
     ${where}
     ORDER BY us.updated_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    ...params
  );

  // 解密每条记录
  const list = rows.map((row) => {
    let config = null;
    try {
      const json = decrypt(row.value);
      config = JSON.parse(json);
    } catch {
      config = null;
    }
    return {
      userId: row.user_id,
      username: row.username,
      nickname: row.nickname,
      videoProvider: config?.videoProvider || '-',
      customVideo: config?.customVideo || null,
      updatedAt: row.updated_at,
    };
  });

  res.json({
    list,
    total: totalRow.c,
    page,
    pageSize,
  });
});

module.exports = router;
