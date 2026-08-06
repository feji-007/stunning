# 绝色 · Stunning — Code Wiki

> AI 视频生成桌面应用（Electron + React）
>
> 支持内置 Seedance 2.0（消耗积分）与自定义视频生成 AI（自带 Key，方舟 API 兼容格式）。
>
> 本文档基于重构后的源码生成，仅涵盖视频生成相关架构与模块说明。

---

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [Electron 主进程层（electron/）](#4-electron-主进程层electron)
5. [后端服务器层（server/）](#5-后端服务器层server)
6. [渲染进程层（src/）](#6-渲染进程层src)
7. [视频生成关键数据流](#7-视频生成关键数据流)
8. [依赖关系](#8-依赖关系)
9. [配置与持久化](#9-配置与持久化)
10. [数据库设计](#10-数据库设计)
11. [API 参考](#11-api-参考)
12. [项目运行方式](#12-项目运行方式)

---

## 1. 项目概览

**绝色（Stunning）** 是一款跨平台桌面应用，专注于 AI 视频生成。提供两种生成模式：

| 模式 | 实现方式 | Key 归属 | 积分 |
|------|----------|----------|------|
| **内置 Seedance 2.0** | 服务器调用火山引擎方舟 API（Seedance 2.0 Pro/Fast） | 服务器持有（`ARK_API_KEY`） | 消耗用户积分（失败自动退还） |
| **自定义视频生成 AI** | 客户端直接调用用户配置的方舟兼容端点 | 用户自带（存本地配置） | 不消耗积分 |

应用采用 **客户端 + 独立后端服务器** 的架构：

- **客户端（Electron 桌面应用）**：视频生成 UI、生成流程编排、配置管理、本地视频下载。
- **后端服务器（独立 Express 服务）**：用户认证（JWT）、用户资料/积分、内置 Seedance 视频生成（服务器持有方舟 Key 并扣减用户积分）、SQLite 数据库。

方舟 API 凭证、数据库连接信息全部留在服务器端，客户端只感知账号密码（类似 QQ / 微信）。

技术栈：Electron 32 + React 18 + Vite 5 + Zustand 4 + Express 4 + SQLite（Node 内置 `node:sqlite`）。

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                     后端服务器（独立部署）                       │
│   server/  Express + SQLite (node:sqlite) + JWT              │
│   ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│   │  auth 路由  │  │  user 路由  │  │  video 路由          │   │
│   │  注册/登录  │  │ 资料/积分   │  │ (内置Seedance+积分)  │   │
│   └─────┬──────┘  └─────┬──────┘  └──────────┬───────────┘   │
│         └───────────────┴────────────────────┘                │
│   ┌────────────────────────────────────────────────────────┐  │
│   │   services/arkService ──► 火山方舟 API（ARK_API_KEY）    │  │
│   └────────────────────────────────────────────────────────┘  │
│   ┌────────────────────────────────────────────────────────┐  │
│   │          SQLite（users / video_tasks）                  │  │
│   └────────────────────────────────────────────────────────┘  │
└─────────┬──────────────────────────────────────────────────────┘
          │ HTTP / JSON（客户端只感知账号密码，DB/Key 不暴露）
┌─────────┼──────────────────────────────────────────────────────┐
│         ▼              Electron 桌面客户端                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    主进程 (electron/)                     │  │
│  │  ┌──────────────┐ ┌─────────────┐ ┌────────────────────┐  │  │
│  │  │ videoService │ │ serverClient│ │   configStore      │  │  │
│  │  │ (生成编排)   │ │ (后端HTTP)  │ │ (本地配置持久化)   │  │  │
│  │  │  ├─seedance─►│ │             │ │                    │  │  │
│  │  │  └─custom──► │ │             │ │                    │  │  │
│  │  │   (方舟API)  │ │             │ │                    │  │  │
│  │  └──────┬───────┘ └──────┬──────┘ └─────────┬──────────┘  │  │
│  │                ipc-handlers.js (IPC)                      │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ contextBridge (preload.js)          │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │            渲染进程 React + Vite + Zustand                │  │
│  │  Login / UserMenu / VideoStudio / SettingsPanel / Sidebar │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 三层分层职责

| 层 | 目录 | 运行环境 | 职责 |
|----|------|----------|------|
| 主进程 | `electron/` | Node.js（Electron 主进程） | 视频生成流程编排（内置/自定义）、配置持久化、与后端服务器通信、IPC 路由、视频下载 |
| 后端服务器 | `server/` | 独立 Node.js 进程 | 用户认证、用户资料/积分、内置 Seedance 视频生成（持方舟 Key + 扣积分）、SQLite 持久化 |
| 渲染进程 | `src/` | Chromium（Electron 渲染进程） | UI 渲染、状态管理、通过 IPC 桥接调用主进程能力 |

### 双模式视频生成对比

| 维度 | 内置 Seedance | 自定义 AI |
|------|---------------|-----------|
| 触发位置 | 服务器 `routes/video.js` | 客户端 `videoService.js` |
| 方舟 Key 来源 | `server/config.js` 的 `ARK_API_KEY` | 客户端 `configStore.js` 的 `customVideo.apiKey` |
| 模型选择 | UI 选择（Pro / Fast） | 设置面板填写 `modelId` |
| 积分 | 预扣 → 失败退还 | 不计积分 |
| 任务记录 | 服务器 `video_tasks` 表 | 仅本地内存历史 |
| 调用链路 | 客户端→服务器→方舟 | 客户端→方舟 |

---

## 3. 目录结构

```
stunning/
├── electron/                  # Electron 主进程
│   ├── main.js                # 主入口，创建 BrowserWindow + 生命周期
│   ├── preload.js             # 预加载脚本，contextBridge 暴露 window.api
│   ├── ipc-handlers.js        # IPC 通道处理器（路由到各服务）
│   ├── configStore.js         # 应用配置持久化（~/.stunning/config.json）
│   ├── serverClient.js        # 后端服务器 HTTP 客户端（token 注入）
│   └── videoService.js        # 视频生成服务（内置 Seedance + 自定义 AI）
├── server/                    # 后端服务器（独立部署）
│   ├── index.js               # Express 入口
│   ├── config.js              # 服务器配置（端口、DB、JWT、方舟 Key、积分规则）
│   ├── db.js                  # SQLite 连接 + 建表
│   ├── middleware/auth.js     # JWT 鉴权中间件
│   ├── routes/
│   │   ├── auth.js            # 注册 / 登录
│   │   ├── user.js            # 资料 / 头像 / 积分
│   │   └── video.js           # 内置 Seedance 视频生成（积分扣减）
│   ├── services/
│   │   └── arkService.js      # 方舟 API 封装（建任务 / 查任务）
│   └── data/stunning.db       # SQLite 数据库文件
├── src/                       # 渲染进程（React）
│   ├── main.jsx               # React 入口
│   ├── App.jsx                # 根组件（登录门禁 + 视图路由）
│   ├── components/            # UI 组件
│   │   ├── Login.jsx          # 登录/注册界面
│   │   ├── Sidebar.jsx        # 品牌 + 导航
│   │   ├── UserMenu.jsx       # 用户菜单（头像/昵称/积分/退出）
│   │   ├── VideoStudio.jsx    # 视频工作室（生成主界面）
│   │   └── SettingsPanel.jsx  # 设置（提供商切换/自定义AI/输出目录）
│   ├── ipc/bridge.js          # IPC 桥接层（带 mock 回退）
│   ├── store/useStore.js      # Zustand 全局状态
│   └── styles/global.css      # 全局样式
├── index.html                 # Vite HTML 入口（含 CSP）
├── vite.config.js             # Vite 配置
├── package.json               # 客户端依赖与脚本
└── .npmrc                     # npm 镜像源配置
```

---

## 4. Electron 主进程层（electron/）

### 4.1 main.js — 主入口

应用生命周期与窗口管理。

| 函数/对象 | 说明 |
|-----------|------|
| `createWindow()` | 创建 `BrowserWindow`（1400×900，深色背景，隐藏标题栏）。开发模式加载 `http://localhost:5173`，生产模式加载 `dist/index.html` |
| `app.whenReady()` | 注册所有 IPC 处理器后创建主窗口 |
| `window-all-closed` | 非 macOS 退出应用 |
| `before-quit` | 退出前 best-effort 取消正在进行的视频生成（`videoService.cancel()`） |

安全配置：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`。

### 4.2 preload.js — 预加载脚本

通过 `contextBridge.exposeInMainWorld('api', ...)` 安全地向渲染进程暴露 IPC 通道。渲染进程只能通过 `window.api` 调用，无法直接访问 Node API。暴露的命名空间：

- **config**：`get` / `update`
- **server**：`health` / `setServerUrl` / `getAuth` / `register` / `login` / `logout` / `getProfile` / `updateProfile` / `getPoints`
- **video**：
  - 同步操作：`selectImage` / `selectOutputDir` / `getOutputDir` / `openFolder` / `getHistory` / `generate` / `cancel`
  - 事件订阅：`onProgress(cb)` / `onSuccess(cb)` / `onError(cb)`，均返回取消监听函数

视频生成为异步流式：`generate` 触发后，主进程通过 `event.sender.send` 推送 `video:progress` / `video:success` / `video:error` 事件。

### 4.3 ipc-handlers.js — IPC 处理器中枢

`registerIpcHandlers()` 注册所有 `ipcMain.handle` 通道，把渲染进程请求路由到对应服务。是整个主进程的「路由表」。

**主要 IPC 通道：**

| 通道 | 处理 |
|------|------|
| `config:get` / `config:update` | 应用配置读写（含 `videoProvider` / `videoDefaults` / `customVideo`） |
| `server:health` / `server:set-url` | 服务器连通性 / 地址设置 |
| `server:get-auth` / `server:register` / `server:login` / `server:logout` | 认证 |
| `server:get-profile` / `server:update-profile` / `server:get-points` | 用户资料 / 积分 |
| `video:select-image` | 打开文件对话框选参考图，返回 `{ path, dataUrl }`（base64） |
| `video:select-output-dir` / `video:output-dir` / `video:open-folder` | 视频输出目录管理 |
| `video:history` | 拉取服务器端任务历史（仅内置模式有记录） |
| `video:generate` | 视频生成主入口，内部按 `provider` 分发；通过 `event.sender` 推送进度/成功/失败事件 |
| `video:cancel` | 取消当前生成（中断轮询） |

所有通过 `event.sender` 推送事件前都检查 `sender.isDestroyed()`，避免窗口关闭后发送报错。

### 4.4 configStore.js — 应用配置持久化

| 函数 | 说明 |
|------|------|
| `resolveWritableDir(suffix, fallback)` | 探测可写目录（`~/.stunning` → `cwd/.data` → fallback → 系统临时目录），每个候选做可写探测 |
| `loadConfig()` | 读取配置（带内存缓存，合并 `DEFAULT_CONFIG`，嵌套对象深合并一层） |
| `saveConfig(config)` | 整体写入 |
| `updateConfig(partial)` | 浅合并（`videoDefaults` / `customVideo` 深合并一层） |
| `getVideoOutputDir()` | 视频下载目录（用户配置 → `~/Videos/stunning` → `cwd/.data/videos` → 临时目录） |

`DEFAULT_CONFIG` 关键字段：

| 字段 | 说明 |
|------|------|
| `serverUrl` | 后端服务器地址，默认 `http://localhost:3001` |
| `authToken` / `userId` | 登录后获得的 JWT 与用户 ID |
| `videoProvider` | `'seedance'`（内置）或 `'custom'`（自定义） |
| `videoDefaults` | `duration` / `resolution` / `ratio` / `watermark` / `seed` / `outputDir` |
| `customVideo` | `enabled` / `baseURL` / `apiKey` / `modelId`（方舟兼容格式） |

### 4.5 serverClient.js — 后端服务器 HTTP 客户端

封装与后端服务器的所有 HTTP 通信。自动从 `configStore` 读取 `serverUrl` 与 `authToken`，注入 `Authorization: Bearer <token>`。

| 函数 | 说明 |
|------|------|
| `request(method, path, body)` | 通用请求封装，非 2xx 抛错（带 `status` / `body`） |
| `checkHealth()` / `setServerUrl(url)` | 连通性 / 地址设置 |
| `getAuth()` | 读取本地登录态 `{ serverUrl, token, userId, isAuthenticated }` |
| `register` / `login` | 认证，成功后 `updateConfig` 写入 token 与 userId |
| `logout` | 清除本地 token |
| `getProfile` / `updateProfile` / `getPoints` / `addPoints` | 用户相关 |
| `createVideoTask(params)` | 创建视频生成任务（服务器调用方舟，预扣积分），返回 `{ taskId, arkTaskId, status, pointsCost, pointsRemaining }` |
| `getVideoTask(taskId)` | 查询任务状态（服务器代理方舟；失败自动退还积分），返回 `{ status, videoUrl, refunded, pointsRemaining }` |
| `getVideoHistory()` | 当前用户的历史视频任务 |

### 4.6 videoService.js — 视频生成服务（核心）

支持两种生成模式，统一通过 `generate()` 入口分发。两种模式都遵循方舟 API 异步任务模式：

```
POST /contents/generations/tasks   创建任务 → 返回 task_id
GET  /contents/generations/tasks/{task_id}  轮询状态
```

| 函数 | 说明 |
|------|------|
| `generate(params, onProgress)` | **统一生成入口**。按 `params.provider`（缺省取配置 `videoProvider`）分发：`seedance` 走 `serverClient`（扣积分），`custom` 走本地 `customArkFetch`。内部串联「建任务 → 轮询 → 下载」，通过 `onProgress` 回调推送进度。返回 `{ provider, taskId, arkTaskId, videoUrl, localPath, pointsCost, pointsRemaining }` |
| `customArkFetch(pathname, options)` | 自定义模式的方舟 API 请求封装，注入用户 `customVideo.apiKey` |
| `createCustomTask(params)` | 自定义模式建任务，构建 `content` 数组（text / image_url） |
| `getCustomTask(arkTaskId)` | 自定义模式查询任务 |
| `normalizeArkTask(data)` | 标准化方舟任务对象（status: queued/running/succeeded/failed） |
| `pollUntilDone(pollFn, onProgress, polling)` | 通用轮询：3s 间隔、10 分钟超时、支持取消；状态变化时回调 `onProgress` |
| `downloadVideo(videoUrl, filename)` | 下载视频到 `getVideoOutputDir()`，文件名清洗后存为 `.mp4` |
| `readImageAsDataUrl(filePath)` | 读取本地图片为 base64 data URL（图生视频上传用） |
| `cancel()` | 取消当前轮询（`clearTimeout` + 标记 `aborted`） |

**模块级状态：** `activePolling`（当前轮询句柄，用于取消）。

**生成流程伪代码：**

```
generate(params, onProgress):
  provider = params.provider || config.videoProvider
  if provider == 'custom':
    task = createCustomTask(params)          # 客户端直连方舟
  else:
    task = serverClient.createVideoTask(params)  # 服务器方舟+扣积分
  onProgress(stage=task.status)

  activePolling = { aborted: false }
  try:
    if provider == 'custom':
      final = pollUntilDone(() => getCustomTask(task.arkTaskId), ...)
    else:
      final = pollUntilDone(() => serverClient.getVideoTask(task.taskId), ...)
  finally:
    activePolling = null

  onProgress(stage='downloading')
  localPath = downloadVideo(final.videoUrl, filename)
  return { provider, taskId, videoUrl, localPath, pointsCost, pointsRemaining }
```

---

## 5. 后端服务器层（server/）

### 5.1 index.js — Express 入口

- 初始化数据库（`require('./db')` 触发建表）
- 挂载 `cors`、`express.json`（8mb）
- `/api/health` 健康检查
- 路由挂载：`/api/auth`、`/api/user`、`/api/video`
- 统一错误处理中间件
- 监听 `config.port`
- 启动时检查 `ARK_API_KEY`，未配置则警告（内置 Seedance 将不可用）

### 5.2 config.js — 服务器配置

所有「客户端无需感知」的信息集中于此：

| 字段 | 默认值 | 环境变量 |
|------|--------|----------|
| `port` | 3001 | `PORT` |
| `dbPath` | `server/data/stunning.db` | `STUNNING_DATA_DIR` |
| `jwtSecret` | `stunning-dev-secret-change-me` | `JWT_SECRET` |
| `jwtExpiresIn` | `7d` | — |
| `defaultPoints` | 100 | — |
| `ark.baseURL` | `https://ark.cn-beijing.volces.com/api/v3` | `ARK_BASE_URL` |
| `ark.apiKey` | （空） | `ARK_API_KEY` |
| `ark.defaultModel` | `doubao-seedance-2-0-pro` | `ARK_MODEL` |
| `videoPoints.basePerSecond` | 2 | — |
| `videoPoints.hdMultiplier` | 2 | — |

### 5.3 db.js — SQLite 连接与建表

使用 Node 22.5+ 内置 `node:sqlite`（`DatabaseSync`），需 `--experimental-sqlite` 标志启动。

- `PRAGMA journal_mode = WAL`、`PRAGMA foreign_keys = ON`
- 启动时清理已废弃的旧表（`agent_messages` / `agents`，旧版本含 AI Agent 功能）
- 建表：`users` / `video_tasks`（见 [10. 数据库设计](#10-数据库设计)）
- 索引：`idx_video_tasks_user(user_id, created_at)`

### 5.4 middleware/auth.js — JWT 鉴权

`authRequired(req, res, next)`：从 `Authorization: Bearer <token>` 解析，`jwt.verify` 校验，将 `{id, username}` 挂到 `req.user`；失败返回 401。

### 5.5 routes/auth.js — 认证路由

| 函数/路由 | 说明 |
|-----------|------|
| `sanitizeUser(row)` | 过滤用户字段（剔除 `password_hash`） |
| `issueToken(user)` | `jwt.sign({sub, username}, secret, {expiresIn})` |
| `POST /register` | 校验用户名（3-32）/密码（≥6）→ bcrypt 哈希 → 入库 → 返回 `{token, user}` |
| `POST /login` | bcrypt 比对 → 返回 `{token, user}` |

### 5.6 routes/user.js — 用户路由

全部需 `authRequired`。

| 路由 | 说明 |
|------|------|
| `GET /profile` | 当前用户资料 |
| `PUT /profile` | 更新昵称（≤32）/ 头像（data URL，≤1MB） |
| `GET /points` | 查询积分 |
| `POST /points` | 增减积分（`delta`，下限 0，演示用） |

### 5.7 routes/video.js — 内置 Seedance 视频生成路由（核心）

全部需 `authRequired`。仅支持内置 Seedance 模式（自定义 AI 由客户端直接调用，不经过此路由）。

| 函数/路由 | 说明 |
|-----------|------|
| `calcPointsCost({ duration, resolution })` | 计算积分消耗：`duration × basePerSecond × (1080p ? hdMultiplier : 1)` |
| `serializeTask(row)` | 序列化任务（驼峰字段，`refunded` 转 bool，`params` 解析 JSON） |
| `POST /generate` | **创建任务**：校验积分余额 → 预扣积分 → `arkService.createVideoTask` 建方舟任务 → 入库。建任务失败则退还预扣积分。返回 `{ ...task, pointsRemaining }` |
| `GET /tasks/:taskId` | **查询任务**：终态直接返回本地记录；未到终态则代理查询方舟。`succeeded` 更新 `video_url`；`failed` 且未退还则自动退还积分并标记 `refunded=1`。返回 `{ ...task, pointsRemaining }` |
| `GET /history` | 当前用户历史任务（限 50，按时间倒序） |

**积分扣减与退还机制：**

```
创建任务:
  校验 points >= cost
  预扣: UPDATE users SET points = points - cost
  调方舟建任务
    失败 → 退还: UPDATE users SET points = points + cost
    成功 → 入库 video_tasks(points_cost=cost, refunded=0)

查询任务（轮询期间）:
  方舟返回 succeeded → 更新 video_url
  方舟返回 failed 且 refunded=0 → 退还积分 + refunded=1
```

### 5.8 services/arkService.js — 方舟 API 封装

服务器端调用火山引擎方舟 API（仅内置 Seedance 模式使用）。

| 函数 | 说明 |
|------|------|
| `arkFetch(pathname, options)` | 统一请求封装，注入 `Authorization: Bearer <ARK_API_KEY>`，解析 JSON，非 2xx 抛错（带 `status` / `code` / `raw`）。未配置 Key 时抛友好错误 |
| `createVideoTask(params)` | POST `/contents/generations/tasks`，构建 `content` 数组（text / image_url），参数含 `duration` / `resolution` / `ratio` / `watermark` / `seed`（≥0 才传）/ `model`。返回标准化任务对象 |
| `getVideoTask(taskId)` | GET `/contents/generations/tasks/{taskId}`，返回标准化任务对象 |
| `normalizeTask(data)` | 标准化任务对象 `{ taskId, model, status, content, usage, error, ... }` |

方舟 API 端点：`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`。

---

## 6. 渲染进程层（src/）

### 6.1 main.jsx — React 入口

`ReactDOM.createRoot` 渲染 `<App />`，`React.StrictMode`，引入全局样式。

### 6.2 App.jsx — 根组件

- 启动时 `initAuth()`（恢复登录态）+ `checkServer()`（连通性检测）
- 未初始化完成 → 加载动画
- 未登录 → `<Login />`
- 已登录 → 初始化主界面（`loadAppConfig()`）
- 顶栏：左侧当前视频生成提供商信息（内置 Seedance / 自定义 AI + 模型 ID），右侧 `<UserMenu />`
- `renderMainContent()` 按 `activeView` 切换：`video` / `settings`

### 6.3 ipc/bridge.js — IPC 桥接层

对 `window.api` 的轻量封装：

- `wrap(promise, label)`：统一 try/catch + 日志
- `resolve(...pathParts)`：按路径取 `window.api` 上的方法；非 Electron 环境回退到 `mockApi`（避免纯浏览器调试报错）
- 导出 `bridge` 对象，覆盖 config / server / video 全部能力
- 视频生成提供 `onProgress` / `onSuccess` / `onError` 订阅方法

### 6.4 store/useStore.js — Zustand 全局状态

单一 store 管理全部应用状态。主要分块：

| 分块 | 关键状态/方法 |
|------|---------------|
| UI 状态 | `activeView`（`'video'` / `'settings'`）/ `setActiveView` |
| 认证/用户 | `authInitialized` / `isAuthenticated` / `user` / `initAuth`（token 失效才登出，网络错误保留 token）/ `checkServer` / `setServerUrl` / `login` / `register`（含昵称）/ `logout` / `refreshProfile` / `refreshPoints` / `updateProfile` |
| 应用配置 | `appConfig` / `loadAppConfig` / `saveAppConfig` |
| 视频生成 | `videoHistory` / `videoGenStatus`（`idle`/`queued`/`running`/`downloading`/`error`）/ `videoGenError` / `videoProgress` / `selectReferenceImage` / `selectVideoOutputDir` / `generateVideo`（订阅 onProgress/onError，成功后加入历史并刷新积分）/ `cancelVideoGeneration` / `openVideoInFolder` |

`generateVideo(genParams)` 关键逻辑：
- 订阅 `onProgress` 更新 `videoProgress` / `videoGenStatus`
- 订阅 `onError` 设置错误态
- 调用 `bridge.video.generate`，成功后构造历史记录并入列表（限 50 条）
- 内置模式（`provider !== 'custom'`）成功/失败后均调用 `refreshPoints()` 同步积分

### 6.5 组件清单

| 组件 | 文件 | 职责 |
|------|------|------|
| Login | components/Login.jsx | 登录/注册界面，含服务器地址配置与连通性测试 |
| Sidebar | components/Sidebar.jsx | 品牌 + 导航（视频生成 / 设置） |
| UserMenu | components/UserMenu.jsx | 右上角用户菜单：头像/昵称/积分、编辑资料（昵称+头像）、退出登录 |
| VideoStudio | components/VideoStudio.jsx | **视频工作室**（核心）：提供商切换（内置/自定义）、文生/图生切换、参数面板（时长/分辨率/比例/模型/水印/种子）、积分预估、进度显示、最新结果预览、历史记录 |
| SettingsPanel | components/SettingsPanel.jsx | **设置**：视频生成提供商选择、自定义 AI 配置（Base URL/API Key/模型 ID）、视频保存目录、积分规则说明 |

### 6.6 VideoStudio.jsx 关键设计

- **提供商切换**：顶部 Tab 切换 `seedance` / `custom`，调用 `saveAppConfig({ videoProvider })` 持久化
- **积分预估**：`calcPointsCost(duration, resolution) = duration × 2 × (1080p ? 2 : 1)`，实时显示「预计消耗 X 积分，当前剩余 Y 积分」，不足时禁用生成按钮
- **自定义模式未配置提示**：未填 API Key 时显示警告横幅，点击跳转设置
- **文生/图生切换**：图生模式可选择参考图（PNG/JPG/WEBP/GIF），转 base64 上传
- **高级参数**：内置模式可选 Seedance 模型（Pro/Fast）；水印开关；随机种子（-1 随机）
- **生成状态**：`queued` / `running` / `downloading` 三阶段进度条 + 取消按钮
- **结果区**：最新生成视频内嵌播放器（autoplay/loop）+ 历史列表（缩略图 + 元数据 + 打开目录）

---

## 7. 视频生成关键数据流

### 7.1 内置 Seedance 视频生成（端到端，含积分）

```
VideoStudio.handleGenerate
  → useStore.generateVideo (订阅 onProgress/onError)
  → bridge.video.generate
  → IPC: video:generate
  → ipc-handlers: videoService.generate({ provider: 'seedance', ... })
      │
      ├─ serverClient.createVideoTask(params)
      │    → POST http://localhost:3001/api/video/generate
      │    → server/routes/video.js:
      │         校验积分 → 预扣积分 → arkService.createVideoTask
      │           → POST https://ark.../contents/generations/tasks
      │         入库 video_tasks → 返回 { taskId, pointsCost, pointsRemaining }
      │
      ├─ pollUntilDone(() => serverClient.getVideoTask(taskId))
      │    → GET http://localhost:3001/api/video/tasks/:taskId
      │    → server/routes/video.js: 代理查询方舟
      │         succeeded → 更新 video_url
      │         failed    → 退还积分 + refunded=1
      │    → onProgress(stage) → IPC event: video:progress
      │
      └─ downloadVideo(videoUrl) → 本地 .mp4
         → IPC event: video:success
  → useStore: 加入 videoHistory + refreshPoints()
```

### 7.2 自定义视频生成 AI（客户端直连，不消耗积分）

```
VideoStudio.handleGenerate
  → useStore.generateVideo
  → bridge.video.generate
  → IPC: video:generate
  → ipc-handlers: videoService.generate({ provider: 'custom', ... })
      │
      ├─ createCustomTask(params)
      │    → customArkFetch POST {customVideo.baseURL}/contents/generations/tasks
      │         Authorization: Bearer {customVideo.apiKey}
      │    → 返回 { taskId, status }
      │
      ├─ pollUntilDone(() => getCustomTask(arkTaskId))
      │    → customArkFetch GET {customVideo.baseURL}/contents/generations/tasks/{id}
      │    → onProgress(stage) → IPC event: video:progress
      │
      └─ downloadVideo(videoUrl) → 本地 .mp4
         → IPC event: video:success
  → useStore: 加入 videoHistory（不刷新积分）
```

### 7.3 认证与登录态恢复

```
启动: App.initAuth
  → bridge.server.getAuth (读本地 token)
  → bridge.server.getProfile (验证 token)
    ├─ 200 → isAuthenticated=true
    └─ 401 → bridge.server.logout (清 token)
       其他错误 → 保留 token (允许稍后重试)
```

---

## 8. 依赖关系

### 8.1 客户端依赖（package.json）

| 依赖 | 用途 |
|------|------|
| `electron` ^32 | 桌面框架 |
| `react` / `react-dom` ^18 | UI 框架 |
| `vite` ^5 / `@vitejs/plugin-react` | 构建工具 |
| `zustand` ^4.5 | 全局状态管理 |
| `lucide-react` ^0.439 | 图标 |
| `uuid` ^10 | 视频 ID 生成 |
| `concurrently` / `cross-env` / `wait-on` | 开发脚本编排 |
| `electron-builder` ^25 | 打包 |

> 重构后已移除：`node-llama-cpp`、`express`、`cors`、`react-markdown`、`remark-gfm`、`react-syntax-highlighter`（本地推理 / API 服务器 / Agent / Markdown 渲染功能已删除）。

### 8.2 后端服务器依赖（server/package.json）

| 依赖 | 用途 |
|------|------|
| `express` ^4 / `cors` ^2.8 | Web 框架 |
| `bcryptjs` ^2.4 | 密码哈希 |
| `jsonwebtoken` ^9 | JWT 签发/校验 |
| `node:sqlite`（Node 内置） | SQLite 数据库，无需安装原生依赖，需 Node ≥ 22.5 + `--experimental-sqlite` |

### 8.3 模块内依赖图（简化）

```
main.js → ipc-handlers → videoService → serverClient → configStore
                                     └→ configStore
                         → serverClient → configStore
preload.js ← contextBridge ← ipc-handlers 的 ipcMain.handle
src/App.jsx → store/useStore → ipc/bridge → window.api (preload)
server/index.js → db.js → config.js
                → routes/{auth,user,video} → middleware/auth → config.js
                → routes/video → services/arkService → config.js (方舟 Key)
```

### 8.4 外部服务依赖

- **火山引擎方舟（Ark）**：`https://ark.cn-beijing.volces.com/api/v3`
  - **内置模式**：由服务器 `arkService.js` 调用，Key 来自 `server/config.js` 的 `ARK_API_KEY`
  - **自定义模式**：由客户端 `videoService.js` 调用，Key 来自用户在设置中填入的 `customVideo.apiKey`
  - 两种模式均遵循方舟异步任务 API（`/contents/generations/tasks`）

---

## 9. 配置与持久化

| 配置项 | 位置 | 说明 |
|--------|------|------|
| 客户端配置 | `~/.stunning/config.json` | `videoProvider`、`videoDefaults`、`customVideo`（含用户自定义 AI 的 baseURL/apiKey/modelId）、`serverUrl`、`authToken`、`userId`。沙箱不可写时回退到 `cwd/.data/config.json` |
| 后端数据库 | `server/data/stunning.db` | 部署在服务器，客户端无感 |
| 后端方舟 Key | `server/config.js` / `ARK_API_KEY` 环境变量 | 仅服务器持有，客户端无法获取 |
| 视频下载目录 | `~/Videos/stunning/` | 可在设置中改；不可写时逐级回退 |

客户端配置由 `configStore.js` 统一管理，所有可写目录都经过「探测写入」测试，失败逐级回退，保证沙箱/打包环境下仍可用。

---

## 10. 数据库设计

SQLite（`node:sqlite` `DatabaseSync`），WAL 模式，外键开启。

### users — 用户

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | |
| username | TEXT UNIQUE NOT NULL | 3-32 字符 |
| password_hash | TEXT NOT NULL | bcrypt 哈希 |
| nickname | TEXT DEFAULT '' | ≤32 |
| avatar | TEXT DEFAULT '' | data URL，≤1MB |
| points | INTEGER DEFAULT 100 | 积分（新用户赠送 100） |
| created_at / updated_at | INTEGER | 毫秒时间戳 |

### video_tasks — 视频生成任务（仅内置 Seedance 模式记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 本地任务 ID |
| user_id | INTEGER NOT NULL | FK → users(id) ON DELETE CASCADE |
| ark_task_id | TEXT | 方舟任务 ID |
| provider | TEXT DEFAULT 'seedance' | 提供商（当前仅 'seedance'） |
| model | TEXT | 模型 ID |
| prompt | TEXT DEFAULT '' | 提示词 |
| params | TEXT | JSON 字符串，生成参数（duration/resolution/ratio/watermark/seed） |
| status | TEXT DEFAULT 'queued' | queued / running / succeeded / failed |
| video_url | TEXT | 成功后的视频下载地址 |
| points_cost | INTEGER DEFAULT 0 | 预扣积分 |
| refunded | INTEGER DEFAULT 0 | 失败是否已退还（0/1） |
| error | TEXT | 失败原因 |
| created_at / updated_at | INTEGER | 毫秒时间戳 |

索引：`idx_video_tasks_user(user_id, created_at)`。

> 自定义 AI 模式的生成记录不写入数据库，仅存在客户端内存历史中（`useStore.videoHistory`）。

---

## 11. API 参考

### 11.1 后端服务器 API（默认 `http://localhost:3001`）

所有接口 JSON，鉴权接口需 `Authorization: Bearer <token>`。

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 否 | 健康检查 |
| POST | `/api/auth/register` | 否 | 注册，返回 `{token, user}` |
| POST | `/api/auth/login` | 否 | 登录，返回 `{token, user}` |
| GET | `/api/user/profile` | 是 | 当前用户资料 |
| PUT | `/api/user/profile` | 是 | 更新昵称/头像 |
| GET | `/api/user/points` | 是 | 查询积分 |
| POST | `/api/user/points` | 是 | 增减积分 `{delta}` |
| POST | `/api/video/generate` | 是 | **创建视频生成任务**（预扣积分 + 调方舟），返回 `{ taskId, arkTaskId, status, pointsCost, pointsRemaining }` |
| GET | `/api/video/tasks/:taskId` | 是 | **查询任务状态**（代理方舟；失败自动退还积分），返回 `{ status, videoUrl, refunded, pointsRemaining }` |
| GET | `/api/video/history` | 是 | 当前用户历史视频任务（限 50） |

### 11.2 方舟视频生成 API（两种模式共用）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/contents/generations/tasks` | 创建视频生成任务，body 含 `model` / `content[]` / `duration` / `resolution` / `ratio` / `watermark` / `seed` |
| GET | `/contents/generations/tasks/{task_id}` | 查询任务状态，成功后 `content.video_url` 为视频地址 |

- 内置模式：服务器 `arkService.js` 调用，Key = `ARK_API_KEY`
- 自定义模式：客户端 `videoService.js` 调用，Key = 用户配置的 `customVideo.apiKey`

---

## 12. 项目运行方式

### 12.1 环境要求

- **Node.js** ≥ 22.5（后端使用内置 `node:sqlite`，需 22.5+；推荐 24.x）
- **npm** ≥ 9.x
- **操作系统**：Windows / macOS / Linux

### 12.2 安装

```bash
git clone https://github.com/feji-007/stunning.git
cd stunning

# 1. 客户端依赖
npm install

# 2. 后端服务器依赖
cd server
npm install
cd ..
```

> `.npmrc` 已配置 npmmirror 镜像源（含 electron / electron-builder 二进制镜像）。

### 12.3 开发模式（需两个终端）

```bash
# 终端 1：后端服务器（http://localhost:3001）
cd server
# 配置方舟 API Key（内置 Seedance 视频生成必需）
$env:ARK_API_KEY="你的方舟API Key"      # Windows PowerShell
# export ARK_API_KEY="你的方舟API Key"   # macOS/Linux
npm start            # node --experimental-sqlite index.js

# 终端 2：桌面客户端（Vite + Electron）
npm run dev
```

`npm run dev` 等价于：`concurrently` 并行启动 `vite` 与 `wait-on http://localhost:5173 && cross-env NODE_ENV=development electron .`。

### 12.4 生产构建与打包

```bash
npm run build        # Vite 构建前端到 dist/
npm start            # 生产模式启动（cross-env NODE_ENV=production electron .）
npm run dist         # vite build && electron-builder → release/
```

### 12.5 后端独立部署

```bash
cd server
npm install --omit=dev

export PORT=3001
export JWT_SECRET="your-strong-secret"
export ARK_API_KEY="你的方舟API Key"           # 内置 Seedance 必需
export ARK_MODEL="doubao-seedance-2-0-pro"     # 可选，默认即此
export STUNNING_DATA_DIR="/var/lib/stunning"

node --experimental-sqlite index.js
```

客户端在登录界面「服务器」处填写该服务器地址即可连接。

### 12.6 npm 脚本一览

客户端（根 `package.json`）：

| 脚本 | 作用 |
|------|------|
| `dev` | 并行启动 Vite + Electron（开发） |
| `dev:vite` | 仅启动 Vite |
| `dev:electron` | 仅启动 Electron |
| `build` | Vite 构建 |
| `preview` | Vite 预览 |
| `start` | 生产模式启动 Electron |
| `dist` | 构建 + electron-builder 打包 |

后端（`server/package.json`）：

| 脚本 | 作用 |
|------|------|
| `start` / `dev` | `node --experimental-sqlite index.js` |

### 12.7 典型使用流程

1. 启动后端服务器（配置 `ARK_API_KEY`）→ 启动客户端 → 注册账号（送 100 积分）→ 登录
2. **内置 Seedance 模式**（默认）：在「视频工作室」直接生成，消耗积分（5s/720p=10 分，5s/1080p=20 分，10s 翻倍），失败自动退还
3. **自定义 AI 模式**：在「设置」切换为「自定义 AI」，填入方舟兼容的 Base URL / API Key / 模型 ID → 返回「视频工作室」生成（不消耗积分）
4. 生成成功后视频自动下载到「视频保存目录」，可在应用内预览或打开目录

### 12.8 积分规则

| 时长 | 720p | 1080p |
|------|------|-------|
| 5 秒 | 10 积分 | 20 积分 |
| 10 秒 | 20 积分 | 40 积分 |

公式：`duration × 2 × (1080p ? 2 : 1)`。生成失败自动退还预扣积分。

---

## 附：关键设计要点

- **双模式统一入口**：`videoService.generate()` 按 `provider` 分发，内置走服务器（扣积分），自定义走客户端直连（不扣积分），复用统一的轮询/下载逻辑。
- **安全隔离**：`contextIsolation: true` + `nodeIntegration: false`，渲染进程仅通过 `preload` 暴露的 `window.api` 访问能力；方舟 Key 分两处保管（服务器 / 用户本地），互不泄露。
- **积分事务性**：内置模式采用「预扣 → 失败退还」机制，建任务失败、轮询失败均退还，保证积分与实际生成结果一致。
- **免感知后端**：方舟 Key、数据库连接信息只在 `server/config.js`，客户端只存 `serverUrl` + `authToken`，迁移服务器只需改配置 + 登录界面改地址。
- **流式统一模式**：视频生成采用「`generate` 触发 + `onProgress`/`onSuccess`/`onError` 事件回调 + `cancel` 中止」三段式，渲染进程通过 `bridge` 订阅事件。
- **容错降级**：配置目录逐级回退保证可写；`bridge.js` 在非 Electron 环境提供 mock，避免纯浏览器调试报错。
