# REA 接入验收（2026-10-20）

## 范围

Windows x64 本地构建；REA 固定为 `rea-agents@6.7.0`，随包 Node.js 为 24.13.0。SSH 复用 transterm 原有认证连接，支持 POSIX 服务端。

## 已通过

- 类型、lint、Prettier、CSS contract 与 `git diff --check`。
- Renderer：156 项通过，包含工具卡片从准备状态更新为可审批状态的回归。
- Rust/contract：849 项通过，2 项忽略。忽略项中的真实 REA 测试已在接入阶段另行显式执行并通过；此次通过当前源码桌面再次验证真实分析。
- Clippy：`--locked --all-targets --all-features -- -D warnings` 通过。
- 真实 REA：发现 207 个工具，`analyze_javascript_application` 分析三文件 JavaScript 样例成功，返回 Evidence。
- MCP 协议：握手、分页、调用、取消、错误、服务端回调拒绝；大 schema 保留与嵌套结果脱敏。
- Loopback SSH：真实 russh TCP 连接，验证 stdout/stderr 隔离、分片 JSON、Unicode 参数和通道关闭。服务端是协议测试夹具。
- 桌面启动暴露的 Windows verbatim 资源路径问题已修复，保留盘符与 UNC 网络共享语义；REA 7 项专项测试（含真实分析）复验通过。
- 当前源码桌面端：精确绑定 `target/debug/transterm.exe` 与当前工作区 `http://localhost:5188/` 页面，使用独立 portable 配置。验证原生 IPC 检测到 207 个工具，以及 AI 的 list → describe → call → Evidence 返回、半自动审批、三次执行成功和模型结果回传。模型为 localhost 确定性测试服务，REA 为真实进程；不代表真实商业模型已验收。
- 手动开关：默认不向模型提供 REA，模型强行调用返回 `REA_DISABLED`；点击“开启 REA”后发现 207 个工具，实际执行 list → describe → call 并返回 Evidence。关闭、取消开启、等待审批时撤销权限均通过；撤销后的下一轮不再向模型提供 REA，重新打开面板从后端恢复开关状态。
- 界面：精确绑定当前 `target/debug/transterm.exe`（本次验收 PID 23856）与 Vite 5188 的原生页面。关闭与开启后的截图分别在 `release/transterm-rea-off.png`、`release/transterm-rea.png`。模型为本地确定性夹具，调用真实 REA；开关验收记录保存在本地忽略目录 `.npm-cache/native-build/rea-manual-desktop-evidence.json`。
- Windows 软件：重新生成 x64 exe 和 NSIS 安装包，更新 `release/BUILD_INFO.json` 与 SHA256 校验。桌面 `transterm.lnk` 指向完整 `release/transterm.exe`，核验工作目录与随包 `rea/node.exe` 存在。

## 目标环境待验收

- 未连接用户真实 SSH 主机验证 npm 下载、主机运行时和分析引擎；不读取或修改用户保存的 SSH 凭据。
- 未调用用户真实模型服务。模型工具能力需使用用户所选服务验收。
- Ghidra、IDA、JADX、浏览器等附加分析引擎未安装验收；不能以工具数量宣称引擎全部就绪。
- macOS/Linux 与跨架构安装包未构建；Windows SSH 不支持当前 POSIX 启动器。

## 复查入口

参见 [REA 使用与开发说明](../rea.md)。本地真实冒烟测试需先准备随包运行时；远端首次准备使用 SSH 登录用户缓存，不使用 sudo。
