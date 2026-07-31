const path = require('path');
const fs = require('fs');
const { loadConfig, getVideoOutputDir } = require('./configStore');

/**
 * 火山引擎方舟（Ark）内容生成 — 视频生成服务
 *
 * 调用 Seedance 2.0 系列模型生成视频。
 * 视频生成是异步任务模式：
 *   1. POST /contents/generations/tasks   创建任务，返回 task_id
 *   2. GET  /contents/generations/tasks/{task_id}  轮询任务状态
 *   3. 任务成功后下载 video_url 到本地
 *
 * 文档：https://www.volcengine.com/docs/82379
 */

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const TASKS_ENDPOINT = `${ARK_BASE_URL}/contents/generations/tasks`;

// 任务轮询配置
const POLL_INTERVAL_MS = 3000;   // 每 3 秒查询一次
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 单任务最长等待 10 分钟

// 当前活跃的任务控制器（用于取消）
let activePolling = null;

/**
 * 统一请求方舟 API（带鉴权）
 */
async function arkFetch(pathname, options = {}) {
  const config = loadConfig();
  if (!config.arkApiKey) {
    throw new Error('未配置方舟 API Key，请在「设置」中填写。');
  }

  const url = pathname.startsWith('http') ? pathname : `${ARK_BASE_URL}${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.arkApiKey}`,
      ...(options.headers || {}),
    },
  });

  // 解析响应
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`方舟 API 返回非 JSON 响应: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `方舟 API 请求失败 (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data?.error?.code;
    err.raw = data;
    throw err;
  }
  return data;
}

/**
 * 创建视频生成任务
 * @param {object} params
 *   - mode: 'text' | 'image'  文生视频或图生视频
 *   - prompt: 提示词
 *   - imageUrl: 图生视频时的参考图 URL（http(s) 或 base64 data URL）
 *   - duration: 时长秒数 (5 | 10)
 *   - resolution: 分辨率 (720p | 1080p)
 *   - ratio: 画面比例
 *   - seed: 随机种子 (-1 随机)
 *   - watermark: 是否水印
 *   - modelId: 模型 ID，覆盖配置
 */
async function createVideoTask(params) {
  const config = loadConfig();
  const model = params.modelId || config.videoModelId;
  const videoDefaults = config.videoDefaults;

  // 构建 content 数组
  const content = [];
  if (params.prompt) {
    content.push({ type: 'text', text: params.prompt });
  }
  if (params.imageUrl) {
    content.push({ type: 'image_url', image_url: { url: params.imageUrl } });
  }
  if (content.length === 0) {
    throw new Error('提示词和参考图至少需要提供一项');
  }

  const body = {
    model,
    content,
    duration: params.duration ?? videoDefaults.duration,
    resolution: params.resolution ?? videoDefaults.resolution,
    ratio: params.ratio ?? videoDefaults.ratio,
    watermark: params.watermark ?? videoDefaults.watermark,
  };
  if (params.seed != null && params.seed >= 0) {
    body.seed = params.seed;
  }

  const data = await arkFetch('/contents/generations/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // 方舟返回 { id, model, status: 'queued', ... }
  return {
    taskId: data.id,
    model: data.model,
    status: data.status,
    createdAt: data.created_at,
    raw: data,
  };
}

/**
 * 查询单个任务状态
 */
async function getVideoTask(taskId) {
  const data = await arkFetch(`/contents/generations/tasks/${taskId}`, {
    method: 'GET',
  });
  return normalizeTask(data);
}

/**
 * 标准化任务对象，便于前端使用
 */
function normalizeTask(data) {
  return {
    taskId: data.id,
    model: data.model,
    status: data.status,        // queued | running | succeeded | failed
    content: data.content,      // 成功后含 video_url, duration
    usage: data.usage,
    error: data.error,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    raw: data,
  };
}

/**
 * 启动任务轮询，直到完成/失败/超时
 * @param {string} taskId
 * @param {function} onProgress - 每次状态变更回调 (task)
 * @returns {Promise<object>} 最终任务对象
 */
async function pollTaskUntilDone(taskId, onProgress) {
  const startTime = Date.now();
  let lastStatus = null;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      // 被取消
      if (activePolling?.aborted) {
        resolve({ status: 'cancelled', taskId });
        return;
      }
      // 超时
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        resolve({ status: 'timeout', taskId });
        return;
      }

      try {
        const task = await getVideoTask(taskId);
        // 状态变化时通知
        if (task.status !== lastStatus) {
          lastStatus = task.status;
          if (onProgress) onProgress(task);
        }

        if (task.status === 'succeeded') {
          resolve(task);
          return;
        }
        if (task.status === 'failed') {
          reject(new Error(task.error?.message || '视频生成失败'));
          return;
        }
        // 继续轮询
        activePolling = { aborted: false, timer: setTimeout(poll, POLL_INTERVAL_MS) };
      } catch (err) {
        reject(err);
      }
    };

    poll();
  });
}

/**
 * 下载视频文件到本地
 * @param {string} videoUrl 远程视频 URL
 * @param {string} filename 文件名（不含扩展名）
 * @returns {Promise<string>} 本地文件路径
 */
async function downloadVideo(videoUrl, filename) {
  const outputDir = getVideoOutputDir();
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const safeName = (filename || `video-${Date.now()}`).replace(/[^\w\-]/g, '_');
  const filePath = path.join(outputDir, `${safeName}.mp4`);

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`下载视频失败 (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * 读取本地图片为 base64 data URL（用于图生视频上传）
 * @param {string} filePath 本地图片路径
 */
function readImageAsDataUrl(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`图片文件不存在: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  const mime = mimeMap[ext];
  if (!mime) {
    throw new Error(`不支持的图片格式: ${ext}（仅支持 png/jpg/jpeg/webp/gif）`);
  }
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  return `data:${mime};base64,${base64}`;
}

/**
 * 取消当前正在轮询的任务
 */
function cancelPolling() {
  if (activePolling?.timer) {
    clearTimeout(activePolling.timer);
  }
  if (activePolling) {
    activePolling.aborted = true;
  }
}

module.exports = {
  createVideoTask,
  getVideoTask,
  pollTaskUntilDone,
  downloadVideo,
  readImageAsDataUrl,
  cancelPolling,
  ARK_BASE_URL,
};
