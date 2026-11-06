# Codex 核心分析与 TermHub 适配

参考仓库：[openai/codex](https://github.com/openai/codex)，固定提交 `9b39316997fd8bcecdb2007722f52ef858f0dbd8`。源码以直连 Git 获取，不修改机器代理配置。

## REA 实际分析范围

使用随 TermHub 打包的 REA 6.7.0，通过 MCP `analyze_javascript_application` 分析 SDK 的 `src/thread.ts`、`src/exec.ts`、`src/events.ts`、`src/items.ts`。读取 26,370 字节、解析 4 个文件、遍历 3,127 个 AST 节点、输出 73 项 findings、无解析失败。源码未执行。

- 原始分析 Evidence：`ev_a57d2e9e4b3174d1dba0218a558036c1f062b3f6b8346f12d5f6f7dee378f0d1`。
- 摘要 Evidence：`ev_490a0925b1a7ace21450cfc6a1f003635a3ba06d8166c6d5afc67114e3c72950`。
- SDK 目录 SHA-256：`1ee3c961edc9d4728c51ff1c2216f7d4a8c35f708ba4c11b73f6225644f38274`。
- 分析仅覆盖所选文件；24 个目录内文件未选择，语义图触及 1,200 节点总量 / 每文件 400 节点上限，覆盖为 partial。静态关系不证明运行行为。
- `import-reference-source` 在本机返回 `unsupported_host`：Windows 缺少其要求的安全 no-follow 文件打开能力。Rust 核心由直接阅读源码分析，不能宣称由 REA 完整逆向。

原始日志在本地忽略目录 `.npm-cache/native-build/rea-codex-results.json` 和 `rea-codex-source-import.log`；以上摘要用于长期审阅，缓存可删除。

## 核心机制对照

| 官方源码                                                                                                                                                                                                                                                      | 机制                                      | TermHub 处理                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| [SDK thread.ts](https://github.com/openai/codex/blob/9b39316997fd8bcecdb2007722f52ef858f0dbd8/sdk/typescript/src/thread.ts)                                                                                                                                   | thread 内连续 turn、事件与失败分离        | 已有会话、流事件、持久化任务，复用现有实现                                 |
| [SDK exec.ts](https://github.com/openai/codex/blob/9b39316997fd8bcecdb2007722f52ef858f0dbd8/sdk/typescript/src/exec.ts)                                                                                                                                       | 工作目录、恢复 thread、取消信号和进程清理 | 保留 TermHub 本地进程 / SSH exec 和取消机制                                |
| [tools/handlers/plan.rs](https://github.com/openai/codex/blob/9b39316997fd8bcecdb2007722f52ef858f0dbd8/codex-rs/core/src/tools/handlers/plan.rs)                                                                                                              | 计划是状态事件，不自行执行                | 已有 `transterm_update_plan` 和侧栏步骤                                    |
| [session/turn.rs](https://github.com/openai/codex/blob/9b39316997fd8bcecdb2007722f52ef858f0dbd8/codex-rs/core/src/session/turn.rs) / [compact.rs](https://github.com/openai/codex/blob/9b39316997fd8bcecdb2007722f52ef858f0dbd8/codex-rs/core/src/compact.rs) | 长任务压缩上下文后继续；保留近期上下文    | 新增工具轮次投影压缩，保留最新完整轮次、当前计划和有界操作摘要             |
| [context_manager/normalize.rs](https://github.com/openai/codex/blob/9b39316997fd8bcecdb2007722f52ef858f0dbd8/codex-rs/core/src/context_manager/normalize.rs)                                                                                                  | 缺失结果补齐，维持调用/输出结构           | 新增按 call ID 正规化，补 `unknown`，丢弃孤立/重复结果，禁止把未知视为成功 |

这是依据公开源码机制独立实现的适配，不复制上游代码，不捆绑 Codex CLI，也不新增 OpenAI 专属客户端。官方源码为 Apache-2.0；若后续直接移植代码，应保留相应许可证与 NOTICE。

## 具体行为与边界

`services/ai/tool_context.rs` 在每次模型请求前生成临时投影：先缩短旧输出；仍超过现有估算目标时，移除最旧完整轮次，用不可信摘要替代。压缩同时移除该轮调用、结果和推理块，避免孤立工具结果或损坏 Claude/Gemini 的签名。最新轮次完整保留。

摘要包含近期操作参数/结果片段、被压缩轮数和当前计划，明确说明内容不完整、计划是模型自报、不能据此重复副作用。原始内存轮次与已落盘活动/checkpoint 不被投影改写。每轮都从原始记录重建，避免重复压缩摘要造成信息递归丢失。

现有 16k token 是本地粗估目标，不是模型真实上下文窗口。最新轮次、当前用户附件或历史本身过大时仍可能超出目标；不截断签名、不承诺绝不会超窗。摘要为本地抽取，不额外调用模型、不增加总结请求费用。

三类协议共用投影；执行仍走原有本地 / SSH、审批、目标身份检查、文件 diff 确认、32 轮预算与 REA 手动开关。此次不增加 UI 按钮。

## 验证

新增六项 Rust 回归覆盖大推理上下文、不可变原始记录、最新签名、三协议调用/结果配对、缺失/孤立/重复结果、UTF-8 和极大最新轮次。初次测试发现旧截断函数附加省略标记使 Unicode 摘要超出预计长度，已改为按字符明确截取首尾并通过复测。

类型、lint、项目 Prettier、Rust 格式检查、182 项 renderer、918 项 Rust/contract（2 项既有忽略）、Clippy 全部通过。未使用真实第三方 API 凭据或用户 SSH 做验证；此次没有 UI 改动，未重新进行桌面截图验证。

Windows 主程序与 NSIS 安装包已构建，成品 CLI 帮助和 MCP 初始化通过。桌面快捷方式仍指向更新后的便携版程序；版本保持 `2.3.1-beta.10`。产物：

- `release/TermHub-Optimized/TermHub.exe`，68,238,848 字节，SHA-256 `092d0e761127bc9a59fd6a1edd4d6ea41c275fa3f98cc483ebe379533e5e4558`。
- `release/TermHub_2.3.1-beta.10_x64-setup.exe`，67,129,167 字节，SHA-256 `a05c75ad711b035654b28e2e1d4aa0a49a78b8c4943175db763c8abcfca20a93`。
