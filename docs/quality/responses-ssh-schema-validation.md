# Responses SSH 请求回归

## 根因与实现

连接 SSH 并启用半自动/全自动模式后，TermHub 会给 Responses 请求附加命令工具。原定义同时设置 `strict: true`、声明 `explanation` 字段，但 `required` 只有 `command` 和 `risk`。用户配置的接口以 HTTP 200 返回 SSE `response.failed`，错误码为 `invalid_function_parameters`，说明 `required must include declared property "explanation"`。

`services/ai/prompt.rs` 已补齐必填字段。`responses_errors.rs` 按 Responses 的结构解析失败、输出额度与过滤原因，限长并脱敏错误详情；`stream.rs` 对 SSE 和兼容 JSON 响应共用检查，失败响应中即使已有工具片段也不会交回执行循环。

参考：[OpenAI Function calling 严格模式](https://developers.openai.com/api/docs/guides/function-calling#strict-mode)、[Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events)。

## 验证

- 使用当前配置的接口与模型发送合成请求，复现原 Schema 失败。仅修正 `required` 后，模拟工具回传完成并得到 `TOOL_LOOP_OK`；未读取或提交用户实际终端输出。
- 在相同接口上显式设置 `reasoning.effort: high`，合成工具调用和现有工具历史格式的续接也返回 `TOOL_LOOP_OK`。
- 5 个新增 Rust 回归覆盖：SSH/REA 严格 Schema 约束、失败原因及凭据脱敏、SSE/JSON/独立 error 事件与未完成原因、错误长度与控制字符、HTTP 200 失败不得返回可执行工具片段。
- 当前仓库原生开发程序连接隔离的 loopback SSH，通过受限本地转发器访问用户配置的 Responses 接口和原模型。使用界面 SSH 按钮开启协作后，模型返回命令审批卡，批准后 `id -u` 仅执行一次；合成输出回传为 `function_call_output`，模型正常回复并保存到本地历史。原生截图：`release/TermHub-Responses-SSH-approval.png`、`release/TermHub-Responses-SSH-fixed.png`。
- 验证使用当前项目的 `target/debug/transterm.exe`、Vite 5188 与单独的 portable 配置；用户正在运行的正式版与真实 SSH 连接未被操作。测试连接、Provider、对话和测试进程已清理。
- 全量门禁通过：169 项 renderer、858 项 Rust/contract 测试（2 项既有忽略）、typecheck、lint、Prettier、全特性全目标 Clippy 和 CSS contract。CSS 检查仅报告既有的 11 处 `!important` 与约 6 处历史直接颜色，本次没有 CSS 变更。
- Windows x64 EXE 与 NSIS 安装包构建成功；最终成品的 CLI 帮助和 MCP 初始化通过。新版入口 `release/TermHub-Responses-Fix/TermHub.exe`，安装包 `release/TermHub_2.3.1-beta.10_x64-setup.exe`，完整 REA 运行时和许可随附。桌面 TermHub 快捷方式已指向新版并保留原图标，用户旧窗口继续运行，需退出后从新入口打开。

成品 SHA-256：EXE `e1c345bc0ffd3305c2d5319950292e908aa3b674477ba48fb99eac9e55272945`；安装包 `11d5ee2f0746f1a7c1c045ccde9b143613fdba925be2080f88e35118ebc66933`。本次为本地 Windows 构建，未发布 GitHub Release，未验证用户真实 SSH 主机或 macOS/Linux 原生程序。

本次业务文件均未触及 1000 行拆分门槛；错误解析独立放在 AI 模块内，测试单独归档。保留现有工具审批与主机身份校验。
