# AI 当前 SSH 接入验收

2026-10-21，Windows x64 当前工作区原生开发版验证。开发进程为 `apps/tauri/src-tauri/target/debug/transterm.exe`，页面来自当前 Vite `http://localhost:5188/`，通过原生 bridge 验证；使用独立 portable 配置和 WebView 数据，未操作用户的已打包程序或远程连接。

聊天栏新增 28px 服务器 SVG 按钮，位于 REA 按钮旁。点击后先校验当前 SSH 和 Provider，再启用协作模式并附带终端上下文；再次点击恢复普通对话并取消引用，SSH 会话保留。协作模式中的命令逐次确认。模型仍由所选 AI Provider 提供。

## 已验证

- 六项新回归测试覆盖：正常接入、预览失败、leaf/root/Provider/revision 变化、错误或离线目标、启用中切换目标回退、模式保存失败。
- 原生应用连接隔离的 loopback SSH 服务，服务器按钮从普通对话进入半自动协作；L2 预览及模式状态均经过真实 Rust bridge。
- Loopback AI Provider 返回 `id -u` 工具调用。确认前没有对应 exec；确认后真实 SSH exec 收到带 CWD 的命令，输出返回 Provider，随后显示最终回复。
- 再次点击取消接入：纯对话、终端引用关闭，SSH 仍在线。本地终端与 SSH 断线后按钮禁用、接入标记清除。
- 四个内置主题、自定义紫色 accent、320px 侧栏；键盘焦点触发提示、Esc 关闭、Enter 切换接入。共享 Button/Tooltip 与语义主题变量，无新增原生 title 或远程图标资源。
- 类型、lint、Prettier、166 项 renderer 测试、849 项 Rust/协议测试（2 项忽略）、Clippy 和 CSS contract 通过。CSS 原有 11 处 `!important` 与约 6 处 legacy 颜色债务未增加。

截图为 `release/TermHub-AI-SSH.png` 与 `release/TermHub-AI-SSH-approval.png`，机器可读记录在 `.npm-cache/native-build/ai-ssh-desktop-evidence.json`。测试仅使用隔离的 SSH 和 Provider fixture；未连接用户实际服务器，未验证真实商业模型的指令选择，也未运行 macOS/Linux 原生界面。
