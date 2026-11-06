# 慢响应 SSH 主机的终端启动兼容

## 问题与范围

2026-10-11 收到 N1 低内存主机的连接失败反馈。反馈称增加 swap 后恢复；尚无失败日志，不能确认具体失败阶段或归因于 OOM。

代码检查发现 TCP 和 SSH 握手默认各等待 30 秒，可通过 `connectTimeoutSeconds` 设置为 5–300 秒；但认证后的 shell channel、PTY 和 shell 请求固定只有 8 秒预算。SFTP 与系统指标已在后台初始化，不阻塞终端就绪。

## 实施（已完成）

- 提取现有 SSH 连接预算读取函数，由 transport 和 shell startup 共用，保留原有默认值与边界。
- 终端启动三个步骤使用配置预算，继续优先响应取消，保留阶段错误。
- 覆盖默认值、配置值、上下限与非法值；模拟 9 秒后才返回的 channel 创建，并保留现有超时、错误与取消测试。
- 无 IPC、profile 格式、renderer、依赖或凭据策略变更。

## 使用与验收

对慢主机，可将现有连接超时设为 60 秒，并将资源监控间隔调为 15 或 30 秒，必要时关闭监控后对照。诊断时区分 `SSH protocol handshake`、认证与 `Shell startup channel_open_session` 错误，不把所有连接错误统称为握手失败。

本次只修复交互终端启动预算。认证仍为独立 30 秒预算；SFTP 和监控仍保留各自的超时与降级策略。延长等待不能修复服务器资源耗尽或服务进程退出；真实 N1 低内存、swap 压力场景需用户环境复测。

## 验证结果

`npm run typecheck`、`npm run lint`、项目 Prettier 检查、47 项 renderer 测试、Rust 测试（718 项单元测试、10 项 CLI 测试、23 项 contract 测试）与全 targets/features 的 Clippy 均通过；`cargo fmt --check` 与 `git diff --check` 通过。未连接反馈中的 N1，也未进行桌面 UI 或三平台实机复测。
