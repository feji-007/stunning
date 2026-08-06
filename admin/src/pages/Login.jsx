import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { authApi, setToken } from '../api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const data = await authApi.login(values.username, values.password);
      setToken(data.token);
      message.success('登录成功');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      message.error(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e' }}>
      <Card style={{ width: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 32 }}>
          绝色 · 后台管理
        </Typography.Title>
        <Form onFinish={handleLogin} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="管理员账号" defaultValue="admin" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" defaultValue="admin123" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12 }}>
          默认账号：admin / admin123（请尽快修改密码）
        </Typography.Text>
      </Card>
    </div>
  );
}
