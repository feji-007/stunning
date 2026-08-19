// 视频任务管理页面：展示任务列表、统计概览、搜索筛选与详情查看
import { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Input, Select, Tag, Typography, Button, Modal, Spin, Statistic, Space, Descriptions,
} from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { videoApi } from '../api';
import ResizableTable from '../components/ResizableTable';

const { Text } = Typography;

// 状态对应的 Tag 颜色
const STATUS_COLOR = {
  succeeded: 'green',
  failed: 'red',
  running: 'blue',
  queued: 'orange',
};

const STATUS_LABEL = {
  succeeded: '成功',
  failed: '失败',
  running: '运行中',
  queued: '排队中',
};

export default function VideoTasksPage() {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ byStatus: {}, total: 0, todayCount: 0, totalPointsCost: 0 });
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detail, setDetail] = useState(null);

  // 加载任务列表
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await videoApi.tasks({ keyword, status, page, pageSize });
      setTasks(data.list || []);
      setTotal(data.total || 0);
    } catch (err) {
      // 错误静默处理，避免频繁弹窗
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [keyword, status, page, pageSize]);

  // 加载统计数据
  const loadStats = useCallback(async () => {
    try {
      const data = await videoApi.stats();
      setStats(data || { byStatus: {}, total: 0, todayCount: 0, totalPointsCost: 0 });
    } catch {
      // 忽略统计加载错误
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 触发搜索时重置到第一页
  const handleSearch = (val) => {
    setKeyword(val);
    setPage(1);
  };

  const handleStatusChange = (val) => {
    setStatus(val || '');
    setPage(1);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: '用户',
      dataIndex: 'username',
      width: 120,
      sorter: (a, b) => String(a.username || '').localeCompare(String(b.username || '')),
      render: (v, r) => v || r.nickname || r.userId,
    },
    {
      title: '模型',
      dataIndex: 'model',
      width: 140,
      sorter: (a, b) => String(a.model || '').localeCompare(String(b.model || '')),
      render: (v) => v || '-',
    },
    {
      title: '提示词',
      dataIndex: 'prompt',
      ellipsis: true,
      render: (v) => (
        <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 240 }}>
          {v || '-'}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      sorter: (a, b) => String(a.status || '').localeCompare(String(b.status || '')),
      render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{STATUS_LABEL[v] || v}</Tag>,
    },
    {
      title: '积分消耗',
      dataIndex: 'pointsCost',
      width: 100,
      sorter: (a, b) => (a.pointsCost ?? 0) - (b.pointsCost ?? 0),
      render: (v) => v ?? 0,
    },
    {
      title: '已退还',
      dataIndex: 'refunded',
      width: 80,
      sorter: (a, b) => (a.refunded ? 1 : 0) - (b.refunded ? 1 : 0),
      render: (v) => (v ? <Tag color="gold">✓</Tag> : <Text type="secondary">✗</Text>),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      sorter: (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)}>
          详情
        </Button>
      ),
    },
  ];

  const byStatus = stats.byStatus || {};

  return (
    <div>
      {/* 顶部统计卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic title="总任务数" value={stats.total ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic title="今日生成数" value={stats.todayCount ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic title="累计消耗积分" value={stats.totalPointsCost ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic title="成功 / 失败" value={`${byStatus.succeeded?.count ?? 0} / ${byStatus.failed?.count ?? 0}`} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic title="运行中" value={byStatus.running?.count ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic title="排队中" value={byStatus.queued?.count ?? 0} />
          </Card>
        </Col>
      </Row>

      {/* 搜索栏 */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索用户名 / 提示词"
          allowClear
          style={{ width: 260 }}
          onSearch={handleSearch}
          enterButton
        />
        <Select
          placeholder="状态筛选"
          allowClear
          style={{ width: 140 }}
          value={status || undefined}
          onChange={handleStatusChange}
          options={[
            { label: '全部', value: '' },
            { label: '排队中', value: 'queued' },
            { label: '运行中', value: 'running' },
            { label: '成功', value: 'succeeded' },
            { label: '失败', value: 'failed' },
          ]}
        />
      </Space>

      {/* 任务表格 */}
      <ResizableTable
        rowKey="id"
        columns={columns}
        dataSource={tasks}
        loading={loading}
        scroll={{ x: 980 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* 详情弹窗 */}
      <Modal
        title={`任务详情 #${detail?.id ?? ''}`}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={720}
      >
        {detail && (
          <Spin spinning={false}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="用户">{detail.username || detail.nickname || detail.userId}</Descriptions.Item>
              <Descriptions.Item label="模型" span={2}>{detail.model || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_COLOR[detail.status] || 'default'}>
                  {STATUS_LABEL[detail.status] || detail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="积分消耗">{detail.pointsCost ?? 0}</Descriptions.Item>
              <Descriptions.Item label="已退还">
                {detail.refunded ? <Tag color="gold">✓ 已退还</Tag> : '✗'}
              </Descriptions.Item>
              <Descriptions.Item label="提供方">{detail.provider || '-'}</Descriptions.Item>
              <Descriptions.Item label="提示词" span={2}>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detail.prompt || '-'}</div>
              </Descriptions.Item>
              <Descriptions.Item label="参数" span={2}>
                {detail.params ? (
                  <pre style={{ margin: 0, background: '#fafafa', padding: 8, borderRadius: 4 }}>
                    {JSON.stringify(detail.params, null, 2)}
                  </pre>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Ark 任务 ID" span={2}>
                {detail.arkTaskId || '-'}
              </Descriptions.Item>
              {detail.videoUrl && (
                <Descriptions.Item label="视频地址" span={2}>
                  <a href={detail.videoUrl} target="_blank" rel="noreferrer">
                    {detail.videoUrl}
                  </a>
                </Descriptions.Item>
              )}
              {detail.error && (
                <Descriptions.Item label="错误信息" span={2}>
                  <Text type="danger" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {detail.error}
                  </Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="创建时间">
                {detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Spin>
        )}
      </Modal>
    </div>
  );
}
