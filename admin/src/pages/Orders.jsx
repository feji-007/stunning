/**
 * 充值订单记录页面
 *
 * - 顶部搜索栏：关键字搜索 + 状态筛选
 * - 订单列表 Table，支持分页
 * - 状态筛选变化或搜索时重置到第 1 页
 */
import { useState, useEffect, useCallback } from 'react';
import { Input, Select, Tag, Space, message } from 'antd';
import dayjs from 'dayjs';
import { rechargeApi } from '../api';
import ResizableTable from '../components/ResizableTable';

// 状态筛选选项：值 '' 表示全部
const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'pending', label: 'pending' },
  { value: 'paid', label: 'paid' },
  { value: 'cancelled', label: 'cancelled' },
];

// 状态对应的 Tag 颜色
const STATUS_TAG_COLOR = {
  paid: 'green',
  pending: 'orange',
  cancelled: 'default',
};

export default function OrdersPage() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 加载订单列表
  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (keyword) params.keyword = keyword;
      if (status) params.status = status;
      const data = await rechargeApi.orders(params);
      setList(data.list || []);
      setTotal(data.total || 0);
    } catch (err) {
      message.error(err.message || '加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // 关键字搜索：重置到第 1 页
  const handleSearch = (value) => {
    setKeyword(value);
    setPage(1);
  };

  // 状态筛选变化：重置到第 1 页
  const handleStatusChange = (value) => {
    setStatus(value);
    setPage(1);
  };

  const columns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 200,
      sorter: (a, b) => String(a.orderNo || '').localeCompare(String(b.orderNo || '')),
    },
    {
      title: '用户',
      key: 'user',
      width: 160,
      render: (_, r) => (
        <span>
          {r.username}
          {r.nickname ? ` (${r.nickname})` : ''}
        </span>
      ),
    },
    {
      title: '套餐',
      dataIndex: 'planId',
      key: 'planId',
      width: 120,
      sorter: (a, b) => String(a.planId || '').localeCompare(String(b.planId || '')),
    },
    {
      title: '金额(元)',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      sorter: (a, b) => (a.price ?? 0) - (b.price ?? 0),
    },
    {
      title: '积分',
      dataIndex: 'points',
      key: 'points',
      width: 100,
      sorter: (a, b) => (a.points ?? 0) - (b.points ?? 0),
    },
    {
      title: '赠送',
      dataIndex: 'bonus',
      key: 'bonus',
      width: 100,
      sorter: (a, b) => (a.bonus ?? 0) - (b.bonus ?? 0),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      sorter: (a, b) => String(a.status || '').localeCompare(String(b.status || '')),
      render: (s) => <Tag color={STATUS_TAG_COLOR[s] || 'default'}>{s}</Tag>,
    },
    {
      title: '支付时间',
      dataIndex: 'paidAt',
      key: 'paidAt',
      width: 170,
      sorter: (a, b) => new Date(a.paidAt || 0).getTime() - new Date(b.paidAt || 0).getTime(),
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      sorter: (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>充值订单记录</h2>

      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索订单号 / 用户"
          allowClear
          onSearch={handleSearch}
          style={{ width: 260 }}
        />
        <Select
          value={status}
          onChange={handleStatusChange}
          options={STATUS_OPTIONS}
          style={{ width: 140 }}
        />
      </Space>

      <ResizableTable
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={loading}
        scroll={{ x: 1200 }}
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
    </div>
  );
}
