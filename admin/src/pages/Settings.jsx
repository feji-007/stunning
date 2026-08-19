// 系统配置页面：用户赠送积分 / 视频参数 / 本地模型服务 / 积分规则 / 充值套餐 / 内置模型
import { useState, useEffect, useCallback } from 'react';
import {
  Tabs, Form, Input, InputNumber, Button, Alert, Spin, Table, message, Typography, Space, Popconfirm, Switch,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { settingsApi } from '../api';

const { Text } = Typography;

// 默认空值（兜底）
const DEFAULT_LOCAL_SERVICE = { baseURL: '', apiKey: '', enabled: false };
const DEFAULT_VIDEO_POINTS = { basePerSecond: 1, hdMultiplier: 2 };
const DEFAULT_VIDEO_PARAMS = {
  durations: [5, 10],
  resolutions: ['720p', '1080p'],
  ratios: [
    { value: '16:9', label: '横屏 16:9' },
    { value: '9:16', label: '竖屏 9:16' },
    { value: '1:1',  label: '方形 1:1' },
    { value: '4:3',  label: '横屏 4:3' },
    { value: '3:4',  label: '竖屏 3:4' },
    { value: '21:9', label: '宽屏 21:9' },
  ],
  defaultDuration: 5,
  defaultResolution: '720p',
  defaultRatio: '16:9',
  defaultWatermark: false,
  defaultSeed: -1,
};
const DEFAULT_DEFAULT_POINTS = 100;

// 内部行索引计数器，保证新增行有稳定唯一 key
let rowSeq = 0;

const newPlan = () => ({
  _key: `plan_${Date.now()}_${++rowSeq}`,
  id: `plan_${Date.now()}`,
  label: '',
  price: 0,
  points: 0,
  bonus: 0,
});
const newModel = () => ({
  _key: `model_${Date.now()}_${++rowSeq}`,
  id: `model_${Date.now()}`,
  name: '',
  desc: '',
});
const newDuration = () => ({ _key: `dur_${Date.now()}_${++rowSeq}`, value: 5 });
const newResolution = () => ({ _key: `res_${Date.now()}_${++rowSeq}`, value: '720p' });
const newRatio = () => ({ _key: `rat_${Date.now()}_${++rowSeq}`, value: '16:9', label: '' });

const ensureKey = (arr, prefix) => (arr || []).map((item, i) => ({
  _key: item._key || `${prefix}_${i}_${++rowSeq}`,
  ...item,
}));
const ensureKeyRatio = (arr) => (arr || []).map((item, i) => ({
  _key: item._key || `rat_${i}_${++rowSeq}`,
  value: item.value,
  label: item.label,
}));

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  // 各 Tab 本地编辑状态
  const [defaultPoints, setDefaultPoints] = useState(DEFAULT_DEFAULT_POINTS);
  const [videoParams, setVideoParams] = useState(DEFAULT_VIDEO_PARAMS);
  // 为便于 Table 编辑：将数组转为带 _key 的对象行
  const [durationRows, setDurationRows] = useState([]);
  const [resolutionRows, setResolutionRows] = useState([]);
  const [ratioRows, setRatioRows] = useState([]);

  const [localService, setLocalService] = useState(DEFAULT_LOCAL_SERVICE);
  const [videoPoints, setVideoPoints] = useState(DEFAULT_VIDEO_POINTS);
  const [plans, setPlans] = useState([]);
  const [models, setModels] = useState([]);
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
        if (item.key === 'defaultPoints') {
          setDefaultPoints(typeof v === 'number' ? v : Number(v) || DEFAULT_DEFAULT_POINTS);
        } else if (item.key === 'videoParams') {
          const merged = { ...DEFAULT_VIDEO_PARAMS, ...(v && typeof v === 'object' ? v : {}) };
          setVideoParams(merged);
          setDurationRows((merged.durations || []).map((d) => ({ _key: `dur_${rowSeq++}`, value: d })));
          setResolutionRows((merged.resolutions || []).map((r) => ({ _key: `res_${rowSeq++}`, value: r })));
          setRatioRows((merged.ratios || []).map((r) => ({ _key: `rat_${rowSeq++}`, value: r.value, label: r.label })));
        } else if (item.key === 'localModelService') {
          setLocalService({ ...DEFAULT_LOCAL_SERVICE, ...(v && typeof v === 'object' ? v : {}) });
        } else if (item.key === 'videoPoints') {
          setVideoPoints({ ...DEFAULT_VIDEO_POINTS, ...(v && typeof v === 'object' ? v : {}) });
        } else if (item.key === 'rechargePlans') {
          setPlans(ensureKey(v, 'plan'));
        } else if (item.key === 'builtinModels') {
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

  // 通用保存
  const handleSave = async (key, value) => {
    setSavingKey(key);
    try {
      let payload = value;
      if (Array.isArray(value)) {
        payload = value.map(({ _key, ...rest }) => rest);
      }
      await settingsApi.update(key, payload);
      message.success('保存成功');
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

  // ======== 充值套餐行操作 ========
  const updatePlan = (idx, field, val) => {
    setPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  };
  const addPlan = () => setPlans((prev) => [...prev, newPlan()]);
  const removePlan = (idx) => setPlans((prev) => prev.filter((_, i) => i !== idx));

  // ======== 内置模型行操作 ========
  const updateModel = (idx, field, val) => {
    setModels((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: val } : m)));
  };
  const addModel = () => setModels((prev) => [...prev, newModel()]);
  const removeModel = (idx) => setModels((prev) => prev.filter((_, i) => i !== idx));

  // ======== 视频参数：时长 / 分辨率 / 比例 行操作 ========
  const updateDurationRow = (idx, val) => setDurationRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: val } : r)));
  const addDurationRow = () => setDurationRows((prev) => [...prev, newDuration()]);
  const removeDurationRow = (idx) => setDurationRows((prev) => prev.filter((_, i) => i !== idx));

  const updateResolutionRow = (idx, val) => setResolutionRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: val } : r)));
  const addResolutionRow = () => setResolutionRows((prev) => [...prev, newResolution()]);
  const removeResolutionRow = (idx) => setResolutionRows((prev) => prev.filter((_, i) => i !== idx));

  const updateRatioRow = (idx, field, val) => setRatioRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  const addRatioRow = () => setRatioRows((prev) => [...prev, newRatio()]);
  const removeRatioRow = (idx) => setRatioRows((prev) => prev.filter((_, i) => i !== idx));

  // 保存视频参数：将行数据 + 默认值打包回 value
  const handleSaveVideoParams = async () => {
    const durations = durationRows.map((r) => Number(r.value)).filter((d) => Number.isFinite(d) && d > 0);
    const resolutions = resolutionRows.map((r) => String(r.value)).filter(Boolean);
    const ratios = ratioRows
      .map((r) => ({ value: String(r.value || '').trim(), label: String(r.label || '').trim() }))
      .filter((r) => r.value && r.label);
    const value = {
      durations,
      resolutions,
      ratios,
      defaultDuration: videoParams.defaultDuration,
      defaultResolution: videoParams.defaultResolution,
      defaultRatio: videoParams.defaultRatio,
      defaultWatermark: videoParams.defaultWatermark,
      defaultSeed: videoParams.defaultSeed,
    };
    if (!durations.length) return message.error('至少需要一个可用时长');
    if (!resolutions.length) return message.error('至少需要一个可用分辨率');
    if (!ratios.length) return message.error('至少需要一个可用画面比例');
    await handleSave('videoParams', value);
  };

  // ======== Column 定义 ========
  const planColumns = [
    {
      title: 'ID', dataIndex: 'id', width: 180,
      render: (v, r, idx) => <Input value={v} onChange={(e) => updatePlan(idx, 'id', e.target.value)} size="small" />,
    },
    {
      title: '标签', dataIndex: 'label', width: 160,
      render: (v, r, idx) => <Input value={v} onChange={(e) => updatePlan(idx, 'label', e.target.value)} size="small" placeholder="如：基础套餐" />,
    },
    {
      title: '价格(元)', dataIndex: 'price', width: 120,
      render: (v, r, idx) => (
        <InputNumber value={v} min={0} step={0.01} onChange={(val) => updatePlan(idx, 'price', val ?? 0)} size="small" style={{ width: '100%' }} />
      ),
    },
    {
      title: '积分', dataIndex: 'points', width: 120,
      render: (v, r, idx) => (
        <InputNumber value={v} min={0} step={1} onChange={(val) => updatePlan(idx, 'points', val ?? 0)} size="small" style={{ width: '100%' }} />
      ),
    },
    {
      title: '赠送', dataIndex: 'bonus', width: 120,
      render: (v, r, idx) => (
        <InputNumber value={v} min={0} step={1} onChange={(val) => updatePlan(idx, 'bonus', val ?? 0)} size="small" style={{ width: '100%' }} />
      ),
    },
    {
      title: '操作', width: 80,
      render: (_, r, idx) => (
        <Popconfirm title="确认删除该套餐？" onConfirm={() => removePlan(idx)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  const modelColumns = [
    {
      title: 'ID', dataIndex: 'id', width: 200,
      render: (v, r, idx) => <Input value={v} onChange={(e) => updateModel(idx, 'id', e.target.value)} size="small" />,
    },
    {
      title: '名称', dataIndex: 'name', width: 200,
      render: (v, r, idx) => <Input value={v} onChange={(e) => updateModel(idx, 'name', e.target.value)} size="small" placeholder="如：本地视频模型 Lite 文生视频" />,
    },
    {
      title: '描述', dataIndex: 'desc',
      render: (v, r, idx) => <Input value={v} onChange={(e) => updateModel(idx, 'desc', e.target.value)} size="small" placeholder="如：本地部署 · 文生视频" />,
    },
    {
      title: '操作', width: 80,
      render: (_, r, idx) => (
        <Popconfirm title="确认删除该模型？" onConfirm={() => removeModel(idx)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  const durationColumns = [
    {
      title: '时长(秒)', dataIndex: 'value',
      render: (v, r, idx) => (
        <InputNumber value={Number(v)} min={1} step={1} onChange={(val) => updateDurationRow(idx, val ?? 1)} style={{ width: 200 }} />
      ),
    },
    {
      title: '操作', width: 80,
      render: (_, r, idx) => (
        <Popconfirm title="删除该时长？" onConfirm={() => removeDurationRow(idx)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  const resolutionColumns = [
    {
      title: '分辨率', dataIndex: 'value',
      render: (v, r, idx) => (
        <Input value={v} onChange={(e) => updateResolutionRow(idx, e.target.value)} placeholder="如 720p" style={{ width: 240 }} />
      ),
    },
    {
      title: '操作', width: 80,
      render: (_, r, idx) => (
        <Popconfirm title="删除该分辨率？" onConfirm={() => removeResolutionRow(idx)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  const ratioColumns = [
    {
      title: '比例值(value)', dataIndex: 'value', width: 180,
      render: (v, r, idx) => <Input value={v} onChange={(e) => updateRatioRow(idx, 'value', e.target.value)} placeholder="如 16:9" size="small" />,
    },
    {
      title: '显示名称(label)', dataIndex: 'label',
      render: (v, r, idx) => <Input value={v} onChange={(e) => updateRatioRow(idx, 'label', e.target.value)} placeholder="如 横屏 16:9" size="small" />,
    },
    {
      title: '操作', width: 80,
      render: (_, r, idx) => (
        <Popconfirm title="删除该画面比例？" onConfirm={() => removeRatioRow(idx)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  const example720 = (Number(videoPoints.basePerSecond) || 0) * 5;
  const example1080 = (Number(videoPoints.basePerSecond) || 0) * 5 * (Number(videoPoints.hdMultiplier) || 0);

  const tabItems = [
    {
      key: 'defaultPoints',
      label: '新用户赠送积分',
      children: (
        <div>
          <Alert type="info" showIcon message="新注册用户自动获得的积分数，由后台管理，不再写入代码配置。" style={{ marginBottom: 16 }} />
          <Form layout="vertical" style={{ maxWidth: 420 }}>
            <Form.Item label="新用户赠送积分">
              <InputNumber
                value={defaultPoints}
                min={0}
                step={1}
                onChange={(val) => setDefaultPoints(Number.isFinite(val) ? val : 0)}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingKey === 'defaultPoints'}
                onClick={() => handleSave('defaultPoints', Number(defaultPoints) || 0)}
              >
                保存
              </Button>
              {meta.defaultPoints?.updatedAt && (
                <Text type="secondary" style={{ marginLeft: 12 }}>
                  上次更新：{new Date(meta.defaultPoints.updatedAt).toLocaleString()}
                </Text>
              )}
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: 'videoParams',
      label: '视频参数',
      children: (
        <div>
          <Alert type="info" showIcon message="客户端视频生成页面可用的时长、分辨率、画面比例及默认值，均由后台管理。用户只可以在这些允许的范围内选择。" style={{ marginBottom: 16 }} />

          <div style={{ marginBottom: 24 }}>
            <Space style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={addDurationRow}>新增时长</Button>
            </Space>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>支持的时长（秒）</div>
            <Table
              rowKey="_key"
              columns={durationColumns}
              dataSource={durationRows}
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无时长，点击"新增时长"添加' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <Space style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={addResolutionRow}>新增分辨率</Button>
            </Space>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>支持的分辨率</div>
            <Table
              rowKey="_key"
              columns={resolutionColumns}
              dataSource={resolutionRows}
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无分辨率，点击"新增分辨率"添加' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <Space style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={addRatioRow}>新增画面比例</Button>
            </Space>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>支持的画面比例</div>
            <Table
              rowKey="_key"
              columns={ratioColumns}
              dataSource={ratioRows}
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
              locale={{ emptyText: '暂无比例，点击"新增画面比例"添加' }}
            />
          </div>

          <Form layout="vertical" style={{ maxWidth: 640 }}>
            <Alert
              type="info"
              showIcon
              message="默认值需要包含在上面列表中，否则客户端回退到列表第一项。"
              style={{ marginBottom: 16 }}
            />
            <Form.Item label="默认时长（秒）">
              <InputNumber
                value={videoParams.defaultDuration}
                min={1}
                step={1}
                onChange={(val) => setVideoParams({ ...videoParams, defaultDuration: val ?? 5 })}
              />
            </Form.Item>
            <Form.Item label="默认分辨率">
              <Input
                value={videoParams.defaultResolution}
                onChange={(e) => setVideoParams({ ...videoParams, defaultResolution: e.target.value })}
                placeholder="如 720p"
                style={{ width: 240 }}
              />
            </Form.Item>
            <Form.Item label="默认画面比例（value）">
              <Input
                value={videoParams.defaultRatio}
                onChange={(e) => setVideoParams({ ...videoParams, defaultRatio: e.target.value })}
                placeholder="如 16:9"
                style={{ width: 240 }}
              />
            </Form.Item>
            <Form.Item label="默认带水印">
              <Switch
                checked={videoParams.defaultWatermark}
                onChange={(checked) => setVideoParams({ ...videoParams, defaultWatermark: checked })}
              />
            </Form.Item>
            <Form.Item label="默认随机种子（-1 表示随机）">
              <InputNumber
                value={videoParams.defaultSeed}
                step={1}
                onChange={(val) => setVideoParams({ ...videoParams, defaultSeed: Number.isFinite(val) ? val : -1 })}
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingKey === 'videoParams'}
                onClick={handleSaveVideoParams}
              >
                保存全部
              </Button>
              {meta.videoParams?.updatedAt && (
                <Text type="secondary" style={{ marginLeft: 12 }}>
                  上次更新：{new Date(meta.videoParams.updatedAt).toLocaleString()}
                </Text>
              )}
            </Form.Item>
          </Form>
        </div>
      ),
    },
    {
      key: 'localModelService',
      label: '本地模型服务',
      children: (
        <div>
          <Alert
            type="info"
            showIcon
            message="内置模型部署在本地服务器，由服务器统一调用。此处配置本地模型服务的访问地址与凭证，用户端无需感知。"
            style={{ marginBottom: 16 }}
          />
          <Form layout="vertical" style={{ maxWidth: 560 }}>
            <Form.Item label="服务地址 (baseURL)">
              <Input
                value={localService.baseURL}
                onChange={(e) => setLocalService({ ...localService, baseURL: e.target.value })}
                placeholder="如：http://127.0.0.1:8000"
              />
            </Form.Item>
            <Form.Item label="API Key（可选，视服务端鉴权而定）">
              <Input.Password
                value={localService.apiKey}
                onChange={(e) => setLocalService({ ...localService, apiKey: e.target.value })}
                placeholder="本地模型服务凭证（如无需鉴权可留空）"
              />
            </Form.Item>
            <Form.Item label="启用本地模型服务">
              <Switch
                checked={localService.enabled}
                onChange={(checked) => setLocalService({ ...localService, enabled: checked })}
              />
              <Text type="secondary" style={{ marginLeft: 12 }}>
                关闭时，内置模型视频生成将返回「服务未启用」错误
              </Text>
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingKey === 'localModelService'}
                onClick={() => handleSave('localModelService', localService)}
              >
                保存
              </Button>
              {meta.localModelService?.updatedAt && (
                <Text type="secondary" style={{ marginLeft: 12 }}>
                  上次更新：{new Date(meta.localModelService.updatedAt).toLocaleString()}
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
      key: 'builtinModels',
      label: '内置模型',
      children: (
        <div>
          <Alert
            type="info"
            showIcon
            message="内置模型 = 部署在本地服务器的视频生成模型。用户端仅展示此列表，无需配置 URL / API Key。"
            style={{ marginBottom: 16 }}
          />
          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={addModel}>新增模型</Button>
            <Button
              icon={<SaveOutlined />}
              loading={savingKey === 'builtinModels'}
              onClick={() => handleSave('builtinModels', models)}
            >
              保存全部
            </Button>
            {meta.builtinModels?.updatedAt && (
              <Text type="secondary">
                上次更新：{new Date(meta.builtinModels.updatedAt).toLocaleString()}
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
      defaultActiveKey="defaultPoints"
      items={tabItems}
      destroyInactiveTabPane={false}
    />
  );
}
