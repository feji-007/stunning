/**
 * AI Agent 路由
 *  - GET    /api/agents                 列出全部 Agent
 *  - GET    /api/agents/:id             Agent 详情
 *  - POST   /api/agents                 创建自定义 Agent
 *  - GET    /api/agents/:id/messages    读取当前用户与该 Agent 的历史
 *  - POST   /api/agents/:id/chat        与 Agent 流式对话（SSE）
 *
 * Agent 定义存储在服务器数据库；对话时由服务器调用 LLM 并流式返回。
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { chatStream } = require('../services/llmService');

const router = express.Router();

function serializeAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    avatar: row.avatar || '',
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    isBuiltin: !!row.is_builtin,
    createdAt: row.created_at,
  };
}

// 列出全部 Agent
router.get('/', authRequired, (_req, res) => {
  const rows = db.prepare('SELECT * FROM agents ORDER BY is_builtin DESC, id ASC').all();
  res.json(rows.map(serializeAgent));
});

// Agent 详情
router.get('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agent 不存在' });
  res.json(serializeAgent(row));
});

// 创建自定义 Agent
router.post('/', authRequired, (req, res) => {
  const { name, description, systemPrompt, temperature, maxTokens } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Agent 名称不能为空' });
  }
  const info = db.prepare(`
    INSERT INTO agents (name, description, system_prompt, temperature, max_tokens, is_builtin)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(
    name.trim().slice(0, 64),
    (description || '').slice(0, 500),
    systemPrompt || '',
    typeof temperature === 'number' ? temperature : 0.7,
    typeof maxTokens === 'number' ? maxTokens : -1
  );
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializeAgent(row));
});

// 读取历史消息
router.get('/:id/messages', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT id, role, content, created_at FROM agent_messages
    WHERE agent_id = ? AND user_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT 100
  `).all(req.params.id, req.user.id);
  res.json(rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  })));
});

// 与 Agent 流式对话（SSE）
router.post('/:id/chat', authRequired, async (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent 不存在' });
  }

  const { message, history = [] } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message 不能为空' });
  }

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 保存用户消息
    db.prepare(`
      INSERT INTO agent_messages (agent_id, user_id, role, content)
      VALUES (?, ?, 'user', ?)
    `).run(agent.id, req.user.id, message);

    // 组装上下文：system + 历史 + 当前消息
    const messages = [{ role: 'system', content: agent.system_prompt || '你是一个有用的 AI 助手。' }];
    for (const h of history) {
      if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string') {
        messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: 'user', content: message });

    const full = await chatStream(messages, {
      onToken: (token) => send('token', { token }),
    });

    // 保存助手回复
    db.prepare(`
      INSERT INTO agent_messages (agent_id, user_id, role, content)
      VALUES (?, ?, 'assistant', ?)
    `).run(agent.id, req.user.id, full);

    send('done', { success: true });
  } catch (err) {
    send('error', { message: err.message || 'Agent 对话失败' });
  } finally {
    res.end();
  }
});

module.exports = router;
