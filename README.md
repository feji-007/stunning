# 绝色 · Stunning

> 本地大模型推理 + AI 视频生成桌面应用

一款基于 Electron + React 构建的跨平台桌面应用，把 **本地 GGUF 模型推理** 和 **AI 视频生成** 合二为一。所有计算在你自己的设备上运行，数据不会离开你的电脑。

## ✨ 核心功能

### 🤖 本地 LLM 推理
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
┌─────────────────────────────────────────────┐
│                 Electron 主进程              │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐ │
│  │ llamaEngine│  │  apiServer │  │videoService│ │
│  │(本地推理)  │  │  (Express) │  │ (方舟API)  │ │
│  └────┬─────┘  └──────┬────┘  └─────┬─────┘ │
│       │               │              │        │
│  ┌────┴───────────────┴──────────────┴─────┐ │
│  │            ipc-handlers.js               │ │
│  └────────────────┬────────────────────────┘ │
│                   │ IPC (contextBridge)       │
└───────────────────┼──────────────────────────┘
                    │
┌───────────────────┼──────────────────────────┐
│                   ▼          渲染进程         │
│  ┌─────────────────────────────────────────┐ │
│  │  React + Vite + Zustand                 │ │
│  │  ├── ChatPanel       聊天对话          │ │
│  │  ├── ModelManager    模型管理          │ │
│  │  ├── VideoStudio     视频生成          │ │
│  │  ├── ApiServerPanel  API 控制台        │ │
│  │  └── SettingsPanel   设置中心          │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## 📁 项目结构

```
stunning/
├── electron/                  # Electron 主进程代码
│   ├── main.js                # 主入口，创建 BrowserWindow
│   ├── preload.js             # 预加载脚本，暴露 IPC 接口
│   ├── ipc-handlers.js        # IPC 通道处理器
│   ├── apiServer.js           # OpenAI 兼容 API 服务器
│   ├── configStore.js         # 配置持久化
│   ├── videoService.js        # 火山方舟视频生成服务
│   └── inference/
│       └── llamaEngine.js     # 本地 GGUF 推理引擎
├── src/                       # 渲染进程（React）
│   ├── main.jsx               # React 入口
│   ├── App.jsx                # 根组件
│   ├── components/
│   │   ├── ChatPanel.jsx      # 聊天面板
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

- **Node.js** >= 18.x
- **npm** >= 9.x
- **操作系统**：Windows / macOS / Linux

### 安装

```bash
# 克隆项目
git clone https://github.com/feji-007/stunning.git
cd stunning

# 安装依赖（国内网络已配置 .npmrc 镜像源）
npm install
```

### 开发模式

```bash
# 同时启动 Vite 开发服务器 + Electron 窗口
npm run dev

# 或分开启动
npm run dev:vite      # 仅前端 (http://localhost:5173)
npm run dev:electron  # 仅 Electron
```

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

### 1. 本地模型

1. 下载 GGUF 格式的开源模型（推荐从 [HuggingFace](https://huggingface.co) 下载）
2. 打开应用，进入「模型」面板
3. 选择模型目录，加载模型即可开始对话

### 2. 视频生成（方舟 API）

1. 前往 [火山引擎方舟](https://console.volcengine.com/ark) 创建 API Key
2. 打开应用「设置」面板，填入 API Key
3. 切换到「视频生成」面板，输入 Prompt 或上传参考图，点击生成

**推荐模型 ID：**
- `doubao-seedance-2-0-pro` — 高质量视频生成
- `doubao-seedance-2-0-fast` — 快速生成

### 3. API 服务器

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

## 🔧 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 32 |
| 前端框架 | React 18 |
| 构建工具 | Vite 5 |
| 本地推理 | node-llama-cpp (llama.cpp) |
| 后端服务 | Express 4 |
| 状态管理 | Zustand 4 |
| UI 图标 | Lucide React |
| Markdown | react-markdown + remark-gfm |
| 代码高亮 | react-syntax-highlighter |
| 打包工具 | electron-builder |

## 📝 配置文件位置

| 配置项 | 路径 |
|--------|------|
| 应用配置（API Key 等） | `~/.stunning/config.json` |
| 视频下载目录 | `~/Videos/stunning/` |
| 模型存储目录 | `~/.stunning/models/` |
| 打包产物 | `release/` |

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。
