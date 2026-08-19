// 用户自定义模型配置页面：展示各用户的自定义模型配置（baseURL/apiKey/modelId/provider）
import { useState, useEffect, useCallback } from 'react';
import {
  Input, Space, Tag, Typography, Button, Modal, Descriptions, Tooltip,
} from 'antd';
import { EyeOutlined, KeyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { userSettingsApi } from '../api';
import ResizableTable from '../components/ResizableTable';

const { Text } = Typography;

const PROVIDER_LABEL = {
  custom: '自定义模型',
  seedance: '内置模型',
};

const PROVIDER_COLOR = {
  custom: 'blue',
  seedance: 'green',
};

// API Key 掩码：仅显示前 4 + 后 4，中间用 **** 代替
function maskApiKey(key) {
  if (!key) return '-';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export default function UserSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detail, setDetail] = useState(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userSettingsApi.list({ keyword, page, pageSize });
      setList(data.list || []);
      setTotal(data.total || 0);
    } catch {
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize]);

  useEffect(() => { loadList(); }, [loadList]);

  const handleSearch = (val) => {
    setKeyword(val);
    setPage(1);
  };

  const columns = [
    {
      title: '用户 ID',
      dataIndex: 'userId',
      width: 90,
      sorter: (a, b) => a.userId - b.userId,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      width: 130,
      sorter: (a, b) => String(a.username || '').localeCompare(String(b.username || '')),
      render: (v, r) => v || r.nickname || r.userId,
    },
    {
      title: '昵称',
      dataIndex: 'nickname',
      width: 130,
      render: (v) => v || '-',
    },
    {
      title: '提供商',
      dataIndex: 'videoProvider',
      width: 110,
      sorter: (a, b) => String(a.videoProvider || '').localeCompare(String(b.videoProvider || '')),
      render: (v) => (
        <Tag color={PROVIDER_COLOR[v] || 'default'}>
          {PROVIDER_LABEL[v] || v || '-'}
        </Tag>
      ),
    },
    {
      title: 'Base URL',
      dataIndex: ['customVideo', 'baseURL'],
      width: 240,
      ellipsis: true,
      render: (v) => (
        <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 220 }}>
          {v || '-'}
        </Text>
      ),
    },
    {
      title: 'API Key',
      dataIndex: ['customVideo', 'apiKey'],
      width: 160,
      render: (v) => (
        <Space size={4}>
          <KeyOutlined style={{ color: v ? '#52c41a' : '#bfbfbf' }} />
          <Text code style={{ fontSize: 12 }}>{maskApiKey(v)}</Text>
        </Space>
      ),
    },
    {
      title: '模型 ID',
      dataIndex: ['customVideo', 'modelId'],
      width: 200,
      ellipsis: true,
      render: (v) => (
        <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 180 }}>
          {v || '-'}
        </Text>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      sorter: (a, b) => (a.updatedAt || 0) - (b.updatedAt || 0),
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

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索用户名 / 昵称"
          allowClear
          style={{ width: 260 }}
          onSearch={handleSearch}
          enterButton
        />
      </Space>

      <ResizableTable
        rowKey="userId"
        columns={columns}
        dataSource={list}
        loading={loading}
        scroll={{ x: 1100 }}
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

      {/* 详情弹窗：显示完整 API Key */}
      <Modal
        title={`自定义模型配置 - ${detail?.username || detail?.nickname || `用户 #${detail?.userId ?? ''}`}`}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={640}
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="用户 ID">{detail.userId}</Descriptions.Item>
            <Descriptions.Item label="用户名">{detail.username || '-'}</Descriptions.Item>
            <Descriptions.Item label="昵称">{detail.nickname || '-'}</Descriptions.Item>
            <Descriptions.Item label="提供商">
              <Tag color={PROVIDER_COLOR[detail.videoProvider] || 'default'}>
                {PROVIDER_LABEL[detail.videoProvider] || detail.videoProvider || '-'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Base URL">
              {detail.customVideo?.baseURL || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="API Key">
              {detail.customVideo?.apiKey ? (
                <Tooltip title="完整 API Key，仅管理员可见">
                  <Text code copyable>{detail.customVideo.apiKey}</Text>
                </Tooltip>
              ) : (
                <Text type="secondary">未配置</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="模型 ID">
              {detail.customVideo?.modelId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
