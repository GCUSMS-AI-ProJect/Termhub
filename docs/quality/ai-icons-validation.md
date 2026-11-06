# AI SVG 图标验证

2026-10-21，Windows / WebView2 当前项目开发窗口。
路径为 `apps/tauri/src-tauri/target/debug/transterm.exe`，页面来自 Vite `http://localhost:5188/`。
使用独立 portable 配置与 WebView2 数据目录，未操作用户正在运行的软件或实际 SSH。

## 实现与来源

- 从 [Lucide 官方图标库](https://lucide.dev/icons) 选择 43 个圆角线性 SVG。
- 固定源提交 `20aef31db93fe4d9f398dbb15b120d99c48eef95`；原始文件按功能域归档，逐个来源写入 `assets/icons/lucide-sources.json`。
- 本地 symbol sprite 保持上游原始几何；AppIcon 通过 `ai-*` 类型名称引用，使用 `stroke="currentColor"`，不依赖网络或图标字体。
- AI 入口、工作台、聊天标题与消息操作、模式、附件、SSH、REA、AI 设置及设置导航全部使用同一套图标。
- AI 使用机器人，REA 使用扫描搜索，SSH 使用远程显示器，上传附件使用回形针；适度放大常用图标和状态角标。
- 保留原有按钮名称、状态、禁用逻辑、REA 点击反馈与减少动效设置。公共 CloseButton 新增可选图标名，供 AI 标题栏选择同一套关闭图标。
- ISC / Feather MIT 完整许可随软件打包；根目录与打包目录第三方声明已同步。

## 原生与构建资源检查

- 四个真实主题 `codex-dark`、`codex-light`、`transterm-dark`、`transterm-light`，以及浅色自定义紫色强调色。
- 工作台、窄侧栏、模式菜单、REA 目标弹层、AI 设置、已有隔离会话消息、实际附件控件。
- 应用自身 125% 缩放、1024 × 600 短窗口：按钮在面板边界内，未出现水平溢出。
- 43 个 SVG 在 WebView2 中均能绘制；AI 区域不再包含 Material 字体连字节点。
- 减少动效时 REA 图标的过渡时长为 0；保存的界面缩放已还原。
- 对比所有原始 SVG 与 sprite 几何，确认未改变路径；扫描无脚本、事件处理或外部引用。
- Vite 生产构建包含完整相同的 SVG sprite 与完整许可。
- 截图：`release/TermHub-AI-Icons-*.png`；原始记录：`.npm-cache/native-build/ai-icons-native.json`、`ai-icons-assets.json`。

仅验证 Windows 原生窗口；macOS / Linux 使用同一套 SVG 与主题代码，未进行原生运行验证。

## 质量与交付

类型、ESLint、Prettier、全目标全特性 Clippy、CSS contract 已通过。
Renderer 169 项、Rust / contract 858 项通过，2 项既有忽略。

门禁和 Windows x64 可执行文件、NSIS 安装包的最终结果与 SHA-256 记录在
`release/TermHub-AI-Icons/BUILD_INFO.json`。完整 REA 运行时和许可随软件目录保留。
两种 Windows 成品已编译完成；独立主程序的 CLI 帮助和 MCP 初始化通过检查。
桌面 TermHub 快捷方式已更新至 `release/TermHub-AI-Icons/TermHub.exe`，图标保留原配置。
CSS contract 的历史债务为 11 处 `!important` 和约 6 处旧直接色值，本次未增加。
