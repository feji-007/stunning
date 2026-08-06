# 绝色 · Stunning

> 本地大模型推理 + AI 视频生成 + AI Agent 桌面应用

一款基于 Electron + React 构建的跨平台桌面应用，把 **本地 GGUF 模型推理**、**AI 视频生成** 和 **内置 AI Agent** 合二为一。配套独立后端服务器提供用户认证、用户信息与积分、Agent 定义存储能力——数据库部署在服务器上，客户端只需账号密码登录，连接信息对你完全无感（类似 QQ / 微信）。

## ✨ 核心功能

### 🔐 用户登录与注册
- **账号体系**：注册 / 登录，密码 bcrypt 加盐哈希，JWT 鉴权
- **免感知后端**：数据库连接信息全部留在服务器，客户端只输入账号密码
- **登录态持久化**：Token 本地保存，下次启动自动恢复
- **服务器地址可配**：登录界面可修改服务器地址并测试连通性

### 👤 用户中心（主页右上角）
- **用户头像**：支持上传自定义头像（Data URL 存储）
- **昵称 / 用户名**：在线编辑昵称
- **积分系统**：注册即送积分，可用于未来扩展的额度扣减
- **一键退出登录**

### 🤖 内置 AI Agent
- **Agent 存于数据库**：Agent 定义（名称、描述、System Prompt、参数）保存在服务器 SQLite
- **内置 Agent**：开箱即用 3 个（小绝 / 代码工匠 / 灵感编剧）
- **自定义 Agent**：可视化创建，配置人设与 Temperature
- **流式对话**：SSE 流式输出，打字机效果，支持中止
- **服务端记忆**：对话历史存库，切换 Agent 自动恢复上下文
- **服务端调用 LLM**：Agent 对话由服务器调用 OpenAI 兼容端点，默认接应用自带本地 API

### 🧠 本地 LLM 推理
- **GGUF 模型加载**：支持主流 GGUF 格式开源模型（Qwen、Llama、Mistral 等）
- **流式对话**：逐 Token 输出，打字机效果
- **上下文对话**：多轮上下文保持
- **文本补全**：续写、润色、翻译等场景
- **模型参数配置**：Temperature、Top K、Max Tokens 等全可调
- **一键中止**：随时打断正在生成的内容  

### 🎬 AI 视频生成
- **文生视频**：输入 Prompt 即可生成视频
- **图生视频**：上传参考图，让 AI 基于图片生成动态视频
- **参数可调**：分辨率（720p/1080p）、时长（5s/10s）、宽高比（16:9、9:16、1:1 等）
- **进度可视化**：任务创建、轮询、下载全流程进度展示
- **历史记录**：所有已生成视频自动归档

### 🌐 OpenAI 兼容 API 服务器
- **一键启动**：开启本地 HTTP API 服务（默认端口 1234）
- **兼容主流 SDK**：Python、Node.js、curl 等任意 OpenAI 兼容客户端
- **支持流式**：`stream: true` 实时推送 Token
- **API Key 鉴权**：自带简易 Bearer Token 鉴权

### 🖥️ 现代化 UI
- **深色主题**：护眼的深色界面
- **代码高亮**：对话中的代码块自动高亮（支持 160+ 语言）
- **Markdown 渲染**：完整支持 GFM、表格、列表、数学公式
- **响应式设计**：侧边栏 + 主区域的经典 IM 布局

## 🏗️ 技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                     后端服务器（部署在服务器上）                 │
│   server/  Express + SQLite (node:sqlite) + JWT              │
│   ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│   │  auth 路由  │  │  user 路由  │  │  agent 路由 + SSE    │   │
│   │ 注册/登录   │  │ 资料/头像   │  │ 列表/创建/流式对话   │   │
│   └─────┬──────┘  └─────┬──────┘  └──────────┬───────────┘   │
│         │               │                    │                │
│   ┌─────┴───────────────┴────────────────────┴────────────┐  │
│   │          SQLite 数据库（users / agents / messages）     │  │
│   └────────────────────────────────────────────────────────┘  │
│         │ 调用 OpenAI 兼容 LLM（默认指向客户端本地 :1234）      │
└─────────┼──────────────────────────────────────────────────────┘
          │ HTTP / SSE（客户端只感知账号密码，DB 信息不暴露）
┌─────────┼──────────────────────────────────────────────────────┐
│         ▼              Electron 桌面客户端                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    主进程 (electron/)                     │  │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │llamaEngine│ │ apiServer │ │videoService│ │serverClient│  │  │
│  │  │(本地推理) │ │ (Express) │ │ (方舟API) │ │(后端HTTP)  │  │  │
│  │  └────┬─────┘ └─────┬─────┘ └─────┬────┘ └─────┬──────┘  │  │
│  │       └──────────────┴─────────────┴────────────┘         │  │
│  │                  ipc-handlers.js (IPC)                    │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ contextBridge                        │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │            渲染进程 React + Vite + Zustand                │  │
│  │  ├── Login          登录/注册                             │  │
│  │  ├── UserMenu       右上角用户菜单（头像/积分/资料）       │  │
│  │  ├── AgentPanel     AI Agent 列表 + 对话                  │  │
│  │  ├── ChatPanel      本地模型聊天                          │  │
│  │  ├── ModelManager   模型管理                              │  │
│  │  ├── VideoStudio    视频生成                              │  │
│  │  ├── ApiServerPanel API 控制台                            │  │
│  │  └── SettingsPanel  设置中心                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## 📁 项目结构

```
stunning/
├── electron/                  # Electron 主进程代码
│   ├── main.js                # 主入口，创建 BrowserWindow
│   ├── preload.js             # 预加载脚本，暴露 IPC 接口
│   ├── ipc-handlers.js        # IPC 通道处理器
│   ├── apiServer.js           # OpenAI 兼容 API 服务器
│   ├── configStore.js         # 配置持久化（含 serverUrl/authToken）
│   ├── serverClient.js        # 后端服务器 HTTP 客户端（token 注入 + SSE）
│   ├── videoService.js        # 火山方舟视频生成服务
│   └── inference/
│       └── llamaEngine.js     # 本地 GGUF 推理引擎
├── server/                    # 后端服务器（独立部署）
│   ├── index.js               # Express 入口
│   ├── config.js              # 服务器配置（DB 路径、JWT、LLM 端点）
│   ├── db.js                  # SQLite 连接 + 建表 + 种子 Agent
│   ├── middleware/
│   │   └── auth.js            # JWT 鉴权中间件
│   ├── routes/
│   │   ├── auth.js            # 注册 / 登录
│   │   ├── user.js            # 资料 / 头像 / 积分
│   │   └── agent.js           # Agent 列表 / 创建 / 流式对话
│   └── services/
│       └── llmService.js      # OpenAI 兼容 LLM 流式调用
├── src/                       # 渲染进程（React）
│   ├── main.jsx               # React 入口
│   ├── App.jsx                # 根组件（登录门禁 + 路由）
│   ├── components/
│   │   ├── Login.jsx          # 登录 / 注册界面
│   │   ├── UserMenu.jsx       # 右上角用户菜单
│   │   ├── AgentPanel.jsx     # AI Agent 面板
│   │   ├── ChatPanel.jsx      # 本地模型聊天面板
│   │   ├── MessageBubble.jsx  # 消息气泡
│   │   ├── ModelManager.jsx   # 模型管理
│   │   ├── VideoStudio.jsx    # 视频工作室
│   │   ├── ApiServerPanel.jsx # API 服务器面板
│   │   ├── SettingsPanel.jsx  # 设置面板
│   │   └── Sidebar.jsx        # 侧边栏
│   ├── ipc/
│   │   └── bridge.js          # IPC 桥接层
│   ├── store/
│   │   └── useStore.js        # Zustand 全局状态
│   └── styles/
│       └── global.css         # 全局样式
├── index.html
├── vite.config.js
├── package.json
├── .npmrc                     # npm 镜像源配置
└── .gitignore
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 22.5（服务器使用内置 `node:sqlite`，需 22.5+；推荐 24.x）
- **npm** >= 9.x
- **操作系统**：Windows / macOS / Linux

### 安装

```bash
# 克隆项目
git clone https://github.com/feji-007/stunning.git
cd stunning

# 1. 安装桌面客户端依赖
npm install

# 2. 安装后端服务器依赖
cd server
npm install
cd ..
```

### 启动（开发模式）

需要**两个终端**分别运行后端服务器与桌面客户端：

```bash
# 终端 1：启动后端服务器（监听 http://localhost:3001）
cd server
npm start

# 终端 2：启动桌面客户端（Vite + Electron）
cd ..   # 回到项目根目录
npm run dev
```

启动后看到登录界面 → 注册一个账号 → 登录进入主页。

> 💡 首次使用时，登录界面默认服务器地址为 `http://localhost:3001`。若后端部署在远程，点击「服务器」修改地址并测试连通性。

### 生产构建

```bash
# 构建前端
npm run build

# 启动生产模式
npm start

# 打包为桌面安装包 (Windows .exe / macOS .dmg / Linux .AppImage)
npm run dist
```

## ⚙️ 配置说明

### 1. 用户账号

- 启动后端服务器，打开客户端
- 在登录界面选择「注册」，输入用户名（3-32 字符）、密码（≥6 位）、可选昵称
- 注册成功自动登录并进入主页，**初始赠送 100 积分**
- 主页右上角点击头像可编辑昵称、上传头像、查看积分、退出登录

### 2. AI Agent

- 登录后从左侧导航进入「AI Agent」
- 内置 3 个 Agent（小绝 / 代码工匠 / 灵感编剧），点击即可开始对话
- 点击右上角「创建 Agent」可自定义名称、描述、System Prompt、Temperature
- 对话为 SSE 流式输出，支持中止；历史消息存于服务器数据库，切换 Agent 自动恢复

> ⚠️ Agent 对话由**后端服务器**调用 LLM。默认调用 `http://localhost:1234/v1`（即下方本地 API 服务器）。请先在客户端「API 服务」面板启动本地 API 服务器并加载模型；或在 `server/config.js` 修改 `llm.baseURL` 指向任意 OpenAI 兼容端点。

### 3. 本地模型

1. 下载 GGUF 格式的开源模型（推荐从 [HuggingFace](https://huggingface.co) 下载）
2. 打开应用，进入「模型」面板
3. 选择模型目录，加载模型即可在「聊天」面板开始对话

### 4. 视频生成（方舟 API）

1. 前往 [火山引擎方舟](https://console.volcengine.com/ark) 创建 API Key
2. 打开应用「设置」面板，填入 API Key
3. 切换到「视频生成」面板，输入 Prompt 或上传参考图，点击生成

**推荐模型 ID：**
- `doubao-seedance-2-0-pro` — 高质量视频生成
- `doubao-seedance-2-0-fast` — 快速生成

### 5. API 服务器

1. 切换到「API 服务」面板
2. 点击「启动服务器」（默认端口 1234）
3. 使用任意 OpenAI 兼容客户端调用：

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:1234/v1",
    api_key="stunning"  # 任意值即可
)

response = client.chat.completions.create(
    model="local",
    messages=[{"role": "user", "content": "你好"}]
)
print(response.choices[0].message.content)
```

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer stunning" \
  -d '{
    "model": "local",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 🔌 后端 API 一览

后端服务器默认监听 `http://localhost:3001`，所有接口均为 JSON，鉴权接口需带 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET  | `/api/health` | 健康检查 | 否 |
| POST | `/api/auth/register` | 注册（返回 token + user） | 否 |
| POST | `/api/auth/login` | 登录（返回 token + user） | 否 |
| GET  | `/api/user/profile` | 获取当前用户资料 | 是 |
| PUT  | `/api/user/profile` | 更新昵称 / 头像 | 是 |
| GET  | `/api/user/points` | 查询积分 | 是 |
| POST | `/api/user/points` | 增减积分（`{delta}`） | 是 |
| GET  | `/api/agents` | 列出全部 Agent | 是 |
| GET  | `/api/agents/:id` | Agent 详情 | 是 |
| POST | `/api/agents` | 创建自定义 Agent | 是 |
| GET  | `/api/agents/:id/messages` | 获取与该 Agent 的历史消息 | 是 |
| POST | `/api/agents/:id/chat` | 与 Agent 流式对话（SSE） | 是 |

## 🗄️ 数据库

- **类型**：SQLite（Node 22.5+ 内置 `node:sqlite`，无需安装任何原生依赖）
- **文件位置**：`server/data/stunning.db`（部署在服务器上）
- **表结构**：
  - `users` — 用户（username, password_hash, nickname, avatar, points, ...）
  - `agents` — Agent 定义（name, description, system_prompt, temperature, is_builtin, ...）
  - `agent_messages` — Agent 对话历史（agent_id, user_id, role, content, ...）

数据库连接信息全部留在服务器端的 [server/config.js](server/config.js)，客户端**完全不感知**。服务器迁移时只需改 `config.js`，客户端在登录界面填新地址即可。

## 🛠️ 服务器部署

后端服务器可独立部署到任意服务器：

```bash
# 在服务器上
cd server
npm install --omit=dev   # 仅装运行时依赖

# 通过环境变量覆盖默认配置
export PORT=3001
export JWT_SECRET="your-strong-secret"
export LLM_BASE_URL="http://your-llm-endpoint/v1"
export LLM_API_KEY="your-llm-key"
export STUNNING_DATA_DIR="/var/lib/stunning"   # 数据库存放目录

node --experimental-sqlite index.js
```

客户端在登录界面「服务器」处填写该服务器地址即可连接。

## 🔧 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 32 |
| 前端框架 | React 18 |
| 构建工具 | Vite 5 |
| 本地推理 | node-llama-cpp (llama.cpp) |
| 后端服务 | Express 4 |
| 数据库 | SQLite (Node 内置 `node:sqlite`) |
| 认证 | JWT (jsonwebtoken) + bcryptjs |
| 状态管理 | Zustand 4 |
| UI 图标 | Lucide React |
| Markdown | react-markdown + remark-gfm |
| 代码高亮 | react-syntax-highlighter |
| 打包工具 | electron-builder |

## 📝 配置文件位置

| 配置项 | 路径 |
|--------|------|
| 客户端配置（API Key、服务器地址、Token 等） | `~/.stunning/config.json` |
| 后端数据库 | `server/data/stunning.db` |
| 视频下载目录 | `~/Videos/stunning/` |
| 模型存储目录 | `~/.stunning/models/` |
| 打包产物 | `release/` |

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。
