import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  X, Coins, Gift, Check, Loader2, Sparkles, AlertCircle, CreditCard,
} from 'lucide-react';

/**
 * 充值弹窗（模拟支付）
 *
 * 流程：
 *   1. 打开时加载套餐列表
 *   2. 用户选择套餐
 *   3. 点击「立即支付」→ 创建订单 → 模拟支付 → 积分到账
 *   4. 显示成功结果，可继续充值或关闭
 *
 * 模拟支付：点击支付即视为成功，立即增加积分。
 */
export default function RechargeModal({ open, onClose }) {
  const rechargePlans = useStore((s) => s.rechargePlans);
  const loadRechargePlans = useStore((s) => s.loadRechargePlans);
  const rechargeHistory = useStore((s) => s.rechargeHistory);
  const loadRechargeHistory = useStore((s) => s.loadRechargeHistory);
  const recharge = useStore((s) => s.recharge);
  const isRecharging = useStore((s) => s.isRecharging);
  const userPoints = useStore((s) => s.user?.points ?? 0);

  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null); // { addedPoints, pointsRemaining }

  // 打开时加载数据
  useEffect(() => {
    if (!open) return;
    setError('');
    setSuccess(null);
    setSelectedPlanId(null);
    loadRechargePlans();
    loadRechargeHistory();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !isRecharging) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isRecharging, onClose]);

  if (!open) return null;

  const selectedPlan = rechargePlans.find((p) => p.id === selectedPlanId);

  const handlePay = async () => {
    if (!selectedPlanId) return;
    setError('');
    setSuccess(null);
    try {
      const result = await recharge(selectedPlanId);
      setSuccess({
        addedPoints: result?.addedPoints ?? selectedPlan.points,
        pointsRemaining: result?.pointsRemaining ?? userPoints,
      });
      // 刷新充值历史
      loadRechargeHistory();
    } catch (err) {
      setError(err.message || '充值失败');
    }
  };

  const handleClose = () => {
    if (isRecharging) return;
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal recharge-modal" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <h2>
            <Coins size={16} />
            <span>积分充值</span>
          </h2>
          <button
            className="modal-close"
            onClick={handleClose}
            disabled={isRecharging}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* 主体 */}
        <div className="modal-body recharge-body">
          {success ? (
            /* 支付成功页 */
            <div className="recharge-success">
              <div className="recharge-success-icon">
                <Check size={48} />
              </div>
              <h3 className="recharge-success-title">充值成功</h3>
              <p className="recharge-success-points">
                +{success.addedPoints} 积分已到账
              </p>
              <p className="recharge-success-balance">
                当前余额：<strong>{success.pointsRemaining}</strong> 积分
              </p>
              <button
                className="btn btn-secondary recharge-success-btn"
                onClick={() => { setSuccess(null); setSelectedPlanId(null); }}
              >
                <Sparkles size={14} />
                <span>继续充值</span>
              </button>
            </div>
          ) : (
            <>
              {/* 当前余额 */}
              <div className="recharge-balance">
                <Coins size={15} />
                <span className="recharge-balance-label">当前余额</span>
                <span className="recharge-balance-value">{userPoints}</span>
                <span className="recharge-balance-unit">积分</span>
              </div>

              {/* 套餐网格 */}
              <div className="recharge-plans-label">选择充值套餐</div>
              {rechargePlans.length === 0 ? (
                <div className="recharge-empty">暂无可用套餐</div>
              ) : (
                <div className="recharge-plans">
                  {rechargePlans.map((plan) => {
                    const selected = selectedPlanId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        className={`recharge-plan ${selected ? 'recharge-plan--active' : ''}`}
                        onClick={() => setSelectedPlanId(plan.id)}
                        disabled={isRecharging}
                      >
                        {plan.bonus > 0 && (
                          <span className="recharge-plan-tag">
                            <Gift size={10} />
                            赠 {plan.bonus}
                          </span>
                        )}
                        <div className="recharge-plan-points">{plan.points}</div>
                        <div className="recharge-plan-points-unit">积分</div>
                        {plan.bonus > 0 && (
                          <div className="recharge-plan-bonus">含赠 {plan.bonus}</div>
                        )}
                        <div className="recharge-plan-price">¥{plan.price}</div>
                        <div className="recharge-plan-label-text">{plan.label}</div>
                        {selected && (
                          <div className="recharge-plan-check">
                            <Check size={12} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 错误提示 */}
              {error && (
                <div className="error-banner recharge-error">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              {/* 说明 */}
              <div className="recharge-tips">
                <p>· 模拟支付：点击立即支付后积分立即到账，无需真实付款。</p>
                <p>· 积分用于内置模型视频生成，自定义模型不消耗积分。</p>
              </div>
            </>
          )}
        </div>

        {/* 底部操作（仅选择套餐页显示） */}
        {!success && (
          <div className="modal-footer recharge-footer">
            <div className="recharge-footer-info">
              {selectedPlan ? (
                <>
                  <span className="recharge-footer-plan">
                    {selectedPlan.label} · {selectedPlan.points} 积分
                  </span>
                  <span className="recharge-footer-price">¥{selectedPlan.price}</span>
                </>
              ) : (
                <span className="recharge-footer-hint">请选择套餐</span>
              )}
            </div>
            <button
              className="btn btn-primary recharge-pay-btn"
              onClick={handlePay}
              disabled={!selectedPlanId || isRecharging}
            >
              {isRecharging ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>支付中...</span>
                </>
              ) : (
                <>
                  <CreditCard size={15} />
                  <span>{selectedPlan ? `立即支付 ¥${selectedPlan.price}` : '立即支付'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
