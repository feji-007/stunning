import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  MessageSquare, Send, Loader2, CheckCircle2, AlertCircle, RotateCcw,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'bug', label: '缺陷报告' },
  { value: 'feature', label: '功能建议' },
  { value: 'experience', label: '体验问题' },
  { value: 'other', label: '其他' },
];

/**
 * 意见反馈面板
 *
 * 与设置面板同级，通过侧边栏导航切换进入。
 * 用户选择反馈分类、填写内容与可选联系方式后提交，
 * 后台管理端可在「用户意见」模块查看并标记已读。
 */
export default function FeedbackPanel() {
  const submitFeedback = useStore((s) => s.submitFeedback);

  const [category, setCategory] = useState('bug');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // 每次进入视图时重置表单
  useEffect(() => {
    setCategory('bug');
    setContent('');
    setContact('');
    setSubmitting(false);
    setError('');
    setSuccess(false);
  }, []);

  const remaining = 2000 - content.length;
  const canSubmit = content.trim().length > 0 && !submitting && !success;

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError('请填写反馈内容');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await submitFeedback({
        category,
        content: content.trim(),
        contact: contact.trim(),
      });
      setSuccess(true);
    } catch (err) {
      setError(err?.message || '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setCategory('bug');
    setContent('');
    setContact('');
    setError('');
    setSuccess(false);
  };

  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-title">
          <MessageSquare size={18} />
          意见反馈
        </h2>
        <p className="panel-subtitle">
          您遇到的问题、建议或想法都可以告诉我们，我们会尽快处理。
        </p>
      </header>

      <div className="panel-body" style={{ maxWidth: 680 }}>
        {success ? (
          <div className="feedback-success">
            <CheckCircle2 size={48} className="feedback-success-icon" />
            <div className="feedback-success-title">感谢您的反馈！</div>
            <div className="feedback-success-desc">
              我们已收到您的意见，将尽快处理。如有必要，我们会通过您留下的联系方式与您取得联系。
            </div>
            <button className="btn btn-primary" onClick={handleReset}>
              <RotateCcw size={14} />
              <span>继续提交</span>
            </button>
          </div>
        ) : (
          <>
            {/* 分类选择 */}
            <div className="form-field">
              <label>反馈类型</label>
              <div className="feedback-categories">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    className={`feedback-category-chip ${category === c.value ? 'feedback-category-chip--active' : ''}`}
                    onClick={() => setCategory(c.value)}
                    type="button"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 反馈内容 */}
            <div className="form-field">
              <label>
                反馈内容
                <span className="feedback-counter">{remaining}</span>
              </label>
              <textarea
                rows={8}
                maxLength={2000}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="请详细描述您遇到的问题或建议（最多 2000 字），如为缺陷报告，建议附上报错信息、操作步骤和截图描述。"
              />
            </div>

            {/* 联系方式 */}
            <div className="form-field">
              <label>联系方式（选填）</label>
              <input
                type="text"
                maxLength={100}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="邮箱 / QQ / 微信，便于我们回复您"
              />
            </div>

            {error && (
              <div className="form-error">
                <AlertCircle size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                {error}
              </div>
            )}

            <div className="panel-actions">
              <button className="btn btn-secondary" onClick={handleReset} disabled={submitting}>
                <RotateCcw size={14} />
                <span>清空</span>
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>提交中…</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>提交反馈</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
