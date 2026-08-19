// 用户管理页面：用户列表、搜索、调整积分、编辑、删除
import { useEffect, useState, useCallback } from 'react';
import {
  Input,
  Button,
  Space,
  Modal,
  Form,
  InputNumber,
  Popconfirm,
  message,
  Card,
} from 'antd';
import { EditOutlined, DeleteOutlined, DollarOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usersApi } from '../api';
import ResizableTable from '../components/ResizableTable';

export default function UsersPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  // 调整积分弹窗
  const [adjustModal, setAdjustModal] = useState({ open: false, user: null });
  const [adjustForm] = Form.useForm();
  const [adjustLoading, setAdjustLoading] = useState(false);

  // 编辑弹窗
  const [editModal, setEditModal] = useState({ open: false, user: null });
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);

  // 拉取用户列表
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (keyword) params.keyword = keyword;
      const res = await usersApi.list(params);
      setData(res.list || []);
      setTotal(res.total || 0);
    } catch (err) {
      message.error(err.message || '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 搜索
  const handleSearch = (value) => {
    setKeyword(value || '');
    setPage(1);
  };

  // 打开调整积分弹窗
  const openAdjust = (user) => {
    setAdjustModal({ open: true, user });
    adjustForm.resetFields();
    adjustForm.setFieldsValue({ delta: 0 });
  };

  // 提交调整积分
  const submitAdjust = async () => {
    try {
      const values = await adjustForm.validateFields();
      setAdjustLoading(true);
      await usersApi.adjustPoints(adjustModal.user.id, values.delta);
      message.success('积分调整成功');
      setAdjustModal({ open: false, user: null });
      fetchUsers();
    } catch (err) {
      if (err?.errorFields) return; // 表单校验错误，不提示
      message.error(err.message || '积分调整失败');
    } finally {
      setAdjustLoading(false);
    }
  };

  // 打开编辑弹窗
  const openEdit = (user) => {
    setEditModal({ open: true, user });
    editForm.resetFields();
    editForm.setFieldsValue({ nickname: user.nickname, points: user.points });
  };

  // 提交编辑
  const submitEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      await usersApi.update(editModal.user.id, {
        nickname: values.nickname,
        points: values.points,
      });
      message.success('更新成功');
      setEditModal({ open: false, user: null });
      fetchUsers();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err.message || '更新失败');
    } finally {
      setEditLoading(false);
    }
  };

  // 删除用户
  const handleDelete = async (user) => {
    try {
      await usersApi.remove(user.id);
      message.success('删除成功');
      // 删除后若当前页空了，回到上一页
      if (data.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchUsers();
      }
    } catch (err) {
      message.error(err.message || '删除失败');
    }
  };

  // 批量删除选中的用户
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    try {
      const res = await usersApi.batchRemove(selectedIds);
      message.success(`已删除 ${res.deleted ?? selectedIds.length} 条`);
      setSelectedIds([]);
      // 删除后若当前页空了，回到上一页
      if (selectedIds.length >= data.length && page > 1) {
        setPage(page - 1);
      } else {
        fetchUsers();
      }
    } catch (err) {
      message.error(err.message || '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80, sorter: (a, b) => a.id - b.id },
    {
      title: '用户名',
      dataIndex: 'username',
      width: 140,
      sorter: (a, b) => String(a.username || '').localeCompare(String(b.username || '')),
    },
    {
      title: '昵称',
      dataIndex: 'nickname',
      width: 160,
      sorter: (a, b) => String(a.nickname || '').localeCompare(String(b.nickname || '')),
    },
    {
      title: '积分',
      dataIndex: 'points',
      width: 120,
      sorter: (a, b) => (a.points ?? 0) - (b.points ?? 0),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      width: 180,
      sorter: (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<DollarOutlined />} onClick={() => openAdjust(record)}>
            调整积分
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该用户？"
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
        title="用户管理"
        extra={
          <Space>
            <Input.Search
              placeholder="搜索用户名/昵称"
              allowClear
              onSearch={handleSearch}
              style={{ width: 240 }}
              enterButton
            />
            <Button icon={<ReloadOutlined />} onClick={fetchUsers}>
              刷新
            </Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Popconfirm
            title={`确认删除选中的 ${selectedIds.length} 个用户？`}
            description="删除后不可恢复，关联数据将一并清除"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            disabled={selectedIds.length === 0}
            onConfirm={handleBatchDelete}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedIds.length === 0}
              loading={batchDeleting}
            >
              批量删除{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
            </Button>
          </Popconfirm>
        </Space>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 900 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* 调整积分弹窗 */}
      <Modal
        title={`调整积分 - ${adjustModal.user?.username || ''}`}
        open={adjustModal.open}
        onOk={submitAdjust}
        onCancel={() => setAdjustModal({ open: false, user: null })}
        confirmLoading={adjustLoading}
        okText="确认调整"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={adjustForm} layout="vertical">
          <Form.Item
            name="delta"
            label="积分变动量（正数为增加，负数为扣减）"
            rules={[{ required: true, message: '请输入变动量' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="如 100 或 -50"
              step={1}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑用户弹窗 */}
      <Modal
        title={`编辑用户 - ${editModal.user?.username || ''}`}
        open={editModal.open}
        onOk={submitEdit}
        onCancel={() => setEditModal({ open: false, user: null })}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[{ required: true, message: '请输入昵称' }]}
          >
            <Input placeholder="请输入昵称" />
          </Form.Item>
          <Form.Item
            name="points"
            label="积分"
            rules={[{ required: true, message: '请输入积分' }]}
          >
            <InputNumber style={{ width: '100%' }} placeholder="积分" step={1} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
