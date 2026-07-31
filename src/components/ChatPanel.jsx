import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { Send, Square, Sparkles } from 'lucide-react';
import MessageBubble from './MessageBubble';

export default function ChatPanel() {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const isGenerating = useStore((s) => s.isGenerating);
  const sendMessage = useStore((s) => s.sendMessage);
  const stopGeneration = useStore((s) => s.stopGeneration);
  const loadedModel = useStore((s) => s.loadedModel);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const session = sessions.find((s) => s.id === activeSessionId);
  const messages = session?.messages ?? [];

  // 新消息时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 自适应文本框高度
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isGenerating) return;
    setInput('');
    sendMessage(text);
  };

  const handleKeyDown = (e) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-panel">
      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <Sparkles size={48} className="chat-empty-icon" />
            <h2 className="chat-empty-title">开始一段新对话</h2>
            <p className="chat-empty-desc">
              {loadedModel
                ? `当前模型: ${loadedModel.name} — 在下方输入消息开始对话`
                : '请先在左侧「模型」面板中加载一个 GGUF 模型'}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={loadedModel ? '输入消息... (Enter 发送, Shift+Enter 换行)' : '请先加载模型...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={!loadedModel && !isGenerating}
          />
          {isGenerating ? (
            <button className="chat-send-btn chat-send-btn--stop" onClick={stopGeneration} title="停止生成">
              <Square size={18} />
            </button>
          ) : (
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || !loadedModel}
              title="发送"
            >
              <Send size={18} />
            </button>
          )}
        </div>
        <p className="chat-input-hint">
          本地推理 · 数据不会离开你的设备
        </p>
      </div>
    </div>
  );
}
