// 系统配置页面：方舟 API、积分规则、充值套餐、内置模型 4 个 Tab
import { useState, useEffect, useCallback } from 'react';
import {
  Tabs, Form, Input, InputNumber, Button, Alert, Spin, Table, message, Typography, Space, Popconfirm,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { settingsApi } from '../api';

const { Text } = Typography;

// 默认空值，避免后端缺失某项时崩溃
const DEFAULT_ARK = { baseURL: '', apiKey: '', defaultModel: '' };
const DEFAULT_VIDEO_POINTS = { basePerSecond: 1, hdMultiplier: 2 };

// 内部行索引计数器，保证新增行有稳定唯一 key
let rowSeq = 0;

// 充值套餐新行生成器
const newPlan = () => ({
  _key: `plan_${Date.now()}_${++rowSeq}`,
  id: `plan_${Date.now()}`,
  label: '',
  price: 0,
  points: 0,
  bonus: 0,
});

// 内置模型新行生成器
const newModel = () => ({
  _key: `model_${Date.now()}_${++rowSeq}`,
  id: `model_${Date.now()}`,
  name: '',
  desc: '',
});

// 加载数据时为每行补一个内部 key
const ensureKey = (arr, prefix) => (arr || []).map((item, i) => ({
  _key: item._key || `${prefix}_${i}_${++rowSeq}`,
  ...item,
}));

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  // 各 Tab 本地编辑状态
  const [ark, setArk] = useState(DEFAULT_ARK);
  const [videoPoints, setVideoPoints] = useState(DEFAULT_VIDEO_POINTS);
  const [plans, setPlans] = useState([]);
  const [models, setModels] = useState([]);
  // 元信息（描述、更新时间）
  const [meta, setMeta] = useState({});

  // 加载所有配置
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await settingsApi.list();
      const settings = data.settings || [];
      const metaMap = {};
      settings.forEach((item) => {
        metaMap[item.key] = { description: item.description, updatedAt: item.updatedAt };
        const v = item.value;
        if (item.key === 'ark') {
          setArk({ ...DEFAULT_ARK, ...(v && typeof v === 'object' ? v : {}) });
        } else if (item.key === 'videoPoints') {
          setVideoPoints({ ...DEFAULT_VIDEO_POINTS, ...(v && typeof v === 'object' ? v : {}) });
        } else if (item.key === 'rechargePlans') {
          setPlans(ensureKey(v, 'plan'));
        } else if (item.key === 'seedanceModels') {
          setModels(ensureKey(v, 'model'));
        }
      });
      setMeta(metaMap);
    } catch (err) {
      message.error(err.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 通用保存，剔除本地 _key 字段
  const handleSave = async (key, value) => {
    setSavingKey(key);
    try {
      let payload = value;
      if (Array.isArray(value)) {
        payload = value.map(({ _key, ...rest }) => rest);
      }
      await settingsApi.update(key, payload);
      message.success('保存成功');
      // 刷新元信息
      setMeta((prev) => ({
        ...prev,
        [key]: { ...prev[key], updatedAt: new Date().toISOString() },
      }));
    } catch (err) {
      message.error(err.message || '保存失败');
    } finally {
      setSavingKey('');
    }
  };

  // ===== Tab 3: 充值套餐行操作 =====
  const updatePlan = (idx, field, val) => {
    setPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  };
  const addPlan = () => setPlans((prev) => [...prev, newPlan()]);
  const removePlan = (idx) => setPlans((prev) => prev.filter((_, i) => i !== idx));

  // ===== Tab 4: 内置模型行操作 =====
  const updateModel = (idx, field, val) => {
    setModels((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: val } : m)));
  };
  const addModel = () => setModels((prev) => [...prev, newModel()]);
  const removeModel = (idx) => setModels((prev) => prev.filter((_, i) => i !== idx));

  const planColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 180,
      render: (v, r, idx) => (
        <Input value={v} onChange={(e) => updatePlan(idx, 'id', e.target.value)} size="small" />
      ),
    },
    {
      title: '标签',
      dataIndex: 'label',
      width: 160,
      render: (v, r, idx) => (
        <Input value={v} onChange={(e) => updatePlan(idx, 'label', e.target.value)} size="small" placeholder="如：基础套餐" />
      ),
    },
    {
      title: '价格(元)',
      dataIndex: 'price',
      width: 120,
      render: (v, r, idx) => (
        <InputNumber value={v} min={0} step={0.01} onChange={(val) => updatePlan(idx, 'price', val ?? 0)} size="small" style={{ width: '100%' }} />
      ),
    },
    {
      title: '积分',
      dataIndex: 'points',
      width: 120,
      render: (v, r, idx) => (
        <InputNumber value={v} min={0} step={1} onChange={(val) => updatePlan(idx, 'points', val ?? 0)} size="small" style={{ width: '100%' }} />
      ),
    },
    {
      title: '赠送',
      dataIndex: 'bonus',
      width: 120,
      render: (v, r, idx) => (
        <InputNumber value={v} min={0} step={1} onChange={(val) => updatePlan(idx, 'bonus', val ?? 0)} size="small" style={{ width: '100%' }} />
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_, r, idx) => (
        <Popconfirm title="确认删除该套餐？" onConfirm={() => removePlan(idx)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  const modelColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 200,
      render: (v, r, idx) => (
        <Input value={v} onChange={(e) => updateModel(idx, 'id', e.target.value)} size="small" />
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
      render: (v, r, idx) => (
        <Input value={v} onChange={(e) => updateModel(idx, 'name', e.target.value)} size="small" placeholder="如：Seedance 1.0" />
      ),
    },
    {
      title: '描述',
      dataIndex: 'desc',
      render: (v, r, idx) => (
        <Input value={v} onChange={(e) => updateModel(idx, 'desc', e.target.value)} size="small" />
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_, r, idx) => (
        <Popconfirm title="确认删除该模型？" onConfirm={() => removeModel(idx)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  // 计算示例积分
  const example720 = (Number(videoPoints.basePerSecond) || 0) * 5;
  const example1080 = (Number(videoPoints.basePerSecond) || 0) * 5 * (Number(videoPoints.hdMultiplier) || 0);

  const tabItems = [
    {
      key: 'ark',
      label: '方舟 API 配置',
      children: (
        <div>
          <Alert
            type="info"
            showIcon
            message="此 Key 用于内置模型视频生成，由服务器调用方舟 API"
            style={{ marginBottom: 16 }}
          />
          <Form layout="vertical" style={{ maxWidth: 560 }}>
            <Form.Item label="Base URL">
              <Input
                value={ark.baseURL}
                onChange={(e) => setArk({ ...ark, baseURL: e.target.value })}
                placeholder="https://ark.cn-beijing.volces.com/api/v3"
              />
            </Form.Item>
            <Form.Item label="API Key">
              <Input.Password
                value={ark.apiKey}
                onChange={(e) => setArk({ ...ark, apiKey: e.target.value })}
                placeholder="方舟 API Key"
              />
            </Form.Item>
            <Form.Item label="默认模型">
              <Input
                value={ark.defaultModel}
                onChange={(e) => setArk({ ...ark, defaultModel: e.target.value })}
                placeholder="如：seedance-1-0-lite-i2v"
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingKey === 'ark'}
                onClick={() => handleSave('ark', ark)}
              >
                保存
              </Button>
              {meta.ark?.updatedAt && (
                <Text type="secondary" style={{ marginLeft: 12 }}>
                  上次更新：{new Date(meta.ark.updatedAt).toLocaleString()}
                </Text>
              )}
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: 'videoPoints',
      label: '积分规则',
      children: (
        <div>
          <Form layout="vertical" style={{ maxWidth: 560 }}>
            <Form.Item label="每秒基础消耗 (basePerSecond)">
              <InputNumber
                value={videoPoints.basePerSecond}
                min={0}
                step={1}
                onChange={(val) => setVideoPoints({ ...videoPoints, basePerSecond: val ?? 0 })}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item label="1080p 倍率 (hdMultiplier)">
              <InputNumber
                value={videoPoints.hdMultiplier}
                min={1}
                step={0.1}
                onChange={(val) => setVideoPoints({ ...videoPoints, hdMultiplier: val ?? 1 })}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <div>
                  <div>5 秒 720p = 5 × base × 1 = <Text strong>{example720}</Text> 积分</div>
                  <div>5 秒 1080p = 5 × base × hdMultiplier = <Text strong>{example1080}</Text> 积分</div>
                </div>
              }
            />
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingKey === 'videoPoints'}
                onClick={() => handleSave('videoPoints', videoPoints)}
              >
                保存
              </Button>
              {meta.videoPoints?.updatedAt && (
                <Text type="secondary" style={{ marginLeft: 12 }}>
                  上次更新：{new Date(meta.videoPoints.updatedAt).toLocaleString()}
                </Text>
              )}
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: 'rechargePlans',
      label: '充值套餐',
      children: (
        <div>
          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={addPlan}>新增套餐</Button>
            <Button
              icon={<SaveOutlined />}
              loading={savingKey === 'rechargePlans'}
              onClick={() => handleSave('rechargePlans', plans)}
            >
              保存全部
            </Button>
            {meta.rechargePlans?.updatedAt && (
              <Text type="secondary">
                上次更新：{new Date(meta.rechargePlans.updatedAt).toLocaleString()}
              </Text>
            )}
          </Space>
          <Table
            rowKey="_key"
            columns={planColumns}
            dataSource={plans}
            pagination={false}
            size="small"
            scroll={{ x: 800 }}
            locale={{ emptyText: '暂无套餐，点击"新增套餐"添加' }}
          />
        </div>
      ),
    },
    {
      key: 'seedanceModels',
      label: '内置模型',
      children: (
        <div>
          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={addModel}>新增模型</Button>
            <Button
              icon={<SaveOutlined />}
              loading={savingKey === 'seedanceModels'}
              onClick={() => handleSave('seedanceModels', models)}
            >
              保存全部
            </Button>
            {meta.seedanceModels?.updatedAt && (
              <Text type="secondary">
                上次更新：{new Date(meta.seedanceModels.updatedAt).toLocaleString()}
              </Text>
            )}
          </Space>
          <Table
            rowKey="_key"
            columns={modelColumns}
            dataSource={models}
            pagination={false}
            size="small"
            scroll={{ x: 720 }}
            locale={{ emptyText: '暂无模型，点击"新增模型"添加' }}
          />
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Tabs
      defaultActiveKey="ark"
      items={tabItems}
      destroyInactiveTabPane={false}
    />
  );
}
