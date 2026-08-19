/**
 * 创建视频生成任务（临时模拟实现）
 *
 * 模拟流程：createVideoTask 返回 queued → 首次 getVideoTask 返回 running → 第二次返回 succeeded
 * video_url 指向本服务器的 /test-video/ 路由，提供已有的测试视频文件。
 */
const settings = require('../settings');
const config = require('../config');

// 模拟任务存储（内存中）
const mockTasks = new Map();
let mockCallCount = 0;

function getServiceConfig() {
  return settings.get('localModelService') || { baseURL: '', apiKey: '', enabled: false };
}

async function createVideoTask(params) {
  // 临时模拟：不检查 enabled，直接返回 mock 任务
  const taskId = `mock_${Date.now()}`;
  const task = {
    id: taskId,
    model: params.model || 'mock-model',
    status: 'queued',
    content: null,
    error: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  mockTasks.set(taskId, task);
  return normalizeTask(task);
}

async function getVideoTask(taskId) {
  const task = mockTasks.get(taskId);
  if (!task) {
    return normalizeTask({ id: taskId, status: 'failed', error: { message: '任务不存在' } });
  }

  mockCallCount++;
  // 前两次轮询返回 queued/running，第三次返回 succeeded
  if (mockCallCount <= 1) {
    task.status = 'queued';
  } else if (mockCallCount === 2) {
    task.status = 'running';
  } else {
    task.status = 'succeeded';
    // 指向服务器 /test-video/ 路由下的已有视频文件
    const port = config.port || 3001;
    task.content = {
      video_url: `http://localhost:${port}/test-video/video_1786603107543.mp4`,
    };
  }
  task.updated_at = Date.now();
  return normalizeTask(task);
}

/**
 * 标准化任务对象，便于上层使用
 */
function normalizeTask(data) {
  return {
    taskId: data.id,
    model: data.model,
    status: data.status,        // queued | running | succeeded | failed
    content: data.content,      // 成功后含 video_url, duration
    usage: data.usage,
    error: data.error,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    raw: data,
  };
}

module.exports = {
  createVideoTask,
  getVideoTask,
  normalizeTask,
};
