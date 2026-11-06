# 内置 REA 与远程分析

## 目标

在 transterm 的 AI 面板默认提供 REA 6.7.0 工具。当前本地终端使用随软件打包的 Node.js / REA；SSH 终端通过现有、已验证的连接打开独立 exec 通道，在远端用户缓存准备并运行 REA。无需用户配置独立 MCP 客户端或开放远端 HTTP 端口。

## 边界

- Rust 持有 MCP stdio 客户端、进程与 SSH 通道；renderer 仅接收类型化状态和工具活动。
- 工具随半自动/全自动 Copilot 模式默认提供，纯对话保持不执行工具；目标绑定沿用 L2 上下文、窗口和会话 revision。
- 分析请求内复用同一 REA 会话，结束/取消关闭。下一条消息重新连接，不能复用上次会话的临时分析句柄。
- 支持本机 Windows/macOS/Linux、远端 POSIX SSH；网络设备、FTP/Telnet/串口不伪装成分析主机。远端需要兼容版本 Node.js/npm；缺失时明确提示，不修改系统级软件。
- 远端首次使用自动准备固定版本 REA，缓存于用户目录；不注册全局 agent，不使用 sudo。
- 分析引擎按 REA 实际 readiness 判断；工具目录可见不等于 Ghidra/IDA 等引擎已安装。
- MCP 数据有大小、超时及取消边界；未知/有副作用的工具沿用审批模式，不把工具输出当指令。

## 实施与验收

1. MCP 握手、工具分页发现、调用、服务端请求拒绝、取消、关闭及协议测试。
2. SSH 原始 exec 通道、固定版本远端启动器及失败诊断；本地打包运行时。
3. 三种 AI provider 的 REA schema、调用、历史与结果卡片。
4. AI 面板连接/取消/状态入口，随目标切换清空状态。
5. 执行项目类型、格式、lint、renderer、Rust、Clippy 门禁；真实 REA 本地验证和 Windows 打包，远端无实机时清楚标注。

## 完成记录

2026-10-20 完成内置客户端、远程启动器、三种 AI provider、工具审批/历史、界面与 Windows x64 打包。真实 REA 与当前源码桌面流程已验证，包含 Windows 资源路径问题的修复及回归；详细检查结果与未验证环境见 [验收记录](../../quality/rea-integration-validation.md)，使用入口见 [REA 说明](../../rea.md)。
