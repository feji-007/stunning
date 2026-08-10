/**
 * 视频生成服务
 *
 * 支持三种生成模式：
 *   1. 内置 Seedance（provider='seedance'）：通过后端服务器调用方舟 API，消耗用户积分。
 *      服务器持有方舟 Key，用户无需自己的 key。
 *   2. 自定义视频生成 AI（provider='custom'）：客户端直接调用用户配置的方舟兼容端点，
 *      使用用户自己的 key，不消耗积分。
 *   3. ComfyUI 本地部署（provider='comfyui'）：客户端直接调用本地 ComfyUI HTTP API，
 *      使用用户配置的工作流模板，不消耗积分。
 *
 * 方舟两种模式都遵循异步任务模式：
 *   POST /contents/generations/tasks   创建任务 → 返回 task_id
 *   GET  /contents/generations/tasks/{task_id}  轮询状态
 *
 * ComfyUI 模式：
 *   POST /prompt                       提交工作流 → 返回 prompt_id
 *   GET  /history/{prompt_id}          轮询执行结果
 *   POST /upload/image                 上传参考图（图生视频）
 *   GET  /view?filename=&subfolder=&type=   下载输出文件
 *   GET  /system_stats                 测试连通性
 *
 * 生成成功后，下载视频到本地。
 *
 * 文档：https://www.volcengine.com/docs/82379  |  https://github.com/comfyanonymous/ComfyUI
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
    throw new Error('未配置自定义视频生成 AI 的 API Key，请先在设置中填写');
  }
  const base = (baseURL || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置自定义视频生成 AI 的 Base URL');

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
    throw new Error(`自定义 AI 返回非 JSON 响应: ${text.slice(0, 200)}`);
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

// ============================================================
// ComfyUI 模式：本地部署，HTTP API
// ============================================================

// 分辨率 + 比例 → 像素宽高（供工作流模板 {{width}} {{height}} 占位符使用）
const SIZE_TABLE = {
  '720p': {
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '1:1': { width: 720, height: 720 },
    '4:3': { width: 960, height: 720 },
    '3:4': { width: 720, height: 960 },
    '21:9': { width: 1280, height: 548 },
  },
  '1080p': {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:3': { width: 1440, height: 1080 },
    '3:4': { width: 1080, height: 1440 },
    '21:9': { width: 1920, height: 822 },
  },
};

function resolveSize(resolution, ratio) {
  const reso = resolution || '720p';
  const r = ratio || '16:9';
  return (SIZE_TABLE[reso] && SIZE_TABLE[reso][r]) || SIZE_TABLE['720p']['16:9'];
}

/**
 * 将占位符应用到工作流模板
 * 递归遍历对象，替换字符串中的 {{key}} 占位符。
 * 若整个字符串值恰好是单个数值型占位符（width/height/seed/duration），
 * 则替换为数字类型，保证 JSON 字段类型正确。
 */
function applyComfyuiTemplate(templateStr, values) {
  const data = JSON.parse(templateStr); // 解析失败会抛错，由调用方捕获
  const NUM_KEYS = ['width', 'height', 'seed', 'duration'];
  const replaceIn = (val) => {
    if (typeof val === 'string') {
      const fullNum = new RegExp(`^{{(${NUM_KEYS.join('|')})}}$`).exec(val);
      if (fullNum) return values[fullNum[1]];
      let s = val;
      for (const [k, v] of Object.entries(values)) {
        s = s.split(`{{${k}}}`).join(String(v));
      }
      return s;
    }
    if (Array.isArray(val)) return val.map(replaceIn);
    if (val && typeof val === 'object') {
      const o = {};
      for (const [k, v] of Object.entries(val)) o[k] = replaceIn(v);
      return o;
    }
    return val;
  };
  return replaceIn(data);
}

/**
 * 上传参考图到 ComfyUI input 目录（图生视频）
 * @param {string} base - ComfyUI baseURL（已去尾斜杠）
 * @param {string} dataUrl - data:image/...;base64,xxxx
 * @returns {Promise<{name, subfolder, type}>}
 */
async function uploadComfyuiImage(base, dataUrl) {
  const match = /^data:(image\/[\w+.-]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) throw new Error('参考图格式无效，无法上传');
  const mime = match[1].toLowerCase();
  const ext = mime === 'image/jpeg' ? 'jpg' : (mime.split('/')[1] || 'png');
  const buffer = Buffer.from(match[2], 'base64');
  const filename = `stunning_${Date.now()}_${Math.floor(Math.random() * 1e4)}.${ext}`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mime });
  formData.append('image', blob, filename);
  formData.append('overwrite', 'true');
  formData.append('type', 'input');

  const res = await fetch(`${base}/upload/image`, { method: 'POST', body: formData });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    throw new Error(data?.error || `上传参考图失败 (${res.status})`);
  }
  return { name: data.name || filename, subfolder: data.subfolder || '', type: data.type || 'input' };
}

/**
 * ComfyUI 模式：提交工作流任务
 * @returns {Promise<{ promptId, base }>}
 */
async function createComfyuiTask(params) {
  const config = loadConfig();
  const { baseURL, workflow } = config.comfyui;
  if (!baseURL) throw new Error('未配置 ComfyUI 服务地址，请先在设置中填写');
  if (!workflow || !workflow.trim()) throw new Error('未配置 ComfyUI 工作流模板，请先在设置中填写');

  const base = baseURL.replace(/\/+$/, '');
  const { width, height } = resolveSize(params.resolution, params.ratio);

  // 图生模式：上传参考图
  let imageFilename = '';
  if (params.imageUrl) {
    const uploaded = await uploadComfyuiImage(base, params.imageUrl);
    imageFilename = uploaded.name;
  }

  // 应用模板占位符
  const values = {
    prompt: params.prompt || '',
    negative_prompt: '',
    image_filename: imageFilename,
    width,
    height,
    duration: params.duration ?? 5,
    seed: (params.seed != null && params.seed >= 0)
      ? params.seed
      : Math.floor(Math.random() * 999999999),
  };

  let promptObj;
  try {
    promptObj = applyComfyuiTemplate(workflow, values);
  } catch (err) {
    throw new Error(`工作流模板解析失败（需为合法 JSON）: ${err.message}`);
  }

  const clientId = `stunning_${Date.now()}`;
  const res = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: promptObj, client_id: clientId }),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch {
    throw new Error(`ComfyUI 返回非 JSON 响应: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const nodeErr = data?.node_errors;
    const msg = data?.error
      || (nodeErr && typeof nodeErr === 'object' ? JSON.stringify(nodeErr).slice(0, 300) : null)
      || `提交工作流失败 (${res.status})`;
    throw new Error(msg);
  }
  if (!data.prompt_id) throw new Error('ComfyUI 未返回 prompt_id');

  return { promptId: data.prompt_id, base };
}

/**
 * 从 ComfyUI history 输出中查找视频/动画文件
 */
function findComfyuiOutput(outputs) {
  if (!outputs || typeof outputs !== 'object') return null;
  // 优先级：videos > gifs > images
  for (const key of ['videos', 'gifs', 'images']) {
    for (const nodeId of Object.keys(outputs)) {
      const node = outputs[nodeId] || {};
      const list = node[key];
      if (Array.isArray(list) && list.length > 0) {
        const f = list[list.length - 1];
        if (f && f.filename) {
          return { filename: f.filename, subfolder: f.subfolder || '', type: f.type || 'output' };
        }
      }
    }
  }
  return null;
}

/**
 * ComfyUI 模式：查询任务状态
 * @returns {Promise<{ status, videoUrl?, file?, error? }>}
 */
async function getComfyuiTaskStatus(base, promptId) {
  const res = await fetch(`${base}/history/${encodeURIComponent(promptId)}`);
  if (!res.ok) throw new Error(`查询任务状态失败 (${res.status})`);
  const data = await res.json();
  const entry = data[promptId];
  if (!entry) {
    // 还在队列或运行中
    return { status: 'running' };
  }
  // 已结束
  const statusStr = entry.status?.status_str;
  if (statusStr === 'error' || entry.status?.completed === false) {
    const execErr = (entry.status?.messages || []).find((m) => m[0] === 'execution_error');
    const msg = execErr?.[1]?.exception_message || entry.status?.status_str || '视频生成失败';
    return { status: 'failed', error: msg };
  }
  const file = findComfyuiOutput(entry.outputs);
  if (!file) return { status: 'failed', error: '任务完成但未找到输出文件' };
  const videoUrl = `${base}/view?filename=${encodeURIComponent(file.filename)}`
    + `&subfolder=${encodeURIComponent(file.subfolder || '')}`
    + `&type=${encodeURIComponent(file.type || 'output')}`;
  return { status: 'succeeded', videoUrl, file };
}

/**
 * 测试 ComfyUI 连通性（设置页「测试连接」按钮调用）
 */
async function testComfyuiConnection(baseURL) {
  const base = (baseURL || '').replace(/\/+$/, '');
  if (!base) throw new Error('请先填写 ComfyUI 服务地址');
  const res = await fetch(`${base}/system_stats`);
  if (!res.ok) throw new Error(`连接失败 (${res.status})`);
  const data = await res.json();
  return {
    ok: true,
    system: data.system,
    devices: data.devices,
  };
}

/**
 * 测试自定义视频生成 AI 连通性（设置页「测试连通性」按钮调用）
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
    const timer = setTimeout(resolve, ms);
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
 *   - provider: 'seedance' | 'custom' | 'comfyui'，缺省取配置中的 videoProvider
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
  let comfyuiBase = null;
  if (provider === 'custom') {
    taskInfo = await createCustomTask(params);
    if (onProgress) onProgress({ stage: taskInfo.status, status: taskInfo.status });
  } else if (provider === 'comfyui') {
    if (onProgress) onProgress({ stage: 'queued', status: 'queued' });
    taskInfo = await createComfyuiTask(params);
    comfyuiBase = taskInfo.base;
    if (onProgress) onProgress({ stage: 'running', status: 'running' });
  } else {
    // 内置 Seedance：通过服务器（扣积分）
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
    } else if (provider === 'comfyui') {
      finalTask = await pollUntilDone(
        () => getComfyuiTaskStatus(comfyuiBase, taskInfo.promptId),
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
  // ComfyUI 输出扩展名取自实际文件，方舟均为 mp4
  let ext = 'mp4';
  if (provider === 'comfyui' && finalTask.file && finalTask.file.filename) {
    const m = /\.([a-z0-9]+)$/i.exec(finalTask.file.filename);
    if (m) ext = m[1];
  }
  const localPath = await downloadVideo(finalTask.videoUrl, filename, ext);

  return {
    provider,
    taskId: taskInfo.taskId || taskInfo.promptId,
    arkTaskId: taskInfo.arkTaskId,
    promptId: taskInfo.promptId,
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
  testComfyuiConnection,
  testCustomConnection,
};
