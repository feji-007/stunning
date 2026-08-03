import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import MessageBubble from './MessageBubble';
import {
  Send, Square, Bot, Plus, Sparkles, Loader2, X, Cpu,
} from 'lucide-react';

/**
 * AI Agent 面板
 * 左侧：Agent 列表（来自服务器数据库，含内置与自定义）
 * 右侧：与选中 Agent 的流式对话
 * 顶部：「创建 Agent」按钮
 */
export default function AgentPanel() {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const agentMessages = useStore((s) => s.agentMessages);
  const isAgentGenerating = useStore((s) => s.isAgentGenerating);
  const loadAgents = useStore((s) => s.loadAgents);
  const selectAgent = useStore((s) => s.selectAgent);
  const sendAgentMessage = useStore((s) => s.sendAgentMessage);
  const stopAgentGeneration = useStore((s) => s.stopAgentGeneration);
  const createAgent = useStore((s) => s.createAgent);

  const [input, setInput] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // 首次加载若有 Agent 但未选中，默认选第一个
  useEffect(() => {
    if (!activeAgentId && agents.length > 0) {
      selectAgent(agents[0].id);
    }
  }, [agents, activeAgentId, selectAgent]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const activeAgent = agents.find((a) => a.id === activeAgentId);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isAgentGenerating || !activeAgentId) return;
    setInput('');
    sendAgentMessage(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="panel agent-panel">
      {/* 顶部标题 */}
      <div className="panel-header">
        <Bot size={20} />
        <h1 className="panel-title">AI Agent</h1>
        <button className="btn btn-secondary settings-reset-btn" onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          <span>创建 Agent</span>
        </button>
      </div>

      <div className="agent-body">
        {/* Agent 列表 */}
        <aside className="agent-list">
          <div className="agent-list-header">Agent 列表</div>
          <div className="agent-list-items">
            {agents.length === 0 && (
              <p className="agent-list-empty">暂无 Agent</p>
            )}
            {agents.map((a) => (
              <div
                key={a.id}
                className={`agent-item ${activeAgentId === a.id ? 'agent-item--active' : ''}`}
                onClick={() => selectAgent(a.id)}
              >
                <div className="agent-item-avatar">
                  {a.avatar ? <img src={a.avatar} alt="" /> : <Bot size={16} />}
                </div>
                <div className="agent-item-info">
                  <div className="agent-item-name">
                    {a.name}
                    {a.isBuiltin && <span className="agent-item-tag">内置</span>}
                  </div>
                  <div className="agent-item-desc">{a.description || '暂无描述'}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* 对话区 */}
        <div className="agent-chat">
          {activeAgent ? (
            <>
              <div className="agent-chat-header">
                <div className="agent-chat-header-info">
                  <div className="agent-chat-header-avatar">
                    {activeAgent.avatar ? <img src={activeAgent.avatar} alt="" /> : <Bot size={18} />}
                  </div>
                  <div>
                    <div className="agent-chat-header-name">{activeAgent.name}</div>
                    <div className="agent-chat-header-desc">{activeAgent.description}</div>
                  </div>
                </div>
              </div>

              <div className="chat-messages">
                {agentMessages.length === 0 && (
                  <div className="chat-empty">
                    <Sparkles size={48} className="chat-empty-icon" />
                    <h2 className="chat-empty-title">与 {activeAgent.name} 对话</h2>
                    <p className="chat-empty-desc">
                      Agent 定义存储在服务器数据库；对话由服务器调用 LLM 流式返回。
                    </p>
                  </div>
                )}
                {agentMessages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-area">
                <div className="chat-input-wrapper">
                  <textarea
                    ref={textareaRef}
                    className="chat-input"
                    placeholder={`向 ${activeAgent.name} 发送消息... (Enter 发送)`}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                  />
                  {isAgentGenerating ? (
                    <button className="chat-send-btn chat-send-btn--stop" onClick={stopAgentGeneration}>
                      <Square size={16} />
                    </button>
                  ) : (
                    <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="chat-empty">
              <Cpu size={48} className="chat-empty-icon" />
              <h2 className="chat-empty-title">选择一个 Agent 开始</h2>
              <p className="chat-empty-desc">从左侧选择内置 Agent，或创建一个新的 Agent</p>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreate={async (payload) => {
            const a = await createAgent(payload);
            setShowCreate(false);
            if (a?.id) selectAgent(a.id);
          }}
        />
      )}
    </div>
  );
}

function CreateAgentModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setError('');
    if (!name.trim()) {
      setError('请输入 Agent 名称');
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim() || '你是一个有用的 AI 助手。',
        temperature: Number(temperature),
      });
    } catch (err) {
      setError(err.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal agent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>创建 Agent</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label>名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="如：翻译官" autoFocus />
          </div>
          <div className="form-field">
            <label>描述</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="一句话介绍这个 Agent" />
          </div>
          <div className="form-field">
            <label>System Prompt（人设）</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              placeholder="你是一位专业的翻译官，请将用户输入翻译为目标语言……"
            />
          </div>
          <div className="form-field">
            <label>Temperature：{temperature.toFixed(2)}</label>
            <input type="range" min="0" max="2" step="0.05" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
