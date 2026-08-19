/**
 * 加密 / 解密工具
 *
 * 用于在数据库中安全存储用户敏感配置（如自定义模型 API Key）。
 * 使用 AES-256-GCM 对称加密，密钥从 config.jwtSecret 派生（scrypt）。
 *
 * 加密结果打包为 JSON 字符串 { iv, data, tag }（均为 base64），
 * 可直接存入数据库 TEXT 列。
 */
const crypto = require('crypto');
const config = require('./config');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;   // 256 bit
const IV_LENGTH = 12;    // 96 bit (GCM 推荐)
const SALT = 'stunning-user-settings-salt';

// 从 jwtSecret 派生固定长度的加密密钥（与 JWT 签名密钥隔离）
const KEY = crypto.scryptSync(config.jwtSecret, SALT, KEY_LENGTH);

/**
 * 加密明文字符串
 * @param {string} text
 * @returns {string} JSON 字符串 { iv, data, tag }
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
}

/**
 * 解密 { iv, data, tag } JSON 字符串，返回明文
 * @param {string} packed
 * @returns {string}
 */
function decrypt(packed) {
  const { iv, data, tag } = JSON.parse(packed);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
