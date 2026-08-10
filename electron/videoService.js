/**
 * 视频生成服务
 *
 * 支持两种生成模式：
 *   1. 内置模型（provider='seedance'）：通过后端服务器调用方舟 API，消耗用户积分。
 *      服务器持有方舟 Key，用户无需自己的 key。
 *      支持 Seedance 1.0（免费，无需 API Key）与 Seedance 2.0（需要 API Key）系列。
 *   2. 自定义模型（provider='custom'）：客户端直接调用用户配置的方舟兼容端点，
 *      使用用户自己的 key，不消耗积分。
 *
 * 方舟两种模式都遵循异步任务模式：
 *   POST /contents/generations/tasks   创建任务 → 返回 task_id
 *   GET  /contents/generations/tasks/{task_id}  轮询状态
 *
 * 生成成功后，下载视频到本地。
 *
 * 文档：https://www.volcengine.com/docs/82379
 */
const path = require('path');
const fs = require('fs');
const { loadConfig, getVideoOutputDir } = require('./configStore');
const serverClient = require('./serverClient');

const TASKS_PATH = '/contents/generations/tasks';

// 当前轮询状态（用于取消）
let activePolling = null;

// ============================================================
// 自定义模式：客户端直接调用方舟兼容端点
// ============================================================

/**
 * 自定义模式的方舟 API 请求
 */
async function customArkFetch(pathname, options = {}) {
  const config = loadConfig();
  const { baseURL, apiKey } = config.customVideo;
  if (!apiKey) {
    throw new Error('未配置自定义模型的 API Key，请先在设置中填写');
  }
  const base = (baseURL || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置自定义模型的 Base URL');

  const url = pathname.startsWith('http') ? pathname : `${base}${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`自定义模型返回非 JSON 响应: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.error || data?.message || `请求失败 (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.raw = data;
    throw err;
  }
  return data;
}

/**
 * 标准化方舟任务对象（自定义模式）
 */
function normalizeArkTask(data) {
  return {
    taskId: data.id,
    model: data.model,
    status: data.status,           // queued | running | succeeded | failed
    videoUrl: data.status === 'succeeded' ? data.content?.video_url : null,
    error: data.error?.message || (data.status === 'failed' ? '视频生成失败' : null),
    usage: data.usage,
    raw: data,
  };
}

/**
 * 自定义模式：创建任务
 */
async function createCustomTask(params) {
  const config = loadConfig();
  const model = params.model || config.customVideo.modelId;

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

  const data = await customArkFetch(TASKS_PATH, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return normalizeArkTask(data);
}

/**
 * 自定义模式：查询任务
 */
async function getCustomTask(arkTaskId) {
  const data = await customArkFetch(`${TASKS_PATH}/${arkTaskId}`, { method: 'GET' });
  return normalizeArkTask(data);
}

/**
 * 测试自定义模型连通性（设置页「测试连通性」按钮调用）
 * 调用方舟兼容的 GET /models 接口，验证 Base URL 与 API Key 是否有效。
 * 若提供了 modelId，额外检查该模型是否在返回列表中（提示是否已开通）。
 *
 * @param {string} baseURL - 方舟兼容端点，如 https://ark.cn-beijing.volces.com/api/v3
 * @param {string} apiKey - 用户 API Key
 * @param {string} [modelId] - 可选，待校验是否已开通的模型 ID
 * @returns {Promise<{ ok, modelCount, modelMatched }>}
 */
async function testCustomConnection(baseURL, apiKey, modelId) {
  const base = (baseURL || '').replace(/\/+$/, '');
  if (!base) throw new Error('请先填写 Base URL');
  if (!apiKey) throw new Error('请先填写 API Key');

  let res;
  try {
    res = await fetch(`${base}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
  } catch (netErr) {
    // 网络层错误：域名不存在、无法连接、超时等
    throw new Error(`无法连接到服务器，请检查 Base URL 是否正确（${netErr.message}）`);
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch {
    // 非 JSON 响应通常意味着 Base URL 错误或网关拦截
    throw new Error(`返回非 JSON 响应：${text.slice(0, 200)}（请检查 Base URL 是否正确）`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.error || data?.message || `连接失败 (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  // 方舟 /models 返回 { data: [{ id, ... }, ...] }
  const models = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
  const modelCount = models.length;
  let modelMatched = null;
  if (modelId) {
    modelMatched = models.some((m) => m?.id === modelId);
  }
  return {
    ok: true,
    modelCount,
    modelMatched,
  };
}

// ============================================================
// 通用：轮询、下载、读图
// ============================================================

/**
 * 轮询任务直到完成 / 失败 / 超时 / 取消
 * @param {function} pollFn - 返回 { status, videoUrl, error }
 * @param {function} onProgress - 进度回调
 * @param {object} polling - 活动轮询句柄（用于取消）
 */
async function pollUntilDone(pollFn, onProgress, polling) {
  const POLL_INTERVAL = 3000;     // 3 秒
  const MAX_TIMEOUT = 10 * 60 * 1000; // 10 分钟
  const startTime = Date.now();
  let lastStatus = null;

  while (true) {
    if (polling.aborted) throw new Error('已取消视频生成');

    if (Date.now() - startTime > MAX_TIMEOUT) {
      throw new Error('视频生成超时（超过 10 分钟）');
    }

    let result;
    try {
      result = await pollFn();
    } catch (err) {
      // 查询失败不立即中断，下次重试
      if (onProgress) onProgress({ stage: 'running', status: 'running', message: err.message });
      await sleep(POLL_INTERVAL);
      continue;
    }

    if (result.status !== lastStatus) {
      lastStatus = result.status;
      if (onProgress) onProgress({ stage: result.status, status: result.status });
    }

    if (result.status === 'succeeded') {
      if (!result.videoUrl) throw new Error('任务成功但未返回视频地址');
      return result;
    }
    if (result.status === 'failed') {
      throw new Error(result.error || '视频生成失败');
    }

    await sleep(POLL_INTERVAL);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve);
    if (activePolling) {
      activePolling.timer = timer;
    }
  });
}

/**
 * 下载视频到本地
 * @param {string} videoUrl - 视频下载地址
 * @param {string} filename - 文件名（不含扩展名）
 * @param {string} ext - 扩展名（不含点），默认 mp4
 */
async function downloadVideo(videoUrl, filename, ext = 'mp4') {
  const outputDir = getVideoOutputDir();
  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  } catch {}

  // 清理文件名
  const safeName = (filename || `video_${Date.now()}`)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const safeExt = (ext || 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
  const localPath = path.join(outputDir, `${safeName}.${safeExt}`);

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`下载视频失败 (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

/**
 * 读取本地图片为 base64 data URL（图生视频上传用）
 */
function readImageAsDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  const mime = mimeMap[ext] || 'image/jpeg';
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  return `data:${mime};base64,${base64}`;
}

// ============================================================
// 统一生成入口
// ============================================================

/**
 * 生成视频
 * @param {object} params
 *   - provider: 'seedance' | 'custom'，缺省取配置中的 videoProvider
 *   - prompt: 提示词
 *   - imageUrl: 图生视频时的参考图（http URL 或 base64 data URL）
 *   - duration / resolution / ratio / watermark / seed: 生成参数
 *   - model: 模型 ID（可选，覆盖默认）
 * @param {function} onProgress - 进度回调 { stage, status, message?, pointsRemaining? }
 * @returns {object} { provider, taskId, arkTaskId, videoUrl, localPath, pointsCost?, pointsRemaining? }
 */
async function generate(params, onProgress) {
  const config = loadConfig();
  const provider = params.provider || config.videoProvider || 'seedance';

  // 创建任务
  let taskInfo;
  if (provider === 'custom') {
    taskInfo = await createCustomTask(params);
    if (onProgress) onProgress({ stage: taskInfo.status, status: taskInfo.status });
  } else {
    // 内置模型：通过服务器（扣积分）
    taskInfo = await serverClient.createVideoTask(params);
    if (onProgress) {
      onProgress({
        stage: taskInfo.status,
        status: taskInfo.status,
        pointsRemaining: taskInfo.pointsRemaining,
        pointsCost: taskInfo.pointsCost,
      });
    }
  }

  // 轮询
  activePolling = { aborted: false, timer: null };
  let finalTask;
  try {
    if (provider === 'custom') {
      finalTask = await pollUntilDone(
        () => getCustomTask(taskInfo.arkTaskId || taskInfo.taskId),
        onProgress,
        activePolling
      );
    } else {
      finalTask = await pollUntilDone(
        () => serverClient.getVideoTask(taskInfo.taskId),
        onProgress,
        activePolling
      );
    }
  } finally {
    activePolling = null;
  }

  // 下载
  if (onProgress) onProgress({ stage: 'downloading', status: 'downloading' });
  const filename = params.prompt
    ? params.prompt.slice(0, 30)
    : `video_${Date.now()}`;
  const localPath = await downloadVideo(finalTask.videoUrl, filename, 'mp4');

  return {
    provider,
    taskId: taskInfo.taskId,
    arkTaskId: taskInfo.arkTaskId,
    videoUrl: finalTask.videoUrl,
    localPath,
    pointsCost: taskInfo.pointsCost,
    pointsRemaining: taskInfo.pointsRemaining || finalTask.pointsRemaining,
  };
}

/**
 * 取消当前进行中的生成（中断轮询）
 */
function cancel() {
  if (activePolling) {
    activePolling.aborted = true;
    if (activePolling.timer) {
      clearTimeout(activePolling.timer);
      activePolling.timer = null;
    }
  }
}

module.exports = {
  generate,
  cancel,
  downloadVideo,
  readImageAsDataUrl,
  testCustomConnection,
};
