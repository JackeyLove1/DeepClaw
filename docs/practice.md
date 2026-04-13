你已经有 React + TypeScript 经验，所以学 Electron 不需要从“前端基础”开始，而应该从 **Electron 的运行模型、边界、安全、桌面能力、工程化发布** 这五个方向切入。Electron 官方教程把重点放在 **main / renderer / preload** 三种上下文、IPC 通信，以及安全默认项上；其中 `contextIsolation` 已经是默认推荐配置，preload 负责把受控 API 暴露给 renderer。([Electron][1])

我建议你的学习路线分成 **4 个阶段**，每个阶段都做一个小项目，不要只看概念。

---

## 阶段 1：先建立 Electron 的核心认知

这一阶段的目标不是“会写界面”，而是先搞懂：**为什么 Electron 不能像普通 React SPA 那样写**。

### 你要先掌握的 6 个核心概念

1. **Process Model**

   * `main process`：应用入口、窗口管理、菜单、系统能力
   * `renderer process`：React 页面
   * `preload script`：安全桥接层
     Electron 官方专门有 Process Model 教程来讲这三者分工。([Electron][1])

2. **BrowserWindow 与 WebContents**

   * 窗口是怎么创建的
   * 多窗口怎么管理
   * devtools、导航、生命周期怎么控制

3. **IPC**

   * `ipcMain` / `ipcRenderer`
   * request-response
   * one-way event
   * channel 设计
     Electron 官方 IPC 教程明确说明进程之间通过自定义 channel 通信。([Electron][2])

4. **Preload + contextBridge**

   * renderer 不直接拿 Node 权限
   * preload 暴露一个最小 API 给 `window.xxx`
     Electron 官方强调 `contextIsolation` 下 preload 和页面脚本不在同一上下文，所以要通过 `contextBridge` 安全暴露能力。([Electron][3])

5. **安全默认项**

   * `contextIsolation: true`
   * `nodeIntegration: false`
   * 尽量启用 sandbox
     官方安全文档把这些列为核心建议，其中 `contextIsolation` 自 Electron 12 起已默认启用。([Electron][4])

6. **Electron 不是浏览器项目**

   * 你可以调文件系统
   * 可以调原生菜单、对话框、托盘
   * 但所有“系统能力”都应该经由 main / preload，而不是直接塞给 React 页面。([Electron][1])

### 阶段 1 的练习项目

做一个 **本地 Markdown 笔记应用**：

* 左侧文件列表
* 右侧预览
* 打开本地文件
* 保存文件
* 最近打开记录

这个项目足以让你练到：

* BrowserWindow
* preload
* IPC
* 文件读写
* React 界面与 Electron 边界

### 这一阶段最容易犯的错

* 把 `fs` 直接暴露给 renderer
* renderer 里直接写 Node API
* 把 preload 当成“随便塞东西的地方”
* 不区分“前端状态”和“桌面能力”

---

## 阶段 2：进入现代工程化开发

你已经会 React + TS，所以这一阶段要尽快进入 **现代 Electron 工程方案**，不要自己从零拼脚本。

### 推荐优先学哪套

我更建议你优先学：

**Electron Forge + Vite + TypeScript**

因为 Electron Forge 现在有官方的 Vite 模板和 Vite 插件，适合正式项目和可发布产品；官方文档明确提供 `vite` 和 `vite-typescript` 模板。([electronforge.io][5])

你也可以了解：

**electron-vite**

它专门围绕 Electron 的 main / preload / renderer 做了更轻量的 Vite 化开发体验，适合快速搭项目。官方文档把它定位为基于 Vite 的 Electron 构建工具。([electron-vite.org][6])

### 这一阶段你该学的内容

#### 1. 项目结构设计

建议你拆成：

```txt
src/
  main/
  preload/
  renderer/
```

并且从第一天开始就避免 main 和 renderer 混写逻辑。

#### 2. 开发环境与生产环境差异

你要理解：

* dev server 怎么跑
* renderer 如何热更新
* main/preload 如何重新构建
* 打包后路径为什么变了
* 静态资源如何引用

#### 3. 依赖处理

Electron 项目里会同时存在：

* renderer 依赖
* Node 原生依赖
* Electron 主进程依赖

尤其是 `native addon`、Node 内置模块、打包 external 策略，要尽早熟悉。electron-vite 官方也专门有 dependency handling 文档。([electron-vite.org][7])

#### 4. 环境变量与配置

你需要区分：

* renderer 环境变量
* main 环境变量
* 打包时与运行时配置

### 阶段 2 的练习项目

把阶段 1 的笔记应用升级成：

* 多窗口
* 菜单栏
* 最近文件
* 配置持久化
* 快捷键
* 打包成本地安装包

---

## 阶段 3：真正掌握“桌面应用开发”

这个阶段开始，你的思维要从“前端页面开发者”切换成“桌面应用工程师”。

### 你要重点学的能力

#### 1. 系统原生能力

* 文件选择器
* 保存对话框
* 原生菜单
* 托盘
* 通知
* 剪贴板
* shell 打开外部链接
* 全局快捷键

这些是 Electron 的核心价值之一。

#### 2. 数据持久化

你需要分层理解：

* 简单配置：`electron-store`
* 结构化本地数据：SQLite / `better-sqlite3`
* 大文件：文件系统

不要把 Zustand 当数据库。

#### 3. 状态管理分工

推荐你形成这个习惯：

* **Zustand**：本地 UI / app state
* **TanStack Query**：异步数据 / 任务状态 / 服务端状态
* **SQLite / 文件系统**：持久化数据

#### 4. 异常处理与日志

桌面应用比网页更需要处理：

* 启动失败
* 文件权限问题
* 路径问题
* 打包后资源丢失
* 自动更新失败
* 本地数据库损坏

#### 5. 性能

Electron 本质是 Chromium + Node，所以你要有性能意识：

* 避免超重 preload
* 避免一次性加载超大数据
* 长任务不要阻塞主线程
* 窗口很多时要管生命周期
* 渲染进程不要无节制地频繁 IPC

### 阶段 3 的练习项目

做一个 **本地 AI 工具客户端 / 文件搜索工具 / 下载管理器**，至少包含：

* 本地数据库
* 长任务进度
* 多模块界面
* 设置页
* 托盘与通知
* 文件导入导出

这个阶段做完，你就不只是“会 Electron”，而是已经能做像样的桌面产品了。

---

## 阶段 4：进阶到“可发布、可维护、可测试”

这一阶段是很多人最缺的地方。能跑不等于能交付。

### 1. 打包与分发

Electron Forge 的定位就是帮助你初始化、开发、打包、制作安装器、发布。官方文档明确把配置集中在 Forge config 中，并提供模板和 maker/publisher 体系。([electronforge.io][8])

你需要学：

* Windows / macOS / Linux 打包差异
* 安装器
* 图标、签名、权限
* 版本管理

### 2. 自动更新

这是正式产品的关键能力之一：

* 如何发布版本
* 如何检查更新
* 如何灰度发布
* 如何处理失败回滚

### 3. 测试

Playwright 官方提供了 Electron 自动化支持，虽然标注为 experimental，但已经可以用于启动 Electron app、控制窗口、做端到端测试。([Playwright][9])

建议测试分三层：

* **单元测试**：Vitest
* **组件测试**：React 组件测试
* **E2E**：Playwright Electron

Playwright 还提供 codegen 和 Inspector，适合你快速生成和调试测试。([Playwright][10])

### 4. 升级与兼容性

Electron 版本升级时经常有 breaking changes，官方有专门的 breaking changes 页面，正式项目要养成跟踪习惯。([Electron][11])

---

# 给你的具体学习顺序

下面这条是我最推荐的学习顺序。

## 第 1 周：只学 Electron 核心模型

目标：

* 看懂 main / renderer / preload
* 会创建窗口
* 会用 IPC
* 会用 preload 暴露 API
* 理解为什么要开 `contextIsolation`

产出：

* 一个可以打开本地文件的小工具

---

## 第 2 周：搭现代项目骨架

目标：

* 用 Electron Forge + Vite + TS 起项目
* 跑通 dev / build / package
* 理清目录结构
* 把 React 页面和 Electron 能力分层

产出：

* 一个可打包的桌面应用壳子

Electron Forge 官方提供了 `create-electron-app --template=vite` 的模板，适合作为起点。([electronforge.io][5])

---

## 第 3～4 周：练桌面能力

目标：

* 文件系统
* 菜单
* 对话框
* 托盘
* 配置持久化
* 多窗口
* 快捷键

产出：

* 一个真正像桌面软件的工具

---

## 第 5～6 周：加数据层和工程能力

目标：

* Zustand
* TanStack Query
* 本地数据库
* 错误处理
* 日志
* 基础性能优化

产出：

* 一个带历史记录、设置页、任务状态的完整应用

---

## 第 7～8 周：打包、测试、发布

目标：

* 跨平台打包
* E2E 测试
* 自动更新
* 版本发布流程

产出：

* 一个接近真实交付形态的应用

---

# 你最值得补的知识点

以你现在的背景，我认为最需要特别补这几块：

## 1. 安全边界

这是 React 开发者转 Electron 最容易忽略的地方。
普通前端习惯“页面里直接干活”，但 Electron 必须建立边界：

* renderer 只做 UI
* preload 做桥接
* main 做系统能力

这不是风格问题，是安全模型问题。Electron 官方安全文档和 context isolation 文档都在强调这一点。([Electron][3])

## 2. 打包后的世界和开发时不一样

很多 Electron bug 都不是业务 bug，而是：

* 路径不对
* 静态资源没进包
* native 模块没打进去
* 生产环境 preload 路径失效

## 3. Electron 是“应用壳 + 系统桥 + Web UI”

你不要把它只当 React 项目，也不要把它只当 Node 项目。
真正的核心能力是三者的边界组织。

---

# 推荐你的项目路线

按难度从低到高：

### 项目 1：本地文件查看器

练：

* BrowserWindow
* IPC
* preload
* 文件读写

### 项目 2：Markdown 笔记应用

练：

* 状态管理
* 本地存储
* 最近文件
* 菜单与快捷键

### 项目 3：下载管理器 / 日志查看器

练：

* 长任务
* 进度条
* 托盘
* 通知
* 多窗口

### 项目 4：AI 桌面客户端

练：

* 本地数据库
* 设置页
* 异步任务
* 流式输出
* 自动更新
* 打包发布

---

# 学习资料优先级

我建议你按这个顺序看：

1. **Electron 官方 Tutorial**

   * Process Model
   * Preload
   * IPC
   * Context Isolation
   * Security
     这是最重要的一组。([Electron][1])

2. **Electron Forge 官方文档**

   * Vite template
   * configuration
   * packaging / publishing
     适合你搭正式项目。([electronforge.io][5])

3. **electron-vite 文档**

   * 了解另一条更轻量的现代工程路线。([electron-vite.org][6])

4. **Playwright Electron 文档**

   * 后期补测试。([Playwright][9])

---

# 最后给你的结论

对你这种已经有 React + TypeScript 经验的人，**最优学习路线不是先学“怎么用 Electron 画页面”，而是先学“Electron 的三层模型和安全边界”，再进入工程化、桌面能力、打包发布。**

你真正的路线应该是：

**运行模型 → preload / IPC → 安全 → 现代脚手架 → 桌面能力 → 数据持久化 → 测试 → 打包发布**

这样学，进步会非常快，而且不会走弯路。

如果你愿意，我下一条可以直接给你整理一份 **“8 周 Electron 学习计划表（按每天学什么、做什么项目、看哪些文档）”**。

[1]: https://electronjs.org/docs/latest/tutorial/process-model?utm_source=chatgpt.com "Process Model"
[2]: https://electronjs.org/docs/latest/tutorial/ipc?utm_source=chatgpt.com "Inter-Process Communication"
[3]: https://electronjs.org/docs/latest/tutorial/context-isolation?utm_source=chatgpt.com "Context Isolation"
[4]: https://electronjs.org/docs/latest/tutorial/security?utm_source=chatgpt.com "Security"
[5]: https://www.electronforge.io/templates/vite?utm_source=chatgpt.com "Vite"
[6]: https://electron-vite.org/guide/?utm_source=chatgpt.com "Getting Started"
[7]: https://electron-vite.org/guide/dependency-handling?utm_source=chatgpt.com "Dependency Handling"
[8]: https://www.electronforge.io/?utm_source=chatgpt.com "Electron Forge: Getting Started"
[9]: https://playwright.dev/docs/api/class-electron?utm_source=chatgpt.com "Electron"
[10]: https://playwright.dev/docs/codegen?utm_source=chatgpt.com "Test generator"
[11]: https://electronjs.org/docs/latest/breaking-changes?utm_source=chatgpt.com "Breaking Changes"
