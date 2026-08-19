/**
 * 视频历史记录本地持久化
 *
 * 由于视频的 localPath（下载到本地磁盘的路径）是纯客户端概念，
 * 且自定义模型不走后端服务器，因此历史记录在客户端本地持久化，
 * 以独立 JSON 文件存储（与 config.json 同目录），保留最近 50 条。
 */
const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./configStore');

const HISTORY_FILE = path.join(CONFIG_DIR, 'video-history.json');
const MAX_RECORDS = 50;

/**
 * 读取历史记录（按创建时间倒序）
 * 自动过滤本地文件已不存在的记录，避免播放 404。
 */
function getHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // 过滤掉本地视频文件已被删除的记录
    const valid = list.filter((r) => r && r.localPath && fs.existsSync(r.localPath));
    // 若过滤后数量变化，回写一次保持文件整洁
    if (valid.length !== list.length) saveAll(valid);
    return valid;
  } catch (err) {
    console.error('[videoHistoryStore] 读取失败:', err);
    return [];
  }
}

/**
 * 追加一条记录到历史（倒序，保留最近 MAX_RECORDS 条）
 */
function addRecord(record) {
  if (!record || !record.localPath) return getHistory();
  const list = getHistory();
  // 去重：相同 localPath 视为同一条，移到最前
  const filtered = list.filter((r) => r.localPath !== record.localPath);
  const next = [record, ...filtered].slice(0, MAX_RECORDS);
  saveAll(next);
  return next;
}

function saveAll(list) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('[videoHistoryStore] 写入失败:', err);
  }
}

/**
 * 清空全部历史
 */
function clearHistory() {
  saveAll([]);
  return [];
}

module.exports = { getHistory, addRecord, clearHistory };
