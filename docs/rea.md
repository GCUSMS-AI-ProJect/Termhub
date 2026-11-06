# 内置 REA

transterm 内置 REA 6.7.0 的 MCP stdio 客户端。MCP 客户端是 AI 与 REA 之间的工具连接层，由 Rust 服务负责；无需另装客户端或配置 MCP 地址。

## 使用

1. 打开本地终端或 SSH 服务器终端，再打开 AI 面板，配置支持工具调用的 AI 模型/API。REA 不包含模型。
2. 点击聊天输入栏内的 REA 文件分析 SVG 图标开启。默认关闭；悬停显示操作和状态，开启中显示加载环，再次点击可取消。远端首次使用会自动准备 REA。
3. 开启成功后图标高亮并显示勾选标记，再次点击关闭并停止进行中的 REA 调用。选择半自动或全自动模式，确认当前终端上下文后即可调用；纯对话模式不执行工具。
4. 点击 REA 图标旁的小箭头展开“分析目标”，输入文件、目录完整路径或 `http://` / `https://` 网页链接，点击“填入对话”，检查后发送。安装要求折叠在“环境说明”中；也可直接在对话里指定目标。
5. 半自动模式在卡片中审批实际 REA 调用。全自动模式启用危险操作限制时，仅自动允许声明为只读且非破坏性的工具；其他调用可切换半自动审批。

示例：`使用 REA 分析 /home/ubuntu/example-app，说明模块结构与启动流程，并列出证据和未知项。`

网页示例：输入 `https://example.com` 将生成网页分析请求，优先检查浏览器工具、目标页面及依赖，再分析页面结构、脚本和网络行为。网页分析需要 REA 运行主机上的兼容浏览器和可用调试连接；SSH 模式使用服务器上的浏览器，不会自动借用本机浏览器。填写链接仅生成草稿，不会自动访问网页或安装浏览器。仅能从网页观察到前端行为，无法据此取得未公开的服务端源码。参见 [REA 网页分析文档](https://github.com/morluto/rea/blob/main/docs/browser-observation.md)。

开关由后端按当前窗口与终端管理；关闭时不会向模型提供 REA 工具，并会停止正在进行的 REA 调用、撤销待审批操作。取消开启或准备失败保持关闭。关闭再打开 AI 面板会恢复当前终端的开关状态；重新连接、目标身份/工作目录变化或重启软件后需要重新开启。检查连接本身不会授予 AI 使用权限。

## 本地与远程

| 目标             | REA 运行位置           | 准备方式                                                                                    |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| 本地终端         | 本机                   | 安装包随附 Node.js 与 REA，离线启动                                                         |
| POSIX SSH 服务器 | SSH 登录用户的远端主机 | 独立 exec 通道，首次在 `${XDG_CACHE_HOME:-$HOME/.cache}/transterm/rea/6.7.0` 准备固定版本包 |

远端需要 Node.js 22.19+、24.11+ 或 26+ 与 npm，首次准备需访问 npm registry。启动器尝试寻找非交互 SSH PATH 中遗漏的 nvm 安装。缺少运行时时显示 `REA_NODE_REQUIRED` / `REA_NODE_VERSION`，不使用 sudo 安装系统软件。

SSH 通道复用已有认证、主机密钥验证及跳板/代理连接；不开放 HTTP 端口，不下载远端分析目标，不注册全局 agent。REA 使用 SSH 登录账号，不继承终端 sudo/su 身份。FTP、Telnet、串口、网络设备和 Windows SSH 服务器不支持此 POSIX 启动器。

发现工具目录不等于所有引擎已经就绪。原生反编译需要主机上的 Ghidra、IDA 等；JADX、JDK、浏览器等依赖遵循 REA 要求，缺失时显示真实诊断。

## 生命周期与结果

- 每条 AI 请求内共享一个 REA 会话；完成、失败或取消后关闭进程/通道。下一条消息重新连接，临时分析句柄需要重新获取。
- `transterm_rea` 提供 list（筛选目录）、describe（准确参数 schema）、call。模型不生成任意 REA shell 命令。
- 每次调用核对终端、窗口模式与会话 revision，目标变化则停止。
- MCP 消息上限 16 MiB，单次请求超时 180 秒；模型侧结果上限 60,000 字符，截断明确标记，大结果应使用 REA summary/分页。
- 脱敏结果与工具活动沿用本地 AI 对话记录。送给配置模型的分析结果仍受模型服务的数据规则约束。
- 未实现的 sampling/elicitation 等服务端回调返回协议错误，不模拟完成。

## 开发与打包

开发和构建自动运行 `npm run prepare:rea -w @transterm/tauri`。隔离锁文件在 `apps/tauri/rea-runtime/`，生成运行时和许可证在忽略的 `apps/tauri/src-tauri/resources/rea/`。使用官方发布包 `rea-agents@6.7.0`；`rea-upstream/` 参考源码未修改。

Windows 安装包包含 `rea/`。单独复制 EXE 时，必须同时保留同目录的 `rea/`；完整目录无需系统 Node.js。其他平台或跨架构发行必须准备对应运行时，不能直接使用 Windows x64 资源。

真实 REA 冒烟测试（先准备运行时）：

```powershell
cargo test --manifest-path apps/tauri/src-tauri/Cargo.toml --lib bundled_rea_performs_real_javascript_analysis -- --ignored --nocapture
```

普通测试覆盖 MCP 握手、分页、取消、错误、回调拒绝、loopback SSH 字节流与 stderr 隔离，以及模型 schema、参数与脱敏。真实远程主机的 Node.js/npm、分析引擎和模型调用仍需按目标环境验收。
