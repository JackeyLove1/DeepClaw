# DeepClaw — Personal AI Assistant For Windows

**DeepClaw** 是一个面向 Windows 的本地 AI 助手项目，专注于**软件工程与知识工作自动化**。  
它提供命令行交互、长驻后台的 ACP server（便于 IDE / 编辑器集成），并支持加载多种 MCP / 自定义技能，让你的本地环境变成一套可组合的自动化工具箱。

> 本项目使用 Python 3.12+，基于 Typer CLI、asyncio、`kosong` LLM 框架与 `fastmcp` 等组件构建。

---

## 功能概览

- **多模式运行**
  - **CLI 交互模式**：在终端直接与 DeepClaw 对话，完成编程、文档整理、调试等任务。
  - **ACP server 模式**：作为长期运行的后端服务，为 IDE（如 Cursor / VSCode 等）提供智能代理能力。
- **技能（Skills）系统**
  - 支持加载自定义技能（如本地脚本、MCP 工具、第三方 API 封装）。
  - 已内置若干示例技能，便于二次扩展。
- **MCP / 工具集成**
  - 借助 `fastmcp` 与相关框架，将本地脚本、外部服务统一暴露为可调用工具。
- **工程化支持**
  - 统一使用 `uv` 做包管理与构建。
  - 代码风格与质量由 `ruff`、`pyright`、`pytest` 等工具保证。

---

## 环境要求

- **操作系统**：Windows 10 或更高版本（x64）
- **Python**：3.12+（建议使用官方 64 位版本）
- **Git**：用于克隆与更新仓库
- **可选**：
  - `uv`（推荐）用于依赖管理和构建
  - 支持 MCP / LLM 的对应密钥或本地服务

---

## 安装与启动

### 1. 克隆仓库

```bash
git clone git@github.com:JackeyLove1/DeepClaw.git
cd DeepClaw
```

> 如果你已经在本地打开本仓库，可忽略本步骤。

### 2. 使用 uv 安装依赖（推荐）

```bash
uv sync
```

或使用传统方式（如果项目已经提供 `requirements.txt` / `pyproject.toml`）安装依赖。

### 3. 运行 CLI

DeepClaw 的 CLI 入口一般位于 `DeepClaw` 包下（例如 `DeepClaw.__main__` 或 `DeepClaw.cli`）。  
根据实际入口脚本，命令大致如下（示例）：

```bash
python -m DeepClaw --help
```

或运行项目提供的可执行脚本（如已打包为 exe 时）。

---

## 使用方式示例

> 以下命令以“示例形式”展示典型使用方式，具体以实际 CLI 帮助信息为准。

- **查看帮助**

```bash
python -m DeepClaw --help
```

- **启动交互式对话**

```bash
python -m DeepClaw chat
```- **以 ACP server 模式运行**

```bash
python -m DeepClaw server
```

启动后，可在 IDE / 其他客户端中连接该 server，实现自动补全、代码分析和自动化操作等能力。

---

## 技能（Skills）与扩展

项目的技能定义与加载逻辑主要集中在：

- `DeepClaw/agent/skills.py`
- `DeepClaw/skills/**` 目录

你可以：

- 在 `DeepClaw/skills/` 下新增子目录与 `SKILL.md`，定义新的技能（如对接某个工具、网站或工作流）。
- 在 `DeepClaw/agent/skills.py` 中注册或扩展技能加载逻辑。

一般而言，一个技能可以：

- 封装一个或多个终端命令 / 脚本（如 PowerShell / Python）。
- 调用远程 API 或本地服务。
- 对输入数据进行特定处理（如解析日志、生成报告等）。

---

## 开发与贡献

### 项目结构（简要）

- `DeepClaw/agent/`：
  - 核心代理逻辑，包括主循环、子代理、技能管理等。
- `DeepClaw/skills/`：
  - 各类技能的实现与说明（`SKILL.md`）。
- `refrence.md`：
  - 项目开发相关的参考链接与资料。
- 其他：
  - 构建、测试、配置等文件（如 `pyproject.toml`、`uv.lock` 等）。

### 本地开发流程（示例）

1. 确保使用 Python 3.12+。
2. 使用 `uv sync` 安装依赖。
3. 运行测试与静态检查（命令视项目脚本配置而定）：

   ```bash
   uv run pytest
   uv run ruff check .
   uv run pyright
   ```

4. 在新建分支上进行开发，遵循仓库中的 Git 提交规范（Conventional Commits）。

如需提交 PR，请：

- 保证本地测试通过。
- 遵守仓库内的代码风格与约定（详见 `AGENTS.md` 等文档）。

---

## 版本与发布（简要说明）

根据项目规则：

- 使用 `MAJOR.MINOR.PATCH` 版本号，但 **Patch 始终为 0**，不递增。
- 任意变更（包含修复与小改动）均通过 **Minor 版本递增** 表示。

例如：`0.68.0 → 0.69.0 → 0.70.0`（不会出现 `0.68.1`）。  
详细发布流程请参考仓库中的说明文档（如 `AGENTS.md` / `CHANGELOG.md`）。

---

## 许可证

项目许可证以仓库根目录中的 `LICENSE` 文件为准（如果尚未添加，可根据需要补充）。

若你有任何问题或建议，欢迎提交 Issue 或 PR，一起完善 DeepClaw。
