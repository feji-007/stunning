/**
 * 火山引擎方舟（Ark）视频生成服务
 *
 * 供服务器端「内置 Seedance 视频生成」使用。
 * 由服务器持有方舟 API Key，调用 Seedance 2.0 系列模型生成视频；
 * 调用产生的积分消耗由 routes/video.js 在任务维度上扣减。
 *
 * 异步任务模式：
 *   1. POST /contents/generations/tasks   创建任务，返回 task_id
 *   2. GET  /contents/generations/tasks/{task_id}  轮询任务状态
 *
 * 文档：https://www.volcengine.com/docs/82379
 */
const config = require('../config');
const settings = require('../settings');

const TASKS_ENDPOINT = '/contents/generations/tasks';

/**
 * 获取方舟配置（优先数据库，回退 config.js）
 */
function getArkConfig() {
  return settings.get('ark') || config.ark;
}

/**
 * 统一请求方舟 API（带鉴权）
 * @param {string} pathname - 路径或完整 URL
 * @param {object} options - fetch options
 */
async function arkFetch(pathname, options = {}) {
  const ark = getArkConfig();
  if (!ark.apiKey) {
    throw new Error('服务器未配置方舟 API Key，无法使用内置 Seedance 视频生成（请在后台管理配置）');
  }

  const baseUrl = (ark.baseURL || '').replace(/\/+$/, '');
  const url = pathname.startsWith('http') ? pathname : `${baseUrl}${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ark.apiKey}`,
      ...(options.headers || {}),
    },
  });

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
 *   - prompt: 提示词
 *   - imageUrl: 图生视频时的参考图 URL（http(s) 或 base64 data URL）
 *   - duration: 时长秒数 (5 | 10)
 *   - resolution: 分辨率 (720p | 1080p)
 *   - ratio: 画面比例
 *   - seed: 随机种子 (-1 随机)
 *   - watermark: 是否水印
 *   - model: 模型 ID，覆盖默认
 */
async function createVideoTask(params) {
  const ark = getArkConfig();
  const model = params.model || ark.defaultModel;

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
    duration: params.duration ?? 5,
    resolution: params.resolution ?? '720p',
    ratio: params.ratio ?? '16:9',
    watermark: params.watermark ?? false,
  };
  if (params.seed != null && params.seed >= 0) {
    body.seed = params.seed;
  }

  const data = await arkFetch(TASKS_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // 方舟返回 { id, model, status: 'queued', ... }
  return normalizeTask(data);
}

/**
 * 查询单个任务状态
 */
async function getVideoTask(taskId) {
  const data = await arkFetch(`${TASKS_ENDPOINT}/${taskId}`, { method: 'GET' });
  return normalizeTask(data);
}

/**
 * 标准化任务对象，便于上层使用
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

module.exports = {
  createVideoTask,
  getVideoTask,
  normalizeTask,
};
