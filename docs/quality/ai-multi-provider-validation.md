# AI 侧栏与多模型验证

## 实现范围

- 保留单一终端侧栏，组合厂商/模型菜单、柔和输入框、自动增高、流式期间草稿与点击反馈。
- 工具步骤折叠、审批/失败常驻详情、错误输出、历史滚动停留和回到最新。
- Gemini 与 Qwen 预设、厂商选择显示、默认模型填充、能力覆盖保存、键盘操作。
- Gemini 签名、Claude thinking 块、Chat reasoning 续接，以及同厂商/地址/模型绑定的私有历史。

## 自动门禁

- Renderer：174 项通过。
- Rust：869 项通过，2 项既有忽略；新增 11 项协议/持久化回归。
- TypeScript、ESLint、Prettier、全 target/feature Clippy 与 CSS contract 通过。
- CSS 既有债务仍为 11 处 `!important` 与约 6 处旧直接颜色。

协议验证使用 loopback HTTP 和合成 SSE，覆盖两次真实 HTTP 请求的 Gemini 工具续答、延迟/并行工具签名、Claude 内容块顺序、DeepSeek 多用户回合、旧文件默认值、消息删除清理、来源隔离、元数据容量与各厂商参数。未使用真实 API Key 对所有模型厂商进行商业请求验证。

## 原生 UI 与构建

2026-10-21 在当前项目 debug `transterm.exe`、Vite `http://localhost:5188/` 的原生 WebView 中验证，使用独立 portable 配置；用户正在运行的旧版没有退出或修改。

- 四个内置主题与自定义紫色 accent、125% 缩放、1024×600 窗口均无侧栏控件越界。
- 模型菜单、模式菜单、REA 详情、附件添加/移除、20 条历史及实际工具消息展示通过。
- Gemini/Qwen 预设正确显示厂商、默认模型、地址与说明；能力详情可展开，无商业 API 请求。
- 两个临时本地 Provider 验证跨厂商/模型选择，完成后恢复原选择并删除临时记录。
- 原生按下模型按钮得到 `scale(0.96)`，减少动态效果时变为 `none`。
- 长内容初始/追加输出跟随末尾；用户上滚到 150px 后追加输出保持 150px；回到最新恢复跟随。
- 已完成工具默认折叠并可展开，失败 stderr 可见，审批勾选门槛/回调通过；320px 内容无横向溢出。
- 临时 React 组件与媒体模拟均已清理，未发送真实聊天请求。

报告位于 `.npm-cache/native-build/multi-provider-native.json` 与 `multi-provider-content-native.json`；截图位于 `release/TermHub-Multi-Provider-*.png`。Windows 成品与校验和记录在 `release/BUILD_INFO.json` 和 `release/SHA256SUMS`。

Windows release 构建与 NSIS 打包成功，成品位于 `release/TermHub-AI-Chat/TermHub.exe` 和 `release/TermHub_2.3.1-beta.10_x64-setup.exe`。打包后 CLI help 与 MCP initialize（contract version 2）通过，桌面 `TermHub.lnk` 已验证指向新 EXE。版本沿用 2.3.1-beta.10，未创建 tag 或发布 GitHub Release。

## 代码组织与边界

`provider_transport.rs` 从 834 行拆为 618 行，新增 `provider_reasoning.rs`、`provider_continuation.rs` 和 `provider_history.rs` 分别管理参数、当前工具循环与私有历史。现有共享类型聚合、测试和字典遵循文件规模豁免；未增加其他协议类型或独立工作台。

旧对话缺失的 reasoning 不能恢复；严格 DeepSeek 工具模式可通过新建对话使用新历史机制。Google File API、Google Search 工具、厂商网页会员登录和 Codex 云任务不在此次接入范围。macOS/Linux 未在本机进行原生验收。
