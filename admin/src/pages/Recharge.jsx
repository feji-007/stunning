/**
 * 充值套餐管理页面
 *
 * - 顶部展示累计充值统计（金额 / 积分 / 订单数）
 * - 主体：套餐列表 Table，支持新增 / 编辑 / 删除
 * - 任何增删改后整体调用 savePlans 持久化，并刷新统计
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Statistic, Table, Button, Modal, Form,
  Input, InputNumber, Popconfirm, Space, message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { rechargeApi } from '../api';

export default function RechargePage() {
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState({ total: {}, today: {} });
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null=新增，对象=编辑
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // 加载套餐列表
  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rechargeApi.plans();
      setPlans(data.plans || []);
    } catch (err) {
      message.error(err.message || '加载套餐失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载统计数据
  const loadStats = useCallback(async () => {
    try {
      const data = await rechargeApi.stats();
      setStats(data || { total: {}, today: {} });
    } catch (err) {
      message.error(err.message || '加载统计失败');
    }
  }, []);

  useEffect(() => {
    loadPlans();
    loadStats();
  }, [loadPlans, loadStats]);

  // 整体保存套餐
  const saveAll = useCallback(async (nextPlans) => {
    setSubmitting(true);
    try {
      const data = await rechargeApi.savePlans(nextPlans);
      setPlans(data.plans || nextPlans);
      message.success('保存成功');
      await loadStats();
    } catch (err) {
      message.error(err.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  }, [loadStats]);

  // 打开新增
  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  // 打开编辑
  const handleEdit = (record) => {
    setEditing(record);
    setModalOpen(true);
  };

  // 弹窗打开后填充表单（确保 Form 已挂载）
  useEffect(() => {
    if (!modalOpen) return;
    if (editing) {
      form.setFieldsValue(editing);
    } else {
      form.resetFields();
    }
  }, [modalOpen, editing, form]);

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      let nextPlans;
      if (editing) {
        nextPlans = plans.map((p) => (p.id === editing.id ? { ...p, ...values } : p));
      } else {
        if (plans.some((p) => p.id === values.id)) {
          message.error('套餐 ID 已存在');
          return;
        }
        nextPlans = [...plans, values];
      }
      setModalOpen(false);
      await saveAll(nextPlans);
    } catch {
      // 校验失败，留在弹窗
    }
  };

  // 删除
  const handleDelete = async (record) => {
    const nextPlans = plans.filter((p) => p.id !== record.id);
    await saveAll(nextPlans);
  };

  const columns = [
    { title: '套餐ID', dataIndex: 'id', key: 'id' },
    { title: '标签', dataIndex: 'label', key: 'label' },
    { title: '价格(元)', dataIndex: 'price', key: 'price' },
    { title: '积分', dataIndex: 'points', key: 'points' },
    { title: '赠送', dataIndex: 'bonus', key: 'bonus' },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm
            title="确认删除该套餐？"
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>充值套餐管理</h2>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="累计充值金额(元)" value={stats.total?.totalAmount ?? 0} precision={2} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="累计充值积分" value={stats.total?.totalPoints ?? 0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="累计订单数" value={stats.total?.orderCount ?? 0} />
          </Card>
        </Col>
      </Row>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增套餐</Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={plans}
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editing ? '编辑套餐' : '新增套餐'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ bonus: 0 }}>
          <Form.Item name="id" label="套餐ID" rules={[{ required: true, message: '请输入套餐ID' }]}>
            <Input placeholder="如 plan_10" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="label" label="标签" rules={[{ required: true, message: '请输入标签' }]}>
            <Input placeholder="如 入门" />
          </Form.Item>
          <Form.Item name="price" label="价格(元)" rules={[{ required: true, message: '请输入价格' }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="价格" />
          </Form.Item>
          <Form.Item name="points" label="积分" rules={[{ required: true, message: '请输入积分' }]}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder="积分" />
          </Form.Item>
          <Form.Item name="bonus" label="赠送" rules={[{ required: true, message: '请输入赠送积分' }]}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder="默认 0" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
