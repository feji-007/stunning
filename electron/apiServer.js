const express = require('express');
const cors = require('cors');
const { getEngine } = require('./inference/llamaEngine');

/**
 * OpenAI 兼容的本地 API 服务器
 *
 * 端点：
 *   GET  /v1/models              - 列出已加载模型
 *   POST /v1/chat/completions    - 聊天补全（支持 stream）
 *   POST /v1/completions         - 文本补全
 *   GET  /v1/health              - 健康检查
 *
 * 兼容 OpenAI Python SDK / curl 调用方式：
 *   base_url = "http://localhost:1234/v1"
 *   api_key  = "stunning"  (任意值均可)
 */

let serverInstance = null;
let currentPort = 1234;

/**
 * 启动 API 服务器
 */
async function startApiServer(port = 1234) {
  if (serverInstance) {
    throw new Error(`API 服务器已在端口 ${currentPort} 运行`);
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // 简易鉴权中间件：兼容 OpenAI SDK 的 Bearer token，但不校验内容
  app.use((req, res, next) => {
    next();
  });

  // ===== 健康检查 =====
  app.get('/v1/health', (req, res) => {
    const engine = getEngine();
    res.json({ status: 'ok', model_loaded: engine.isLoaded() });
  });

  // ===== 列出模型 =====
  app.get('/v1/models', (req, res) => {
    const engine = getEngine();
    const info = engine.getLoadedModelInfo();
    if (!info) {
      return res.json({ object: 'list', data: [] });
    }
    res.json({
      object: 'list',
      data: [
        {
          id: info.name,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'local',
          meta: {
            size: info.size,
            size_label: info.sizeLabel,
            context_size: info.contextSize,
          },
        },
      ],
    });
  });

  // ===== 聊天补全 =====
  app.post('/v1/chat/completions', async (req, res) => {
    const engine = getEngine();
    if (!engine.isLoaded()) {
      return res.status(503).json({
        error: {
          message: '没有已加载的模型。请在 绝色 中先加载一个模型。',
          type: 'server_error',
        },
      });
    }

    const { messages, stream, temperature, max_tokens, top_p, top_k, repeat_penalty } = req.body;
    const options = { temperature, maxTokens: max_tokens, topP: top_p, topK: top_k, repeatPenalty: repeat_penalty };
    const requestId = `chatcmpl-${Date.now()}`;

    if (stream) {
      // ===== 流式响应 (SSE) =====
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const sendSse = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // 发送角色标识 chunk
        sendSse({
          id: requestId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: engine.getLoadedModelInfo()?.name || 'local-model',
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        });

        await engine.chatStream(messages, options, (token) => {
          sendSse({
            id: requestId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: engine.getLoadedModelInfo()?.name || 'local-model',
            choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
          });
        });

        // 发送结束 chunk
        sendSse({
          id: requestId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: engine.getLoadedModelInfo()?.name || 'local-model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        });
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        sendSse({ error: { message: err.message, type: 'internal_error' } });
        res.end();
      }
    } else {
      // ===== 非流式响应 =====
      try {
        const result = await engine.chat(messages, options);
        res.json({
          id: requestId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: engine.getLoadedModelInfo()?.name || 'local-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: result.content },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: -1, completion_tokens: -1, total_tokens: -1 },
        });
      } catch (err) {
        res.status(500).json({
          error: { message: err.message, type: 'internal_error' },
        });
      }
    }
  });

  // ===== 文本补全 =====
  app.post('/v1/completions', async (req, res) => {
    const engine = getEngine();
    if (!engine.isLoaded()) {
      return res.status(503).json({
        error: { message: '没有已加载的模型。', type: 'server_error' },
      });
    }

    const { prompt, temperature, max_tokens, top_p } = req.body;
    const options = { temperature, maxTokens: max_tokens, topP: top_p };
    const requestId = `cmpl-${Date.now()}`;

    try {
      const result = await engine.complete(prompt, options);
      res.json({
        id: requestId,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: engine.getLoadedModelInfo()?.name || 'local-model',
        choices: [
          {
            text: result.content,
            index: 0,
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: -1, completion_tokens: -1, total_tokens: -1 },
      });
    } catch (err) {
      res.status(500).json({ error: { message: err.message, type: 'internal_error' } });
    }
  });

  // ===== 未知路由回退 =====
  app.use((req, res) => {
    res.status(404).json({ error: { message: `Unknown route: ${req.method} ${req.path}`, type: 'not_found' } });
  });

  return new Promise((resolve, reject) => {
    serverInstance = app.listen(port, () => {
      currentPort = port;
      resolve({ port, status: 'running' });
    });
    serverInstance.on('error', (err) => {
      serverInstance = null;
      reject(err);
    });
  });
}

/**
 * 停止 API 服务器
 */
async function stopApiServer() {
  if (!serverInstance) return { status: 'stopped' };
  return new Promise((resolve) => {
    serverInstance.close(() => {
      serverInstance = null;
      resolve({ status: 'stopped' });
    });
  });
}

/**
 * 获取服务器状态
 */
function getApiServerStatus() {
  return {
    running: serverInstance !== null,
    port: currentPort,
    baseUrl: serverInstance ? `http://localhost:${currentPort}/v1` : null,
  };
}

module.exports = { startApiServer, stopApiServer, getApiServerStatus };
