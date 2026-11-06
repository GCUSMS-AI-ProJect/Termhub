# 取消独立 AI 工作台验证

2026-10-21，当前仓库 Windows / WebView2 开发窗口。路径为
`apps/tauri/src-tauri/target/debug/transterm.exe`，页面来自当前 Vite `http://localhost:5188/`。
使用独立 portable 配置和 WebView2 目录，未操作用户正在运行的软件或实际 SSH 会话。

## 实现

- 移除首页独立 AI 工作台入口和 AI 标题栏展开按钮。
- 删除独立工作台导航、全屏布局、欢迎建议和旧事件监听；移除相关状态及文案。
- AI 从标题栏机器人按钮直接打开侧栏，首页仍可使用普通 AI 对话。
- 工作空间选择器拆成独立组件，保留目录选择、连接及确认移除操作；路径在侧栏省略显示，悬停可查看完整信息。
- 保留原有 Provider、会话、附件、SSH、REA、审批与危险命令限制；未更改存储格式或迁移、删除用户数据。
- 保留 AI 侧栏的 shell 挂载、可调整宽度、字号及窄窗口换行规则。
- 当前使用说明改为 [AI 侧栏](../ai-copilot.md)，旧工作台文档保留重定向说明。

## 原生验证

- 首页导航中不存在独立 AI 入口，标题栏 AI 按钮可以打开、关闭和重新打开侧栏。
- 侧栏中无展开按钮；触发旧工作台事件也不会进入全屏布局。
- 四种真实主题和自定义紫色强调色下，侧栏紧贴右侧、按钮在边界内，未出现横向溢出。
- 模式菜单、REA 目标弹层和附件选择 / 移除显示正常；未实际开启 REA 或发起 Provider 请求。
- 隔离数据中的 20 个已有历史会话可列出，选中后原有消息显示正常。
- 创建并选择仅用于验证的本地工作空间，侧栏正确显示目录和移除按钮；取消移除后记录保留，验证后清理本次创建的记录。
- 125% 应用界面缩放、1024 × 600 短窗口，含选中工作空间的工具栏仍完整显示；测试缩放已还原。
- 验证后关闭开发进程、移除 portable 标记；用户原有软件继续运行。

截图位于 `release/TermHub-Sidebar-Only-*.png`，原始数据位于
`.npm-cache/native-build/sidebar-only-native.json`。未在 macOS / Linux 原生窗口运行验证。

## 门禁和交付

类型、ESLint、Prettier、全目标全特性 Clippy、CSS contract 通过。
169 项 renderer、858 项 Rust / contract 测试通过，2 项既有忽略。
CSS contract 原有 11 处 `!important` 和约 6 处旧直接色值未增加。

门禁、软件成品与 SHA-256 的最终结果记录在
`release/TermHub-AI-Sidebar/BUILD_INFO.json`。本次不发布 GitHub Release。

Windows x64 主程序和 NSIS 安装包已编译完成，独立主程序的 CLI 帮助及 MCP 初始化通过。
桌面 TermHub 快捷方式已更新至 `release/TermHub-AI-Sidebar/TermHub.exe`，保留原有图标配置。
