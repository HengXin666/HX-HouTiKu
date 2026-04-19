# py-sdk-demo

HX-HouTiKu Python SDK 本地使用示例。

## 快速开始

```bash
cd examples/py-sdk-demo

# 1. 编辑 .env，填入你的 endpoint 和 token
#    （已预置模板，按需修改）

# 2. 安装依赖 + 运行
uv run demo.py
```

`uv run` 会自动创建虚拟环境、安装依赖（包括本地 SDK），然后执行脚本。

## 选择运行指定示例

```bash
uv run demo.py quick      # 只运行快捷函数 push()
uv run demo.py client     # 手动创建 Client
uv run demo.py context    # 上下文管理器（推荐用法）
uv run demo.py content    # 不同内容类型（markdown/text/html）
```

## 环境变量

在 `.env` 中配置（**不会提交到 git**）：

| 变量 | 说明 |
|------|------|
| `HX_HOUTIKU_ENDPOINT` | Worker API 地址 |
| `HX_HOUTIKU_TOKEN` | 管理员 API Token |

接收者 (recipients) **无需手动配置**，SDK 会自动从 Worker API 获取。

## 项目结构

```
py-sdk-demo/
├── .env              ← 密钥配置（git 忽略）
├── .gitignore
├── pyproject.toml    ← uv 项目配置，引用本地 SDK
├── demo.py           ← 使用示例
└── README.md
```
