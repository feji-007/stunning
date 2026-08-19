const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('./ipc-handlers');

let mainWindow = null;

// 在 app ready 前注册本地视频访问的自定义协议，避免 file:// 协议的 CSP/安全限制
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-video',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 放宽本地文件访问限制，允许 <video> 通过 file:// 协议加载本地视频
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  // 开发模式加载 Vite dev server，生产模式加载构建产物
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // 注册所有 IPC 处理器（配置 / 服务器 / 视频生成）
  await registerIpcHandlers();

  // 注册 local-video:// 自定义协议，安全地访问本地视频文件
  // 使用方式：local-video:///<absolute-path-with-slashes> 例如 local-video:///C:/Videos/x.mp4
  // 必须支持 HTTP Range 请求，否则 Chromium 的 <video> 无法播放/拖动进度
  protocol.handle('local-video', (request) => {
    try {
      const url = new URL(request.url);
      let filePath;
      // standard 协议下，浏览器会把 Windows 盘符当作 host 解析：
      // local-video:///C:/Users/x.mp4  ->  url.host='c', url.pathname='/Users/x.mp4'
      // 此时需把 host（盘符）与 pathname 重新拼回完整磁盘路径
      if (url.host && /^[a-zA-Z]$/.test(url.host)) {
        filePath = decodeURIComponent(url.host + ':' + url.pathname);
      } else {
        // 兜底：pathname 形如 /C:/Videos/x.mp4，去掉前导斜杠使 C: 位于开头
        filePath = decodeURIComponent(url.pathname);
        if (/^\/[A-Za-z]:\//.test(filePath)) {
          filePath = filePath.slice(1);
        }
      }
      if (!filePath) {
        return new Response('Missing path', { status: 400 });
      }
      if (!fs.existsSync(filePath)) {
        return new Response('File not found', { status: 404 });
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeType =
        ext === '.mp4' ? 'video/mp4' :
        ext === '.webm' ? 'video/webm' :
        ext === '.mov' ? 'video/quicktime' :
        ext === '.m4v' ? 'video/x-m4v' :
        'application/octet-stream';

      const fileSize = fs.statSync(filePath).size;
      const rangeHeader = request.headers.get('Range') || request.headers.get('range');

      if (rangeHeader) {
        // 解析 Range: bytes=start-end（end 可省略表示到文件末尾）
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          if (start >= fileSize || end >= fileSize || start > end) {
            return new Response('Range Not Satisfiable', {
              status: 416,
              headers: { 'Content-Range': `bytes */${fileSize}` },
            });
          }
          const stream = fs.createReadStream(filePath, { start, end });
          return new Response(stream, {
            status: 206,
            headers: {
              'Content-Type': mimeType,
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Content-Length': String(end - start + 1),
            },
          });
        }
      }

      // 无 Range 头：返回整个文件
      const stream = fs.createReadStream(filePath);
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(fileSize),
        },
      });
    } catch (err) {
      console.error('[local-video] 协议处理失败:', err);
      return new Response('Internal error: ' + err.message, { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前取消正在进行的视频生成（best-effort）
app.on('before-quit', () => {
  try {
    const { cancel } = require('./videoService');
    cancel();
  } catch {}
});
