# AI 侧栏与多模型接入

目标：保持终端 AI 侧栏，参考 Codex IDE 的会话与输入体验，提供柔和、清晰的模型选择、工具状态和点击反馈；补齐 Gemini，并保留 Claude、OpenAI 与国产模型接入。

- [x] 核对官方协议与现有 Provider，实现 Gemini 流式工具调用及必要兼容修复。
- [x] 设置提供厂商预设、自定义地址/模型与明确的接入说明。
- [x] 整理侧栏输入区、会话状态和工具详情，支持窄屏、键盘与减少动态效果。
- [x] 通过项目门禁、本地协议夹具与当前开发版原生 UI 验证。
- [x] 构建 Windows EXE/安装包，更新桌面快捷方式与交付记录。

保留工作空间、附件、SSH 绑定与 REA 手动开关；不恢复独立工作台，不迁移或清理用户数据。模型通过用户配置的 API Key 接入。官方 Codex 账号登录、云任务和扩展生态不属于本次实现。

参考：

- https://learn.chatgpt.com/docs/codex/ide
- https://ai.google.dev/gemini-api/docs/openai/
- https://platform.claude.com/docs/en/build-with-claude/streaming

CSS 基线：11 处既有 `!important`、约 6 处旧直接颜色，无新增。

交付：`release/TermHub-AI-Chat/TermHub.exe` 与 `release/TermHub_2.3.1-beta.10_x64-setup.exe`，桌面快捷方式已更新。174 项 renderer、869 项 Rust 测试通过（2 项既有忽略），原生 UI、CLI/MCP 和所有门禁通过。详情见 [验证记录](../../quality/ai-multi-provider-validation.md)。
