/**
 * LLM 服务：调用 OpenAI 兼容接口（流式）
 *
 * 用于 AI Agent 的对话后端。默认指向桌面应用自带的本地 API 服务器，
 * 也可在 server/config.js 中改为任意 OpenAI 兼容端点。
 */
const config = require('../config');

/**
 * 流式对话，通过 onToken 回调推送 token
 * @param {Array<{role:string,content:string}>} messages
 * @param {{onToken:(t:string)=>void, signal?:AbortSignal}} opts
 * @returns {Promise<string>} 完整文本
 */
async function chatStream(messages, opts = {}) {
  const { onToken, signal } = opts;
  const url = config.llm.baseURL.replace(/\/+$/, '') + '/chat/completions';

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    throw new Error(`LLM 请求失败 (${resp.status}): ${text.slice(0, 300)}`);
  }

  // 解析 SSE 流
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          full += delta;
          if (onToken) onToken(delta);
        }
      } catch {
        // 忽略非 JSON 行
      }
    }
  }
  return full;
}

module.exports = { chatStream };
