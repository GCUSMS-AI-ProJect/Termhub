# REA 简洁提示与网页目标验收

日期：2026-10-21；版本：2.3.1-beta.10；Windows x64。

## 行为

目标弹层保留简短开启状态、运行位置与目标输入，完整安装要求收进默认折叠的“环境说明”。目标标签和中英文 placeholder 明确支持文件、目录和网页链接，按钮缩短为“填入对话”。保持原有工具授权、关闭与纯对话模式限制。

HTTP(S) 链接生成专用网页分析草稿，要求先发现浏览器工具、检查依赖并确认目标页面，再根据实际证据分析。其他输入仍生成文件/目录分析草稿。保留链接路径、查询参数和 fragment，仅移除输入首尾空白。填写目标只生成草稿，不自动发送消息、访问网页或安装浏览器。

网页分析需要 REA 运行主机上的兼容浏览器及调试连接。SSH 运行位置仍为 SSH 登录主机，不能自动使用本机浏览器，也不能将前端观察描述为已取得未知的服务端源码。依赖说明与边界见 [REA 文档](../rea.md)。

## 检查

全 workspace 类型检查、ESLint、项目范围 Prettier、160 项 renderer 测试、849 项 Rust/协议测试（2 项忽略）、Clippy 和 CSS contract 通过。CSS 仍为已有 11 处 `!important` 与约 6 处 legacy 直接颜色债务，本次无新增。

聚焦设计检索及一次缩窄查询均未得到与渐进披露匹配的条目；本次采用通用可访问交互建议，复用现有控件与原生 `details/summary`，以桌面实测验证折叠和键盘行为。

## 原生桌面

精确匹配当前工作区 `apps/tauri/src-tauri/target/debug/transterm.exe`，PID 25512，开发产品名 TermHub Dev；页面 `http://localhost:5188/`，原生 bridge 为 true。隔离 portable 配置中打开临时 PowerShell 终端与无网络模型配置，真实内置 REA 开启后返回 207 项工具。

验证默认折叠、空目标禁用、网页 URL 专用草稿、Windows 路径草稿、四主题、自定义 accent、320px 侧栏、键盘 Enter 展开说明、Escape 恢复焦点与减少动效。默认弹层约 240 × 186px，无水平溢出。只填入草稿，未向模型发送请求。

截图为 `release/TermHub-REA-compact.png`，同目录包含四主题截图。证据为 `.npm-cache/native-build/rea-compact-desktop-evidence.json`。本次未重测真实远端 SSH 浏览器、真实商业模型网页分析及 macOS/Linux 原生环境。

临时终端和模型配置已清理，确认无用户连接后关闭精确测试进程，移除调试用 portable 标记。

## Windows 交付

Windows x64 release 与 NSIS 构建通过。最终程序为 `release/TermHub-REA-compact/TermHub.exe`，相邻附带 REA 运行时与许可；安装包为 `release/TermHub_2.3.1-beta.10_x64-setup.exe`。桌面 TermHub 快捷方式指向新程序并保留现有图标。

最终 EXE 的 CLI 产品名与 MCP 初始化兼容性检查通过；程序和安装包 SHA-256 已核对，记录在 `release/BUILD_INFO.json` 与 `release/SHA256SUMS.txt`。本次为本地构建，未发布版本。
