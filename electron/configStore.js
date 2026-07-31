const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * 应用配置持久化
 * 优先保存到 ~/.stunning/config.json；沙箱环境下自动回退到项目目录下的 .data/config.json
 */

// 尝试候选目录，直到找到一个可写的
function resolveWritableDir(suffix, fallback) {
  const candidates = [];
  try {
    candidates.push(path.join(os.homedir(), '.stunning', suffix));
  } catch {}
  try {
    candidates.push(path.join(process.cwd(), '.data', suffix));
  } catch {}
  try {
    candidates.push(fallback);
  } catch {}

  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.probe_' + Date.now());
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
      return dir;
    } catch {}
  }
  return path.join(os.tmpdir(), 'stunning', suffix);
}

const CONFIG_DIR = resolveWritableDir('', null);
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  // 火山引擎方舟 API Key（在 https://console.volcengine.com/ark 创建）
  arkApiKey: '',
  // 视频生成模型 ID，默认 Seedance 2.0 Pro
  videoModelId: 'doubao-seedance-2-0-pro',
  // 备选模型：doubao-seedance-2-0-fast
  // 默认生成参数
  videoDefaults: {
    duration: 5,            // 秒数：5 或 10
    resolution: '720p',     // 720p 或 1080p
    ratio: '16:9',         // 16:9 | 9:16 | 1:1 | 4:3 | 3:4 | 21:9
    watermark: false,       // 是否带水印
    seed: -1,              // 随机种子，-1 表示随机
    outputDir: '',         // 视频下载目录，空则用 ~/Videos/stunning
  },
};

let cache = null;

/**
 * 读取配置（带缓存）
 */
function loadConfig() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // 合并默认值，保证新增字段存在
      cache = {
        ...DEFAULT_CONFIG,
        ...parsed,
        videoDefaults: { ...DEFAULT_CONFIG.videoDefaults, ...(parsed.videoDefaults || {}) },
      };
    } else {
      cache = { ...DEFAULT_CONFIG };
    }
  } catch (err) {
    console.error('读取配置失败，使用默认值:', err);
    cache = { ...DEFAULT_CONFIG };
  }
  return cache;
}

/**
 * 写入配置（整体替换）
 */
function saveConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    cache = { ...config };
    return cache;
  } catch (err) {
    console.error('写入配置失败:', err);
    throw err;
  }
}

/**
 * 局部更新配置（浅合并，videoDefaults 深合并一层）
 */
function updateConfig(partial) {
  const current = loadConfig();
  const next = {
    ...current,
    ...partial,
    videoDefaults: {
      ...current.videoDefaults,
      ...(partial.videoDefaults || {}),
    },
  };
  return saveConfig(next);
}

/**
 * 获取视频下载目录（兜底默认目录）
 * 优先使用用户配置的目录，失败时回退到可写的沙箱内路径
 */
function getVideoOutputDir() {
  const config = loadConfig();
  let dir = config.videoDefaults.outputDir;
  const candidates = [];
  if (dir) candidates.push(dir);
  try { candidates.push(path.join(os.homedir(), 'Videos', 'stunning')); } catch {}
  try { candidates.push(path.join(process.cwd(), '.data', 'videos')); } catch {}
  try { candidates.push(path.join(os.tmpdir(), 'stunning', 'videos')); } catch {}

  for (const d of candidates) {
    if (!d) continue;
    try {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      const probe = path.join(d, '.probe_' + Date.now());
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
      return d;
    } catch {}
  }
  // 绝对兜底
  const tmp = path.join(os.tmpdir(), 'stunning-videos');
  try { if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true }); } catch {}
  return tmp;
}

module.exports = { loadConfig, saveConfig, updateConfig, getVideoOutputDir, CONFIG_FILE };
