# 参与贡献

感谢你对 HX-HouTiKu 的关注! 以下指南将帮助你快速上手开发。

---

## 本地开发环境

### 前置工具

| 工具 | 版本 | 用途 |
|------|------|------|
| [Node.js](https://nodejs.org/) | 20+ | 后端和前端开发 |
| [pnpm](https://pnpm.io/) | 9+ | 包管理 |
| [Python](https://www.python.org/) | 3.10+ | SDK 开发 |
| [uv](https://docs.astral.sh/uv/) | 最新 | Python 包管理 |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) | 最新 | Cloudflare CLI |

### 启动开发服务

```bash
# 克隆仓库
git clone https://github.com/HX-HouTiKu/HX-HouTiKu.git
cd HX-HouTiKu

# ========== 后端 ==========
cd worker
pnpm install
cp wrangler.example.toml wrangler.toml
# 编辑 wrangler.toml, 填入你的 database_id(参考部署文档)

# 初始化本地数据库
npx wrangler d1 execute hx-houtiku --local --file=schema.sql

# 启动本地开发服务器(默认 http://localhost:8787)
pnpm dev

# ========== 前端(新开终端)==========
cd frontend
pnpm install

# 创建本地环境配置
echo 'VITE_API_BASE=http://localhost:8787' > .env.local

# 启动开发服务器(默认 http://localhost:5173)
pnpm dev

# ========== Python SDK ==========
cd sdk/python
uv sync
uv run pytest
```

> 💡 **本地开发小技巧**: 
> - Worker 的 `pnpm dev` 会使用本地 D1 数据库(SQLite 文件), 不影响线上
> - 前端的 `VITE_API_BASE` 指向本地 Worker
> - 修改代码后两端都会自动热重载

---

## 项目结构

```
HX-HouTiKu/
├── worker/              # Cloudflare Worker(API 后端)
│   ├── src/
│   │   ├── index.ts         # 入口文件(Hono 路由挂载)
│   │   ├── auth.ts          # 认证中间件(Admin Token / API Token / Recipient Token)
│   │   ├── cron.ts          # 定时清理过期消息
│   │   ├── types.ts         # TypeScript 类型定义
│   │   └── routes/          # API 路由
│   │       ├── push.ts          # POST /api/push
│   │       ├── messages.ts      # GET/POST /api/messages
│   │       ├── recipients.ts    # POST /api/recipients
│   │       ├── subscribe.ts     # POST /api/subscribe
│   │       └── config.ts        # GET /api/config
│   ├── schema.sql           # D1 数据库 Schema
│   ├── package.json
│   └── wrangler.example.toml
├── frontend/            # React PWA 前端
│   ├── src/
│   │   ├── lib/             # 核心库
│   │   │   ├── crypto.ts        # ECIES 加解密
│   │   │   ├── api.ts           # API 客户端
│   │   │   ├── db.ts            # IndexedDB 操作
│   │   │   ├── push.ts          # Web Push 管理
│   │   │   └── utils.ts         # 工具函数
│   │   ├── stores/          # Zustand 状态管理
│   │   │   ├── auth-store.ts    # 认证/密钥状态
│   │   │   ├── message-store.ts # 消息列表状态
│   │   │   └── settings-store.ts# 设置状态
│   │   ├── pages/           # 页面组件
│   │   ├── components/      # UI 组件
│   │   ├── hooks/           # 自定义 Hooks
│   │   └── service-worker/  # Service Worker
│   ├── package.json
│   └── vite.config.ts
├── sdk/python/          # Python SDK
│   ├── hx_houtiku/
│   │   ├── __init__.py      # 包入口, 导出 push() 函数
│   │   ├── client.py        # 推送客户端
│   │   ├── crypto.py        # ECIES 加密
│   │   ├── config.py        # 配置加载
│   │   ├── models.py        # 数据模型
│   │   └── cli.py           # 命令行入口
│   └── pyproject.toml
├── scripts/
│   └── hx-houtiku.sh       # Shell 推送脚本
└── docs/                # 文档
```

---

## 代码规范

### TypeScript(Worker + Frontend)

- 严格模式(`strict: true`), 禁止 `any`
- 使用 Hono 的类型推导来确保路由处理函数类型安全
- 组件使用函数式写法 + Hooks

### Python(SDK)

- 使用 [Ruff](https://docs.astral.sh/ruff/) 做 lint 和格式化
- 行宽 100 字符
- 类型注解(`from __future__ import annotations`)
- 运行检查: `uv run ruff check . && uv run ruff format --check .`

### Git 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式: 

```
feat: 添加消息搜索功能
fix: 修复暗色模式下未读计数显示
docs: 更新部署文档
refactor: 重构加密模块
chore: 升级依赖
```

---

## 提交流程

1. **Fork** 仓库到你的账号
2. 创建功能分支: `git checkout -b feat/my-feature`
3. 编写代码, 确保类型检查和 lint 通过
4. 提交(使用 Conventional Commits 格式)
5. Push 并创建 Pull Request
6. 等待代码审查和合并

---

## 可以贡献的方向

| 方向 | 说明 | 难度 |
|------|------|------|
| 🌐 **国际化** | 添加英文/日文等语言支持 | ⭐ |
| 🧪 **测试** | 添加单元测试和集成测试 | ⭐⭐ |
| 📖 **文档** | 教程、FAQ、视频教学 | ⭐ |
| 🎨 **UI/UX** | 设计改进、无障碍访问 | ⭐⭐ |
| 📱 **原生应用** | iOS/Android 壳应用(TWA/Capacitor) | ⭐⭐⭐ |
| 🔌 **更多 SDK** | Go / Rust / Node.js SDK | ⭐⭐ |
| 🔍 **消息搜索** | 客户端全文搜索(解密后索引) | ⭐⭐⭐ |
| 📊 **统计面板** | 消息量/分组统计图表 | ⭐⭐ |

---

## 协议

参与贡献即表示你同意你的贡献以 MIT 协议授权。
