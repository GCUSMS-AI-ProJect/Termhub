# Codex 风格的 AI 工作台、工作空间与附件

在 TermHub 内增加可展开的 AI 工作台，同时保留终端侧栏。左侧显示工作空间与各自的会话；中间提供流式对话、命令审批、模型与模式选择；输入框提供附件选择、拖入、粘贴和移除。复用当前主题、共享控件、SSH 与 REA。

工作空间支持本地目录与 SSH 目录，持久化目录及主机身份；对话记录关联工作空间。选择工作空间为后续工具调用指定工作目录，远程目录必须匹配已确认的当前 SSH 身份，断线/切换主机后不能沿用旧授权。工作目录不是命令沙箱，不宣称限制命令只能访问目录内文件。

附件支持文本/代码、图片和 PDF。只有发送时才交给所选 Provider；本地历史保存附件元数据，内容单独存储。Rust 校验数量、大小、文件格式与所有权；三个 Provider 协议分别构造对应内容块。重试及恢复历史保留附件，标题摘要不读取附件。

本次复现工作空间、会话与附件的核心交互。现有 SSH/REA 和审批链继续使用；不冒充官方 Codex，也不宣称实现其云端任务、账户或计费服务。参考：[Codex 交互](https://developers.openai.com/blog/mastering-codex-remote-for-engineering)、[文件输入](https://developers.openai.com/api/docs/guides/file-inputs)、[图片输入](https://developers.openai.com/api/docs/guides/images-vision)。

验收包括：工作空间持久化与会话隔离、跨主机拒绝、实际附件内容到达 Provider、图片/PDF 请求格式、文件移除与重试、主题/键盘/窄视口、全量项目门禁、Windows 构建和桌面入口更新。

实现、全量门禁和原生桌面验收已完成，见 [验收记录](../../quality/ai-workspaces-attachments-validation.md)。Windows x64 成品为 `release/TermHub-AI-Workspace/TermHub.exe`，安装包为 `release/TermHub_2.3.1-beta.10_x64-setup.exe`；最终二进制的 CLI 与 MCP 初始化通过，桌面 TermHub 快捷方式已更新并保留原图标。现有用户窗口未关闭。
