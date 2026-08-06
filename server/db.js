/**
 * SQLite 数据库连接 + 表结构 + 种子数据
 *
 * 使用 Node 24 内置的 `node:sqlite`（无需安装任何原生依赖）。
 * 启动需加 --experimental-sqlite 标志（已配置在 package.json 的 scripts 中）。
 *
 * 表：
 *   - users            用户（账号、密码哈希、昵称、头像、积分）
 *   - agents           AI Agent 定义（名称、描述、System Prompt、模型参数等）
 *   - agent_messages   Agent 对话历史（用于服务端记忆）
 *
 * 数据库文件部署在服务器上，客户端不直接访问。
 */
const config = require('./config');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.error('[db] 无法加载 node:sqlite，请使用 Node 22.5+ 并加 --experimental-sqlite 标志启动');
  throw err;
}

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ===== 建表 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    nickname      TEXT    NOT NULL DEFAULT '',
    avatar        TEXT    NOT NULL DEFAULT '',
    points        INTEGER NOT NULL DEFAULT ${config.defaultPoints},
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS agents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    system_prompt TEXT    NOT NULL DEFAULT '',
    avatar        TEXT    NOT NULL DEFAULT '',
    temperature   REAL    NOT NULL DEFAULT 0.7,
    max_tokens    INTEGER NOT NULL DEFAULT -1,
    is_builtin    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS agent_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id     INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    role         TEXT    NOT NULL,          -- 'user' | 'assistant'
    content      TEXT    NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent_messages_agent_user
    ON agent_messages(agent_id, user_id, created_at);
`);

// ===== 种子内置 Agent =====
function seedBuiltinAgents() {
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM agents WHERE is_builtin = 1').get().c;
  if (cnt > 0) return;

  const builtins = [
    {
      name: '小绝',
      description: '通用智能助手，擅长日常问答、写作与翻译。',
      system_prompt: '你是「小绝」，一个友好、博学的 AI 助手。请用简洁清晰的中文回答用户问题，遇到不确定的内容要如实说明。',
      avatar: '',
      temperature: 0.7,
      max_tokens: -1,
    },
    {
      name: '代码工匠',
      description: '编程专家，精通多种语言与框架，提供可运行的代码与解释。',
      system_prompt: '你是一位资深软件工程师。回答编程问题时请给出完整、可直接运行的代码，并简要解释关键点。优先使用最佳实践。',
      avatar: '',
      temperature: 0.3,
      max_tokens: -1,
    },
    {
      name: '灵感编剧',
      description: '创意写作伙伴，擅长故事、剧本、文案与点子。',
      system_prompt: '你是一位富有创意的编剧与文案策划。请根据用户需求生成有想象力、有感染力的文字，风格可灵活调整。',
      avatar: '',
      temperature: 0.95,
      max_tokens: -1,
    },
  ];

  const stmt = db.prepare(`
    INSERT INTO agents (name, description, system_prompt, avatar, temperature, max_tokens, is_builtin)
    VALUES (@name, @description, @system_prompt, @avatar, @temperature, @max_tokens, 1)
  `);
  for (const a of builtins) stmt.run(a);
}

seedBuiltinAgents();

module.exports = db;
