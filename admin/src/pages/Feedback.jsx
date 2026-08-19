/**
 * 用户意见反馈页面
 *
 * - 顶部搜索栏：关键字搜索 + 状态筛选（全部/未读/已读）+ 分类筛选
 * - 反馈列表 Table，支持分页
 * - 每条反馈支持：标记已读 / 标记未读 / 删除
 * - 点击反馈行展开查看完整内容
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Input, Select, Tag, Space, Button, Popconfirm, Tooltip, message, Card,
} from 'antd';
import {
  ReloadOutlined, DeleteOutlined, CheckOutlined, EyeOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { feedbackApi } from '../api';
import ResizableTable from '../components/ResizableTable';

// 状态筛选选项
const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' },
];

// 分类筛选选项
const CATEGORY_OPTIONS = [
  { value: '', label: '全部分类' },
  { value: 'bug', label: '缺陷报告' },
  { value: 'feature', label: '功能建议' },
  { value: 'experience', label: '体验问题' },
  { value: 'other', label: '其他' },
];

// 分类标签颜色
const CATEGORY_TAG_COLOR = {
  bug: 'red',
  feature: 'blue',
  experience: 'orange',
  other: 'default',
};

export default function FeedbackPage() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (keyword) params.keyword = keyword;
      if (status) params.status = status;
      if (category) params.category = category;
      const data = await feedbackApi.list(params);
      setList(data.list || []);
      setTotal(data.total || 0);
    } catch (err) {
      message.error(err.message || '加载反馈列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status, category]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleSearch = (value) => {
    setKeyword(value);
    setPage(1);
  };

  const handleStatusChange = (value) => {
    setStatus(value);
    setPage(1);
  };

  const handleCategoryChange = (value) => {
    setCategory(value);
    setPage(1);
  };

  // 切换已读 / 未读
  const handleToggleRead = async (record) => {
    try {
      await feedbackApi.markRead(record.id, !record.isRead);
      message.success(record.isRead ? '已标记为未读' : '已标记为已读');
      loadList();
    } catch (err) {
      message.error(err.message || '操作失败');
    }
  };

  // 删除
  const handleDelete = async (record) => {
    try {
      await feedbackApi.remove(record.id);
      message.success('已删除');
      // 删除后若当前页空了，回到上一页
      if (list.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        loadList();
      }
    } catch (err) {
      message.error(err.message || '删除失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70,
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: '状态',
      dataIndex: 'isRead',
      key: 'isRead',
      width: 90,
      sorter: (a, b) => (a.isRead ? 1 : 0) - (b.isRead ? 1 : 0),
      render: (isRead) =>
        isRead ? <Tag color="default">已读</Tag> : <Tag color="orange">未读</Tag>,
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      sorter: (a, b) => String(a.category || '').localeCompare(String(b.category || '')),
      render: (cat, r) => (
        <Tag color={CATEGORY_TAG_COLOR[cat] || 'default'}>
          {r.categoryLabel || cat}
        </Tag>
      ),
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text} placement="topLeft">
          <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '联系方式',
      dataIndex: 'contact',
      key: 'contact',
      width: 160,
      sorter: (a, b) => String(a.contact || '').localeCompare(String(b.contact || '')),
      render: (v) => v || <span style={{ color: '#bbb' }}>-</span>,
    },
    {
      title: '提交用户',
      key: 'user',
      width: 160,
      render: (_, r) => (
        <span>
          {r.username || `#${r.userId}`}
          {r.nickname ? ` (${r.nickname})` : ''}
        </span>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      sorter: (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={record.isRead ? <EyeInvisibleOutlined /> : <CheckOutlined />}
            onClick={() => handleToggleRead(record)}
          >
            {record.isRead ? '标记未读' : '标记已读'}
          </Button>
          <Popconfirm
            title="确认删除该反馈？"
            description="删除后不可恢复"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => handleDelete(record)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="用户意见反馈"
        extra={
          <Space wrap>
            <Input.Search
              placeholder="搜索内容 / 用户名 / 昵称"
              allowClear
              onSearch={handleSearch}
              style={{ width: 240 }}
            />
            <Select
              value={status}
              onChange={handleStatusChange}
              options={STATUS_OPTIONS}
              style={{ width: 120 }}
            />
            <Select
              value={category}
              onChange={handleCategoryChange}
              options={CATEGORY_OPTIONS}
              style={{ width: 130 }}
            />
            <Button icon={<ReloadOutlined />} onClick={loadList}>
              刷新
            </Button>
          </Space>
        }
      >
        <ResizableTable
          rowKey="id"
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
      </Card>
    </div>
  );
}
