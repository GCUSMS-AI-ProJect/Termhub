# REA 聊天栏提示样式验收（2026-10-21）

REA 开关与“分析目标与运行环境”入口改用公共 Tooltip，替换系统 title。提示按标题和补充说明分层，使用语义主题颜色、8px 圆角与轻量淡入；不占用消息区高度。按钮尺寸与 REA 权限逻辑沿用现有实现。

## 已验证

- 当前工作区原生开发进程为 `apps/tauri/src-tauri/target/debug/transterm.exe`（PID 29248），页面为当前 Vite `http://localhost:5188/`，使用独立 portable 测试配置。用户运行中的旧版 PID 22088 保持运行。
- transterm 与 Codex 的深、浅四种主题：文字、背景、字体与浮层定位正常；提示通过 aria-describedby 关联按钮，移除原生 title。
- 鼠标悬停延迟显示，离开后收起；鼠标可移入提示阅读。键盘聚焦显示，Esc 关闭且保留按钮焦点；点击入口打开详情并收起提示。
- 320px 聊天栏内提示保持在窗口范围内；显示提示前后消息区域高度一致。自定义主色配置下提示可读，prefers-reduced-motion 下取消淡入。
- 原生 Enter 激活 REA，成功显示 207 个工具；提示更新为关闭动作和已开启状态，再次点击可关闭。
- 156 项 renderer 测试、849 项 Rust/协议测试通过（另有 2 项忽略）；类型、lint、格式、Clippy、CSS contract 均通过。CSS contract 保持原有 11 处 !important、约 6 处旧颜色债务，没有新增问题。

## 交付与范围

Windows x64 新版位于 `release/transterm-2026-10-21-tooltip/transterm.exe`，附完整 REA 运行时；NSIS 安装包和桌面快捷方式更新为本次构建。构建与校验信息记录于 `release/BUILD_INFO.json`、`release/SHA256SUMS.txt`。

本地自动化证据位于忽略目录 `.npm-cache/native-build/rea-tooltip-desktop-evidence.json`，截图为 `release/transterm-rea-tooltip*.png`。未新增镜像实现的单元测试；本次以真实原生窗口检查样式与交互。UI/UX 本地检索未找到精确的 tooltip 专项条目，采用项目设计规范与通用焦点、悬停、动态效果规则。

本次未重测真实 SSH、用户模型服务或附加分析引擎，未构建 macOS/Linux。REA 原有集成验收见 [聊天栏入口验收](rea-composer-validation.md)。
