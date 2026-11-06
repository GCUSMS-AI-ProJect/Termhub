# REA 聊天栏图标入口验收（2026-10-21）

REA 开关从消息区顶部移至输入栏，使用本地 SVG 和公共按钮；详情通过非模态弹层展开。后端权限与默认关闭策略保持原有行为。

## 已验证

- 精确绑定当前源码 `target/debug/transterm.exe`（验收 PID 32584），页面为当前工作区 Vite `http://localhost:5188/`。独立 portable 测试配置；用户运行中的 `release/transterm.exe`（PID 29120）保持运行。
- 图标位于输入栏工具栏，主按钮为 28 × 28 CSS px；顶部卡片移除。主按钮与详情入口均有可访问名称、状态与键盘焦点。
- 点击波纹、按下反馈、开启中加载环、已开启标记；`prefers-reduced-motion` 下取消动画和过渡。
- 详情弹层保持消息区高度不变，打开时获得焦点；Esc 关闭并返回触发按钮。320px 窄侧栏内弹层和按钮均不越界。
- transterm / Codex 的深、浅四种主题实际截图检查；自定义 accent 正确应用。深色弹层背景不透明，动画结束后截图。
- 原生键盘 Enter 激活开关；默认关闭、关闭时强制调用被拒绝、手动开启、关闭再打开面板恢复状态、取消开启后保持关闭、审批中关闭后撤销调用均通过。
- 真实 REA 发现 207 个工具，完成 list → describe → call，JavaScript 三文件样例返回 Evidence。模型使用 localhost 确定性夹具。
- 156 项 renderer 测试、849 项 Rust/协议测试通过（2 项忽略），类型、lint、格式、Clippy 和 CSS contract 通过。CSS contract 与修改前相同：11 处历史 `!important`、约 6 处旧颜色债务，无新增问题。

## 交付与复查

本地验收记录为忽略目录 `.npm-cache/native-build/rea-composer-desktop-evidence.json` 与 `rea-composer-visual-evidence.json`，截图位于 `release/transterm-rea-composer*.png`。Windows x64 exe 和 NSIS 安装包的实际路径、构建时间与校验值见 `release/BUILD_INFO.json` 和 `release/SHA256SUMS.txt`；桌面快捷方式更新为新版入口。

真实 SSH 主机、用户模型服务及附加分析引擎未验收；macOS/Linux 未构建。参见 [REA 使用说明](../rea.md)。
