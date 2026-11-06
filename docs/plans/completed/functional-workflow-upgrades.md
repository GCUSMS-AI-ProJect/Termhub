# TermHub 功能流程优化

用户要求落实功能审视中的全部建议，并保持现有功能兼容。实现采用现有 Tauri / bridge / Rust 服务边界，旧配置和 IPC 参数默认保持兼容。

## 范围与分工

- [x] AI 逐步保存执行结果、取消/失败后继续、后台长任务和日志（runtime）。
- [x] 本地工作空间命令执行，平台 shell、CWD、审批与取消（runtime）。
- [x] 长对话上下文预算、摘要及重要信息保留（runtime + conversation UI）。
- [x] Provider 普通回答、流式、工具和图片能力分项检测，错误诊断（provider settings）。
- [x] REA 准备阶段进度与实际分析引擎就绪检查（provider settings）。
- [x] 文件修改差异预览、逐文件接受、版本校验、备份/撤销；远程编辑冲突处理（root）。
- [x] 文件管理器加入 AI、工作空间文件引用和远程日志选段预览（conversation UI）。
- [x] 目录同步预览、忽略规则、只传选择的变化（root）。
- [x] 每会话草稿恢复、历史正文搜索、编辑重发与会话分支（conversation UI）。

## 兼容原则

- 保留已有 SSH/SFTP/FTP、传输续传/校验/重试、REA 手动开关、三类模型协议及旧会话数据。
- 新能力使用明确入口；保存与执行前校验原目标和版本，失败保留可恢复内容。
- 不在测试中连接用户的实际 SSH、消费用户模型密钥或操作已运行的正式应用。
- 旧调用缺少新可选字段时维持原行为；新 UI 使用更完整的保护与诊断流程。

## 验证

- [x] 模块级回归：任务失败/取消/恢复、副作用不重放、本地执行、摘要边界、各模型协议、REA 阶段。
- [x] 文件回归：并发修改冲突、编码、逐文件应用/撤销、同步预览及选择、旧传输恢复。
- [x] 会话回归：草稿、附件、分支、历史搜索、跨工作空间/目标隔离。
- [x] 项目门禁：typecheck、lint、Prettier、renderer tests、Rust/contract tests、Clippy、CSS contract。
- [x] 隔离开发版 UI：四主题、窄侧栏、窗口缩放、按钮/键盘/取消与错误状态。
- [x] Windows 可执行文件、安装包、桌面快捷方式和构建验证记录。

## 完成结果

2026-10-22：功能、项目门禁和隔离 Windows 桌面验证完成。182 项 renderer、908 项 Rust/contract 测试通过（2 项已有忽略）；Clippy、类型、静态、格式和 CSS contract 通过。

已生成 `release/TermHub-Optimized/TermHub.exe` 和 `release/TermHub_2.3.1-beta.10_x64-setup.exe`，验证成品 CLI、MCP contract v2，桌面快捷方式指向新程序并保留原图标。详细边界见 [验证记录](../../quality/functional-workflow-validation.md)。
