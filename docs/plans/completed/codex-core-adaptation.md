# Codex 核心机制适配

目标：将官方 Codex 中适合 TermHub 多模型、SSH 侧栏的核心机制适配进现有任务运行时。

- 固定参考源码 `openai/codex@9b39316997fd8bcecdb2007722f52ef858f0dbd8`。
- 使用 REA MCP 静态分析 TypeScript SDK；Rust 核心直接阅读。记录 Windows 导入限制和分析覆盖范围，不把静态结果当作运行验证。
- 保留已有计划、32 轮工具预算、审批、中断恢复与 REA 手动开关。
- 新增请求投影层：优先缩短旧工具输出，再以完整轮次替换为有界摘要，保留最新轮次的协议签名和工具配对。
- 正规化工具调用/结果：剔除孤立结果，补齐结果未知的调用，不宣称执行成功，不触发重放。
- 验证：上下文压力、UTF-8、不可变原始记录、三协议配对与签名、缺失结果、全部项目门禁。

不直接引入 Codex CLI 或 app-server：当前执行路线与审批由 TermHub Rust 服务拥有，继续兼容三类模型协议。

已完成：请求投影压缩和工具结果正规化，六项新增回归；182 项 renderer、918 项 Rust/contract（2 项既有忽略）、类型/lint/格式/Clippy 均通过。Windows 主程序、NSIS 安装包、成品 CLI/MCP 冒烟通过。REA 分析范围、适配对照和限制见 [分析记录](../../quality/codex-core-analysis.md)。未连接真实第三方模型或用户 SSH，未重新截图 UI。
