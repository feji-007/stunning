// 仪表盘页面：展示用户数、视频任务、充值等系统概览统计
import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Spin, Descriptions, message, Alert, Button } from 'antd';
import {
  UserOutlined,
  VideoCameraOutlined,
  TransactionOutlined,
  DollarOutlined,
  ThunderboltOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { usersApi, videoApi, rechargeApi, feedbackApi } from '../api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userTotal, setUserTotal] = useState(0);
  const [videoStats, setVideoStats] = useState(null);
  const [rechargeStats, setRechargeStats] = useState(null);
  const [unreadFeedback, setUnreadFeedback] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 并行加载所有统计数据
        const [usersRes, videoRes, rechargeRes, feedbackRes] = await Promise.all([
          usersApi.list({ page: 1, pageSize: 1 }),
          videoApi.stats(),
          rechargeApi.stats(),
          feedbackApi.unreadCount().catch(() => ({ count: 0 })),
        ]);
        if (cancelled) return;
        setUserTotal(usersRes.total || 0);
        setVideoStats(videoRes || null);
        setRechargeStats(rechargeRes || null);
        setUnreadFeedback(feedbackRes?.count || 0);
      } catch (err) {
        if (!cancelled) message.error(err.message || '加载统计数据失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const byStatus = videoStats?.byStatus || {};
  const total = rechargeStats?.total || {};
  const today = rechargeStats?.today || {};

  return (
    <div>
      {/* 未读反馈提醒（仅当有未读时显示） */}
      {unreadFeedback > 0 && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          icon={<MessageOutlined />}
          message={`您有 ${unreadFeedback} 条未读的用户意见反馈`}
          description="点击右侧按钮前往处理。处理完成后此提醒将自动消失。"
          action={
            <Button size="small" type="primary" onClick={() => navigate('/feedback')}>
              前往查看
            </Button>
          }
        />
      )}

      {/* 顶部概览统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8} lg={6} xl={5}>
          <Card>
            <Statistic
              title="总用户数"
              value={userTotal}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6} xl={5}>
          <Card>
            <Statistic
              title="今日视频生成数"
              value={videoStats?.todayCount || 0}
              prefix={<VideoCameraOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6} xl={5}>
          <Card>
            <Statistic
              title="总视频任务数"
              value={videoStats?.total || 0}
              prefix={<VideoCameraOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6} xl={5}>
          <Card>
            <Statistic
              title="累计充值金额"
              value={total.totalAmount || 0}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6} xl={4}>
          <Card>
            <Statistic
              title="累计充值积分"
              value={total.totalPoints || 0}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 视频任务状态分布 + 充值统计 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="视频任务状态分布">
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Statistic title="成功" value={byStatus.succeeded?.count || 0} valueStyle={{ color: '#3f8600' }} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="失败" value={byStatus.failed?.count || 0} valueStyle={{ color: '#cf1322' }} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="进行中" value={byStatus.running?.count || 0} valueStyle={{ color: '#1677ff' }} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="排队中" value={byStatus.queued?.count || 0} valueStyle={{ color: '#fa8c16' }} />
              </Col>
            </Row>
            <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="累计消耗积分">
                {videoStats?.totalPointsCost || 0}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="充值统计" extra={<TransactionOutlined />}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="今日订单数">
                {today.orderCount || 0}
              </Descriptions.Item>
              <Descriptions.Item label="今日充值金额">
                {Number(today.totalAmount || 0).toFixed(2)} 元
              </Descriptions.Item>
              <Descriptions.Item label="累计订单数">
                {total.orderCount || 0}
              </Descriptions.Item>
              <Descriptions.Item label="累计充值金额">
                {Number(total.totalAmount || 0).toFixed(2)} 元
              </Descriptions.Item>
              <Descriptions.Item label="累计充值积分">
                {total.totalPoints || 0}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
