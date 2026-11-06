# 界面可读性验证

2026-10-21。当前工作区源码原生 Windows / WebView2 开发窗口；可执行文件为
`apps/tauri/src-tauri/target/debug/transterm.exe`，页面为当前 Vite `http://localhost:5188/`。
使用独立 portable 数据和 WebView2 用户目录。未操作运行中的用户程序或实际 SSH 会话。

## 改动

- 公共字号 XS / SM / MD 从 11 / 12 / 13px 调整为 12 / 13 / 14px，按钮使用同一组 token。
- AI 正文、用户消息与输入 15px，行高 1.65–1.7；代码块 13px；模型、模式和上下文提示 12px。
- 工作空间导航 14px / 38px 行高，侧栏 248px；会话逐行排列，长名称保留省略与 Tooltip。
- 窄 AI 侧栏的模型与功能按钮自动换行，模式菜单描述与 REA 弹层增大字号。
- 首页说明 13px，设置、表单和公共提示适当增大文字。文件列表 13px，表头 12px，路径 13px。
- 收起后的 AI 面板与独立工作台统一挂载至 shell，避免重复预留宽度引起的右侧空白；首次挂载后定位也已检查。
- 短窗口使用更宽的欢迎内容与较紧凑的输入布局，建议按钮完整显示。终端栅格设置保持用户配置。

## 原生验证

设计检索采用本地 UI/UX skill 的字号层级与行高建议。React 布局检索未命中数据库条目，布局实现沿用仓库现有 flex、container query 和公共控件约束。

- 四种实际主题 ID：`codex-dark`、`codex-light`、`transterm-dark`、`transterm-light`，逐一记录实际 DOM 主题并截图。
- 自定义紫色强调色，浅色主题；设置弹窗、模式菜单、REA 目标弹层。
- 1280 × 820 工作台与 340px 窄侧栏：功能按钮在边界内，面板贴齐窗口右侧。
- 通过应用自身界面缩放设置验证 125%，逻辑视口 1024 × 656，随后还原测试配置。
- 1024 × 600 短窗口：输入与按钮可见，欢迎页三个建议完整显示，页面无横向溢出。
- 真实已保存的隔离测试会话：用户与助手消息均为 15px。
- 原生窗口挂载实际 FileManager 组件，使用本地测试目录及模拟远程列表验证两侧字号；未连接真实远程主机。
- 页面重新加载后开启 AI：挂载于 `.fs-shell`，面板右边缘等于窗口宽度。
- 测试组件已卸载，独立数据中无打开的终端或连接配置；关闭开发窗口后移除 portable 标记。

截图在 `release/TermHub-Readability-*.png`，原始测量位于忽略目录 `.npm-cache/native-build/readability-*.json`。
未运行 macOS / Linux 原生窗口；对应平台继续共用已有字体回退和控件规则。

## 门禁与软件交付

类型、ESLint、Prettier、全目标全特性 Clippy 和 CSS contract 已通过。
Renderer 169 项通过；Rust/contract 858 项通过，2 项既有忽略。
CSS contract 原有 11 处 `!important` 与约 6 处旧直接色值未增加。
Windows x64 可执行文件及 NSIS 安装包重新编译，完整 REA 运行时与许可随目录保留。
成品另放 `release/TermHub-Readability/`，桌面快捷方式指向新版；运行中的旧程序保留。
最终门禁计数、文件大小与 SHA-256 记录在该目录的 `BUILD_INFO.json`。
