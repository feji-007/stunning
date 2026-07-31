const path = require('path');
const fs = require('fs');

/**
 * 本地推理引擎
 * 基于 node-llama-cpp (llama.cpp 的 Node.js 绑定) 运行 GGUF 格式模型。
 * 负责模型加载、会话管理、流式/非流式推理与生命周期清理。
 */

let llamaCore = null;       // Llama 核心实例
let model = null;           // 当前加载的模型
let contextSequence = null; // 模型上下文序列
let session = null;          // 当前聊天会话
let currentModelPath = null; // 当前模型文件路径
let currentModelMeta = null; // 当前模型元信息
let abortController = null;  // 推理中止控制器
let isGenerating = false;    // 是否正在生成

/**
 * 惰性加载 node-llama-cpp 核心库
 * node-llama-cpp 首次使用时会自动下载/编译 llama.cpp 二进制
 */
async function getLlamaCore() {
  if (llamaCore) return llamaCore;
  const { getLlama } = require('node-llama-cpp');
  llamaCore = await getLlama();
  return llamaCore;
}

/**
 * 扫描指定目录下的所有 .gguf 模型文件
 * @param {string} dirPath - 模型所在目录，为空则使用默认目录
 * @returns {Promise<Array>} 模型文件信息列表
 */
async function scanModels(dirPath) {
  const defaultDir = getDefaultModelDir();
  const targetDir = dirPath && dirPath.trim() ? dirPath : defaultDir;

  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const models = [];

  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
      const stats = fs.statSync(fullPath);
      models.push({
        name: entry.name,
        path: fullPath,
        size: stats.size,
        sizeLabel: formatFileSize(stats.size),
        loaded: currentModelPath === fullPath,
      });
    } else if (entry.isDirectory()) {
      // 递归扫描一级子目录
      try {
        const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (subEntry.isFile() && subEntry.name.toLowerCase().endsWith('.gguf')) {
            const subFullPath = path.join(fullPath, subEntry.name);
            const stats = fs.statSync(subFullPath);
            models.push({
              name: subEntry.name,
              path: subFullPath,
              size: stats.size,
              sizeLabel: formatFileSize(stats.size),
              loaded: currentModelPath === subFullPath,
            });
          }
        }
      } catch {
        // 跳过无权限目录
      }
    }
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 加载 GGUF 模型到内存
 * @param {string} modelPath - 模型文件绝对路径
 * @param {object} options - 加载选项 (contextSize, gpuLayers, etc.)
 */
async function loadModel(modelPath, options = {}) {
  // 先卸载已加载的模型
  if (model) {
    await dispose();
  }

  if (!fs.existsSync(modelPath)) {
    throw new Error(`模型文件不存在: ${modelPath}`);
  }

  const llama = await getLlamaCore();
  const contextSize = options.contextSize || 4096;
  const gpuLayers = options.gpuLayers !== undefined ? options.gpuLayers : 0;

  model = await llama.loadModel({
    modelPath,
    onLoadProgress: (progress) => {
      // 加载进度可通过事件推送，这里简化处理
    },
  });

  // 创建上下文序列（带 GPU 层配置）
  contextSequence = await model.createContext({
    contextSize,
    gpuLayers,
  });

  const { LlamaChatSession } = require('node-llama-cpp');
  session = new LlamaChatSession({
    contextSequence,
    // 系统提示词可由调用方通过 messages 传入
  });

  currentModelPath = modelPath;
  currentModelMeta = {
    name: path.basename(modelPath),
    path: modelPath,
    size: fs.statSync(modelPath).size,
    sizeLabel: formatFileSize(fs.statSync(modelPath).size),
    contextSize,
    gpuLayers,
    loadedAt: new Date().toISOString(),
  };

  return currentModelMeta;
}

/**
 * 非流式聊天补全
 * @param {Array} messages - OpenAI 格式消息数组 [{role, content}]
 * @param {object} options - 推理参数
 */
async function chat(messages, options = {}) {
  if (!session) {
    throw new Error('未加载模型，请先加载一个 GGUF 模型');
  }

  const prompt = buildPromptFromMessages(messages);
  const response = await session.prompt(prompt, {
    temperature: options.temperature ?? 0.8,
    maxTokens: options.maxTokens ?? -1, // -1 表示不限制
    topK: options.topK ?? 40,
    topP: options.topP ?? 0.9,
    minP: options.minP ?? 0,
    repeatPenalty: options.repeatPenalty ?? 1.1,
  });

  return { content: response, role: 'assistant' };
}

/**
 * 流式聊天补全 — 逐 token 推送给前端
 * @param {Array} messages - OpenAI 格式消息数组
 * @param {object} options - 推理参数
 * @param {function} onToken - 每个 token 的回调
 * @returns {Promise<string>} 完整响应文本
 */
async function chatStream(messages, options = {}, onToken) {
  if (!session) {
    throw new Error('未加载模型，请先加载一个 GGUF 模型');
  }

  isGenerating = true;
  abortController = { aborted: false };
  let fullResponse = '';

  const prompt = buildPromptFromMessages(messages);

  try {
    const response = await session.prompt(prompt, {
      temperature: options.temperature ?? 0.8,
      maxTokens: options.maxTokens ?? -1,
      topK: options.topK ?? 40,
      topP: options.topP ?? 0.9,
      minP: options.minP ?? 0,
      repeatPenalty: options.repeatPenalty ?? 1.1,
      onTextChunk: (chunk) => {
        if (abortController.aborted) {
          throw new Error('__ABORTED__');
        }
        fullResponse += chunk;
        if (onToken) onToken(chunk);
      },
    });
    return response;
  } catch (err) {
    if (err && err.message === '__ABORTED__') {
      return fullResponse;
    }
    throw err;
  } finally {
    isGenerating = false;
    abortController = null;
  }
}

/**
 * 文本补全（非聊天格式）
 * @param {string} prompt - 输入提示
 * @param {object} options - 推理参数
 */
async function complete(prompt, options = {}) {
  if (!model) {
    throw new Error('未加载模型，请先加载一个 GGUF 模型');
  }

  const { LlamaText } = require('node-llama-cpp');
  const ctx = await model.createContext({ contextSize: 4096 });
  const sequence = ctx.getSequence();
  const text = new LlamaText({ contextSequence: ctx });
  // 简化版文本补全
  const result = await session.prompt(prompt, {
    temperature: options.temperature ?? 0.8,
    maxTokens: options.maxTokens ?? 256,
    topP: options.topP ?? 0.9,
  });
  return { content: result };
}

/**
 * 取消当前正在进行的推理
 */
function abortGeneration() {
  if (abortController) {
    abortController.aborted = true;
  }
}

/**
 * 卸载当前模型并释放资源
 */
async function dispose() {
  try {
    if (session) {
      await session.dispose();
      session = null;
    }
    if (contextSequence) {
      await contextSequence.dispose();
      contextSequence = null;
    }
    if (model) {
      await model.dispose();
      model = null;
    }
  } catch (err) {
    console.error('卸载模型时出错:', err);
  }
  currentModelPath = null;
  currentModelMeta = null;
}

/**
 * 获取当前已加载模型的信息
 */
function getLoadedModelInfo() {
  return currentModelMeta;
}

/**
 * 引擎单例访问入口
 */
function getEngine() {
  return {
    scanModels,
    loadModel,
    chat,
    chatStream,
    complete,
    abortGeneration,
    dispose,
    getLoadedModelInfo,
    isLoaded: () => model !== null,
    isGenerating: () => isGenerating,
  };
}

// ===== 工具函数 =====

/**
 * 获取默认模型存储目录
 * 优先在应用数据目录内创建，失败则回退到 node_modules 同级的 .data 目录（避免沙箱限制）
 */
function getDefaultModelDir() {
  const candidates = [];

  // 候选 1：用户主目录
  try {
    const homeDir = require('os').homedir();
    candidates.push(path.join(homeDir, '.stunning', 'models'));
  } catch {}

  // 候选 2：项目工作区下（沙箱允许的路径）
  try {
    const cwd = process.cwd();
    if (cwd) candidates.push(path.join(cwd, '.data', 'models'));
  } catch {}

  // 候选 3：__dirname 上方（打包后仍可用）
  try {
    candidates.push(path.join(__dirname, '..', '..', '.data', 'models'));
  } catch {}

  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // 可写测试
      const probe = path.join(dir, '.write_test_' + Date.now());
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
      return dir;
    } catch {
      // 这个候选不可用，试下一个
    }
  }

  // 最后兜底：临时目录
  const os = require('os');
  const tmpDir = path.join(os.tmpdir(), 'stunning', 'models');
  try {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  } catch {}
  return tmpDir;
}

/**
 * 将 OpenAI 格式消息数组转换为单条 prompt
 * node-llama-cpp 的 chat session 内部会处理对话模板，
 * 这里提取 system 消息设为系统提示，其余拼接为用户输入
 */
function buildPromptFromMessages(messages) {
  let systemContent = '';
  let userContent = '';

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemContent = msg.content;
    } else if (msg.role === 'user') {
      userContent += (userContent ? '\n' : '') + msg.content;
    } else if (msg.role === 'assistant') {
      // 已有的助手回复用于上下文
      userContent += (userContent ? '\n' : '') + msg.content;
    }
  }

  // 如果有 system 消息，设置到会话的系统提示
  if (systemContent && session) {
    try {
      session.setSystemPrompt(systemContent);
    } catch {
      // 某些版本可能不支持，降级拼接到用户消息
      userContent = `${systemContent}\n\n${userContent}`;
    }
  }

  return userContent;
}

/**
 * 格式化文件大小为可读字符串
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

module.exports = { getEngine, getDefaultModelDir };
