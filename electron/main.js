const { app, BrowserWindow, protocol, net, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('./ipc-handlers');
const { loadConfig, updateConfig } = require('./configStore');

let mainWindow = null;

// 判断是否为外部链接（http/https 且非本地开发地址）
function isExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

// 在应用内新窗口中打开外部链接
function openInternalLink(url) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1a1a2e',
    parent: mainWindow,
    title: url,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(url);
  // 子窗口内的链接统一交给外部浏览器，避免嵌套弹窗
  win.webContents.setWindowOpenHandler(({ url: childUrl }) => {
    if (isExternalUrl(childUrl)) shell.openExternal(childUrl);
    return { action: 'deny' };
  });
}

// 处理外部链接：按用户偏好（内部 / 外部 / 询问）打开
async function handleExternalLink(targetUrl) {
  const behavior = loadConfig().linkOpenBehavior || 'ask';

  if (behavior === 'internal') {
    openInternalLink(targetUrl);
    return;
  }
  if (behavior === 'external') {
    shell.openExternal(targetUrl);
    return;
  }

  // 询问模式：弹出带"记住选择"复选框的对话框
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '打开链接',
    message: '如何打开此链接？',
    detail: targetUrl,
    buttons: ['在应用内打开', '用系统浏览器打开', '取消'],
    cancelId: 2,
    checkboxLabel: '记住我的选择（以后不再询问）',
    checkboxChecked: false,
  });

  if (result.response === 2) return; // 取消

  if (result.checkboxChecked) {
    updateConfig({ linkOpenBehavior: result.response === 0 ? 'internal' : 'external' });
  }

  if (result.response === 0) openInternalLink(targetUrl);
  else shell.openExternal(targetUrl);
}

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

  // 拦截 window.open 和 target="_blank" 的外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) handleExternalLink(url);
    return { action: 'deny' };
  });

  // 拦截当前窗口导航到外部链接（无 target 的 <a> 点击）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      handleExternalLink(url);
    }
  });

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
