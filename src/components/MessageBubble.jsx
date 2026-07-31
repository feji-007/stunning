import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot, AlertCircle } from 'lucide-react';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isError = message.isError;
  const isStreaming = message.isStreaming;

  return (
    <div className={`message ${isUser ? 'message--user' : 'message--assistant'} ${isError ? 'message--error' : ''}`}>
      <div className="message-avatar">
        {isUser ? <User size={18} /> : isError ? <AlertCircle size={18} /> : <Bot size={18} />}
      </div>
      <div className="message-body">
        <div className="message-role">
          {isUser ? '你' : '助手'}
          {isStreaming && <span className="message-streaming-indicator">●●●</span>}
        </div>
        <div className="message-content">
          {isUser ? (
            <div className="message-user-text">{message.content}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');
                  if (!inline && match) {
                    return (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: '8px 0',
                          borderRadius: '8px',
                          fontSize: '13px',
                        }}
                        {...props}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    );
                  }
                  return (
                    <code className="inline-code" {...props}>
                      {children}
                    </code>
                  );
                },
                // 表格渲染
                table({ children }) {
                  return <div className="md-table-wrapper"><table>{children}</table></div>;
                },
              }}
            >
              {message.content || (isStreaming ? '...' : '')}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
