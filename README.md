# 绝色 · Stunning

> AI 视频生成桌面应用 · 独立后端服务 · 后台管理系统

基于 Electron + React 构建的跨平台 AI 视频生成桌面应用。支持**内置模型**（1.0 系列免费、2.0 系列消耗积分）与**自定义模型**（用户自带 Key）双模式。配套独立后端服务器（支持 SQLite/MySQL 切换）与可视化后台管理系统——数据库与方舟 Key 部署在服务器上，客户端只需账号密码登录（类似 QQ / 微信）。

---

## 目录

- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [后端 API](#后端-api)
- [数据库](#数据库)
- [服务器部署](#服务器部署)
- [技术栈](#技术栈)

---

## 核心功能

### 🎬 AI 视频生成（双模式）

| 模式 | 实现方式 | Key 归属 | 积分 |
|------|----------|----------|------|
| **内置模型 1.0** | 服务器调用火山方舟 API（Pro/Lite × 文生/图生） | 服务器统一调用（免 Key） | **免费，不消耗积分** |
| **内置模型 2.0** | 服务器调用火山方舟 API（Pro/Fast） | 服务器持有 | 消耗积分（失败自动退还） |
| **自定义模型** | 客户端直连用户配置的方舟兼容端点 | 用户自带 | 不消耗积分 |

- **文生视频 / 图生视频**：提示词或参考图生成短视频
- **参数可调**：时长（5s/10s）、分辨率（720p/1080p）、画面比例、水印、随机种子、模型选择
- **全流程可视化**：任务创建 → 轮询 → 下载，进度实时展示
- **历史归档**：已生成视频自动保存，可预览与打开目录
- **随时取消**：中止进行中的任务

### 💰 积分与充值

- **注册赠送**：新用户注册即送 100 积分
- **按量扣减**：`时长 × 2 × (1080p ? 2 : 1)` 积分（仅 Seedance 2.0 系列；**1.0 系列免费，不消耗积分**）
- **失败退还**：生成失败自动退还预扣积分（2.0 系列）
- **在线充值**：多档套餐（含赠送积分），模拟支付即时到账，可平滑替换为真实支付回调

### 🔐 用户系统

- 注册 / 登录，密码 bcrypt 加盐哈希，JWT 鉴权
- 数据库与方舟 Key 全部留在服务器，客户端只输入账号密码
- Token 本地持久化，下次启动自动恢复登录
- 用户中心：头像上传、昵称编辑、积分查看、一键退出

### 🛠️ 后台管理系统

独立 Web 后台（React + Ant Design），管理员独立账号体系：

- **仪表盘**：用户数、视频任务、充值金额、状态分布概览
- **用户管理**：搜索 / 分页 / 调整积分 / 编辑资料 / 删除
- **充值套餐**：增删改（ID / 标签 / 价格 / 积分 / 赠送），实时统计
- **订单记录**：充值订单查询、状态筛选、分页
- **视频任务**：任务统计、搜索、状态筛选、详情查看
- **系统配置**（核心）：方舟 API Key / BaseURL / 默认模型、积分规则、充值套餐、内置模型列表——**全部入数据库，修改后实时生效无需重启**

---

## 技术架构

```
┌────────────────────────────────────────────────────────────────┐
│              后端服务器（独立部署，server/）                       │
│   Express + SQLite/MySQL（可切换）+ JWT                         │
│                                                                │
│   ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────────┐    │
│   │ auth 路由│ │user 路由│ │video 路由│ │ recharge 路由   │    │
│   │注册/登录│ │资料/积分│ │Seedance │ │ 套餐/订单/支付  │    │
│   └────┬────┘ └────┬────┘ └────┬─────┘ └────────┬────────┘    │
│        └───────────┴───────────┴────────────────┘              │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  /api/admin/*  管理后台 API（adminAuth 独立鉴权）         │ │
│   │  auth / users / recharge / settings / video              │ │
│   └──────────────────────────────────────────────────────────┘ │
│   ┌────────────────────┐  ┌──────────────────────────────────┐ │
│   │ settings.js        │  │ services/arkService.js           │ │
│   │ (DB 配置缓存/读写) │  │ → 火山方舟 API (ARK_API_KEY)     │ │
│   └────────────────────┘  └──────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  SQLite / MySQL（users / video_tasks / recharge_orders / │ │
│   │                  admins / settings）                     │ │
│   └──────────────────────────────────────────────────────────┘ │
└─────────┬───────────────────────────────┬──────────────────────┘
          │ HTTP / JSON                   │ HTTP / JSON (admin token)
┌─────────┼──────────────┐  ┌────────────┼──────────────────────┐
│         ▼              │  │            ▼                       │
│  Electron 桌面客户端    │  │  后台管理 Web (admin/)             │
│  (src/ + electron/)    │  │  React + Ant Design               │
│  ┌──────────────────┐  │  │  ┌────────────────────────────┐   │
│  │ 主进程 electron/ │  │  │  │ 仪表盘 / 用户 / 套餐 /     │   │
│  │ ├ videoService   │  │  │  │ 订单 / 视频任务 / 系统配置 │   │
│  │ ├ serverClient   │  │  │  └────────────────────────────┘   │
│  │ └ configStore    │  │  └───────────────────────────────────┘
│  └────────┬─────────┘  │
│           │ IPC        │
│  ┌────────▼─────────┐  │
│  │ 渲染进程 React   │  │
│  │ Login / Video    │  │
│  │ Studio / Settings│  │
│  │ / RechargeModal  │  │
│  └──────────────────┘  │
└────────────────────────┘
```

---

## 项目结构

```
stunning/
├── electron/                  # Electron 主进程（桌面客户端）
│   ├── main.js                # 主入口，窗口管理 + 生命周期
│   ├── preload.js             # 预加载脚本，contextBridge 暴露 window.api
│   ├── ipc-handlers.js        # IPC 通道处理器
│   ├── configStore.js         # 配置持久化（~/.stunning/config.json）
│   ├── serverClient.js        # 后端 HTTP 客户端（token 注入）
│   └── videoService.js        # 视频生成服务（内置模型 + 自定义模型）
├── server/                    # 后端服务器（独立部署）
│   ├── index.js               # Express 入口
│   ├── config.js              # 静态配置（端口、DB、JWT、方舟默认值）
│   ├── settings.js            # DB 配置模块（运行时可变配置缓存/读写）
│   ├── db.js                  # 数据库工厂（按 driver 创建 adapter）+ 建表 + 种子
│   ├── db/                    # 数据库 adapter（统一 async 接口）
│   │   ├── sqliteAdapter.js   # SQLite 实现（node:sqlite）
│   │   └── mysqlAdapter.js    # MySQL 实现（mysql2/promise 连接池）
│   ├── middleware/
│   │   ├── auth.js            # 普通用户 JWT 鉴权
│   │   └── adminAuth.js       # 管理员 JWT 鉴权（独立体系）
│   ├── routes/
│   │   ├── auth.js            # 注册 / 登录
│   │   ├── user.js            # 资料 / 头像 / 积分
│   │   ├── video.js           # 内置模型视频（积分扣减/退还）
│   │   ├── recharge.js        # 充值套餐 / 订单 / 模拟支付
│   │   └── admin/             # 管理后台 API
│   │       ├── index.js       # 聚合入口
│   │       ├── auth.js        # 管理员登录 / 改密
│   │       ├── users.js       # 用户管理
│   │       ├── recharge.js    # 套餐 / 订单 / 统计
│   │       ├── settings.js    # 系统配置读写
│   │       └── video.js       # 视频任务管理
│   └── services/
│       └── arkService.js      # 方舟 API 封装（建任务 / 查任务）
├── admin/                     # 后台管理系统（独立 Web 项目）
│   ├── src/
│   │   ├── App.jsx            # 路由 + 鉴权守卫 + 布局
│   │   ├── api.js             # API 客户端封装
│   │   └── pages/
│   │       ├── Login.jsx      # 管理员登录
│   │       ├── Dashboard.jsx  # 仪表盘
│   │       ├── Users.jsx      # 用户管理
│   │       ├── Recharge.jsx   # 充值套餐管理
│   │       ├── Orders.jsx     # 订单记录
│   │       ├── VideoTasks.jsx # 视频任务管理
│   │       └── Settings.jsx   # 系统配置
│   ├── vite.config.js         # Vite 配置（代理 /api 到后端）
│   └── package.json
├── src/                       # 桌面客户端渲染进程（React）
│   ├── App.jsx                # 根组件（登录门禁 + 视图路由）
│   ├── components/
│   │   ├── Login.jsx          # 登录 / 注册（含服务器地址配置）
│   │   ├── Sidebar.jsx        # 侧边导航
│   │   ├── UserMenu.jsx       # 用户菜单（头像/积分/充值/退出）
│   │   ├── VideoStudio.jsx    # 视频工作室（生成主界面）
│   │   ├── RechargeModal.jsx  # 充值弹窗
│   │   └── SettingsPanel.jsx  # 设置（提供商切换/自定义模型/输出目录）
│   ├── ipc/bridge.js          # IPC 桥接层（带 mock 回退）
│   ├── store/useStore.js      # Zustand 全局状态
│   └── styles/global.css      # 全局样式
├── index.html                 # Vite HTML 入口
├── vite.config.js
├── package.json               # 客户端依赖与脚本
├── .npmrc                     # npm 镜像源配置
└── .gitignore
```

---

## 快速开始

### 环境要求

- **Node.js** >= 22.5（后端使用内置 `node:sqlite`；推荐 24.x）
- **npm** >= 9.x
- **操作系统**：Windows / macOS / Linux

### 安装

```bash
git clone https://github.com/feji-007/stunning.git
cd stunning

# 分别安装三端依赖
npm install                        # 1. 桌面客户端
cd server && npm install && cd ..  # 2. 后端服务器
cd admin && npm install && cd ..   # 3. 后台管理系统
```

> `.npmrc` 已配置 npmmirror 镜像源（含 electron / electron-builder 二进制镜像）。

### 启动（开发模式，三端）

需要**三个终端**分别运行后端服务器、桌面客户端、后台管理：

```bash
# 终端 1：后端服务器（监听 http://localhost:3001）
cd server
$env:ARK_API_KEY="你的方舟API Key"      # Windows PowerShell（内置模型必需）
# export ARK_API_KEY="你的方舟API Key"   # macOS/Linux
npm start            # node --experimental-sqlite index.js

# 终端 2：桌面客户端（Vite + Electron，http://localhost:5173）
npm run dev

# 终端 3：后台管理系统（Vite，http://localhost:5174）
cd admin && npm run dev
```

**首次启动后端**会自动：
- 创建默认管理员账号 `admin / admin123`
- 初始化系统配置到数据库（方舟配置、积分规则、充值套餐、模型列表）

### 生产构建

```bash
# 桌面客户端
npm run build        # Vite 构建前端到 dist/
npm start            # 生产模式启动 Electron
npm run dist         # electron-builder 打包为安装包

# 后台管理系统
cd admin && npm run build   # 构建到 admin/dist/
```

---

## 配置说明

### 1. 用户账号（客户端）

1. 启动后端 + 客户端，登录界面默认服务器地址 `http://localhost:3001`
2. 选择「注册」，输入用户名（3-32 字符）、密码（≥6 位）、可选昵称
3. 注册成功自动登录，**初始赠送 100 积分**
4. 右上角用户菜单可编辑昵称、上传头像、充值积分、退出登录

### 2. 视频生成（两种模式）

**内置模型模式（默认）**：无需用户配置 Key，由服务器统一调用
- **Seedance 1.0 系列（免费）**：Pro / Lite × 文生视频(t2v) / 图生视频(i2v)，不消耗积分
- **Seedance 2.0 系列（消耗积分）**：Pro / Fast，积分规则 5s/720p = 10 积分，5s/1080p = 20 积分，10s 翻倍
- 在后台「系统配置 → 方舟 API」填入 `ARK_API_KEY` 后即可使用（1.0 免费模型也无需用户端 Key）
- 2.0 系列生成失败自动退还积分

**自定义模型模式**：不消耗积分，用户自带 Key
1. 前往 [火山引擎方舟](https://console.volcengine.com/ark) 创建 API Key 并开通视频生成模型
2. 客户端「设置」切换为「自定义模型」，填入 Base URL / API Key / 模型 ID
3. 返回「视频工作室」生成视频（不消耗积分）

**可选模型 ID**：
- `seedance-1-0-pro-t2v` / `seedance-1-0-lite-t2v` — 1.0 文生视频（免费）
- `seedance-1-0-pro-i2v` / `seedance-1-0-lite-i2v` — 1.0 图生视频（免费）
- `doubao-seedance-2-0-pro` — 2.0 高质量视频生成（消耗积分）
- `doubao-seedance-2-0-fast` — 2.0 快速生成（消耗积分）

### 3. 积分充值

1. 客户端右上角点击积分数字 → 弹出充值窗口
2. 选择套餐 → 立即支付（模拟支付，即时到账）
3. 内置套餐示例：

| 套餐 | 价格 | 积分 | 赠送 |
|------|------|------|------|
| 入门 | ¥10 | 100 | — |
| 常用 | ¥50 | 550 | 50 |
| 超值 | ¥100 | 1200 | 200 |
| 尊享 | ¥200 | 2500 | 500 |
| 测试套餐 | ¥1 | 9999 | — |

> 套餐可在后台「充值套餐管理」页面增删改，实时生效。

### 4. 后台管理系统

1. 启动后端 + `cd admin && npm run dev`
2. 访问 `http://localhost:5174`
3. 默认账号 `admin / admin123`（请尽快在右上角菜单修改密码）
4. **核心：系统配置页面**可管理：
   - 方舟 API Key / BaseURL / 默认模型
   - 积分规则（每秒消耗 / 1080p 倍率）
   - 充值套餐（增删改）
   - 内置可选模型列表

> 后台修改的所有配置存入数据库，**实时生效**，无需重启服务器。

---

## 后端 API

后端默认监听 `http://localhost:3001`，所有接口 JSON，鉴权接口需 `Authorization: Bearer <token>`。

### 客户端 API

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET  | `/api/health` | 健康检查 | 否 |
| POST | `/api/auth/register` | 注册 | 否 |
| POST | `/api/auth/login` | 登录 | 否 |
| GET  | `/api/user/profile` | 用户资料 | 用户 |
| PUT  | `/api/user/profile` | 更新昵称/头像 | 用户 |
| GET  | `/api/user/points` | 查询积分 | 用户 |
| POST | `/api/user/points` | 增减积分 | 用户 |
| GET  | `/api/recharge/plans` | 充值套餐列表 | 否 |
| POST | `/api/recharge/orders` | 创建充值订单 | 用户 |
| POST | `/api/recharge/orders/:id/pay` | 模拟支付（到账积分） | 用户 |
| GET  | `/api/recharge/history` | 充值历史 | 用户 |
| POST | `/api/video/generate` | 创建视频任务（1.0 免费不扣积分；2.0 预扣积分） | 用户 |
| GET  | `/api/video/tasks/:taskId` | 查询任务（2.0 失败自动退还） | 用户 |
| GET  | `/api/video/history` | 视频任务历史 | 用户 |

### 管理后台 API（`/api/admin/*`，需管理员 token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/auth/login` | 管理员登录 |
| GET  | `/api/admin/auth/me` | 当前管理员 |
| PUT  | `/api/admin/auth/password` | 修改密码 |
| GET  | `/api/admin/users` | 用户列表（分页/搜索） |
| PUT  | `/api/admin/users/:id` | 编辑用户 |
| POST | `/api/admin/users/:id/points` | 调整积分 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| GET  | `/api/admin/recharge/plans` | 套餐列表 |
| PUT  | `/api/admin/recharge/plans` | 保存套餐 |
| GET  | `/api/admin/recharge/orders` | 订单列表 |
| GET  | `/api/admin/recharge/stats` | 充值统计 |
| GET  | `/api/admin/settings` | 所有配置 |
| PUT  | `/api/admin/settings/:key` | 更新配置 |
| GET  | `/api/admin/video/tasks` | 视频任务列表 |
| GET  | `/api/admin/video/stats` | 任务统计 |

---

## 数据库

支持 **SQLite** 和 **MySQL** 两种数据库，通过环境变量 `DB_DRIVER` 一键切换，业务代码完全相同。

### 驱动对比

| 特性 | SQLite | MySQL |
|------|--------|-------|
| 驱动 | Node 22.5+ 内置 `node:sqlite` | `mysql2`（纯 JS，无需编译） |
| 适用场景 | 开发 / 小型部署 / 单机 | 生产 / 多实例 / 高并发 |
| 安装依赖 | 零依赖 | `npm install mysql2`（已包含在 package.json） |
| 连接信息 | 文件路径 | host / port / user / password / database |
| 版本要求 | Node ≥ 22.5 | MySQL ≥ 8.0 |

### 表结构（两种数据库完全一致）

- `users` — 用户（username, password_hash, nickname, avatar, points, ...）
- `video_tasks` — 视频任务（ark_task_id, provider, model, prompt, params, status, video_url, points_cost, refunded, ...）
- `recharge_orders` — 充值订单（order_no, plan_id, price, points, bonus, status, paid_at, ...）
- `admins` — 管理员账号（独立体系，username, password_hash, nickname, ...）
- `settings` — 系统配置（key-value，value 存 JSON：ark / videoPoints / rechargePlans / seedanceModels）

### 使用 SQLite（默认，零配置）

```bash
cd server && npm start
# 数据库文件自动创建在 server/data/stunning.db
```

可自定义文件目录：
```bash
export STUNNING_DATA_DIR="/var/lib/stunning"
```

### 切换到 MySQL

**1. 创建数据库**

```sql
CREATE DATABASE stunning CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'stunning'@'%' IDENTIFIED BY 'your-password';
GRANT ALL PRIVILEGES ON stunning.* TO 'stunning'@'%';
FLUSH PRIVILEGES;
```

**2. 配置环境变量**

```bash
export DB_DRIVER=mysql              # 切换驱动
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_USER=stunning
export DB_PASSWORD=your-password
export DB_NAME=stunning
export DB_POOL_SIZE=10              # 连接池大小（可选，默认 10）
```

**3. 启动服务器**

```bash
cd server && npm start
# 首次启动自动建表 + 种子数据
```

启动日志会显示当前驱动：
```
[stunning-server] 数据库驱动: mysql
[stunning-server] 数据库: mysql://stunning@127.0.0.1:3306/stunning
[db] 数据库就绪（驱动: mysql）
```

### 数据访问层架构

```
routes / settings.js
       │  统一调用 db.get / db.all / db.run / db.transaction（全部 async）
       ▼
   db.js（工厂）
       │  根据 config.db.driver 创建对应 adapter
       ├── db/sqliteAdapter.js   ← node:sqlite 包装为 async
       └── db/mysqlAdapter.js    ← mysql2/promise 连接池
```

两种 adapter 暴露完全相同的接口，业务代码不关心底层数据库类型。新增数据库支持只需实现一个新 adapter 并在 `db.js` 工厂中注册。

数据库与方舟 Key 全部留在服务器端，客户端**完全不感知**。

---

## 服务器部署

```bash
cd server
npm install --omit=dev

# 基础环境变量
export PORT=3001
export JWT_SECRET="your-strong-secret"

# 数据库配置（二选一）
# —— 方式 A：SQLite（默认，零配置）——
export STUNNING_DATA_DIR="/var/lib/stunning"

# —— 方式 B：MySQL ——
# export DB_DRIVER=mysql
# export DB_HOST=127.0.0.1
# export DB_PORT=3306
# export DB_USER=stunning
# export DB_PASSWORD=your-password
# export DB_NAME=stunning

# 方舟 Key（之后也可在后台管理修改）
export ARK_API_KEY="your-ark-key"
export ARK_MODEL="seedance-1-0-lite-t2v"

node --experimental-sqlite index.js
```

后台管理系统构建后可部署到任意静态服务器（Nginx 等），将 `/api` 反向代理到后端即可：

```nginx
location /api/ {
  proxy_pass http://backend:3001;
}
```

### 配置文件位置

| 配置项 | 路径 |
|--------|------|
| 客户端配置（视频参数 / 自定义模型 Key / 服务器地址 / Token） | `~/.stunning/config.json` |
| 后端数据库（SQLite 模式） | `server/data/stunning.db` |
| 视频下载目录 | `~/Videos/stunning/` |
| 后台管理 Token | 浏览器 localStorage(`stunning_admin_token`) |
| 打包产物 | `release/` |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 32 |
| 客户端前端 | React 18 + Vite 5 + Zustand 4 |
| 后台管理前端 | React 18 + Vite 5 + Ant Design 5 + React Router 6 |
| 后端服务 | Express 4 |
| 数据库 | SQLite (Node 内置 `node:sqlite`) / MySQL (mysql2) 可切换 |
| 认证 | JWT (jsonwebtoken) + bcryptjs（用户与管理员双体系） |
| 视频生成 | 火山引擎方舟 API（Seedance 1.0 免费 / 2.0 付费） |
| UI 图标 | Lucide React（客户端） / @ant-design/icons（后台） |
| 打包工具 | electron-builder |

---

## License

本项目基于 [MIT License](LICENSE) 开源。
