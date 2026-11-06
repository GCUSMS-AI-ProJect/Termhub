# AI 工作台、工作空间与附件验收

2026-10-21，Windows x64，TermHub 2.3.1-beta.10。

## 自动检查

- `npm run typecheck`、`npm run lint`、全项目 Prettier：通过。
- Renderer：169 项通过，新增附件字节保留、图片/PDF 识别与大小/数量限制测试。
- Rust/协议：853 项通过，2 项原有忽略项；新增附件安全校验、元数据不暴露内容、三个协议的内容块、工作空间上下文与标题排除测试。
- Clippy：`--locked --all-targets --all-features -- -D warnings` 通过。
- CSS contract：通过，原有 11 处 `!important` 与约 6 处旧颜色债务未增加。

## 原生桌面验证

精确绑定当前工作区 `apps/tauri/src-tauri/target/debug/transterm.exe`，页面来自该项目的 `http://localhost:5188/`，Vite 端口 5188。使用开发程序旁的隔离配置、独立 WebView 数据和 loopback 测试服务。用户正在运行的 `release/TermHub-REA-compact/TermHub.exe` 未关闭或操作。

1. 首页入口进入独立工作台；展开界面覆盖完整工作区，返回按钮保留终端 AI 侧栏。
2. 本地工作空间关联会话；文本、图片、PDF 从实际文件选择器进入；移除后重新选择只添加所需文件。
3. 原生发送请求实际到达 loopback Chat、Responses、Anthropic 服务，包含文本原始内容、图片/PDF 数据和对应协议内容块。
4. 页面重载后恢复工作空间、会话和附件。文本/图片预览返回内容；跨会话引用附件被拒绝；公开会话只返回附件元数据。
5. 通过界面创建 SSH 工作空间，绑定 profile 与主机；点击连接启用协作模式。命令审批显示 `/srv/termhub-project`，确认后 loopback SSH 收到 `cd -- '/srv/termhub-project' && id -u`，结果回到对话。
6. 生成中删除工作空间被拒绝。使用另一个 profile（相同主机名）发送旧工作空间请求时，Rust 拒绝，未进入 Provider 请求。
7. 本地工作空间连接通过共享 workspace controller 打开并激活本地终端；输入框支持粘贴、DOM 拖放、原生路径拖放与移除，目录不能作为附件读取。
8. 四个内置主题、自定义 accent、320px 侧栏、键盘 Tooltip/Escape 和减少动画设置通过；原生窗口为 1280×820。
9. 通过确认弹窗移除工作空间，目录、文件和附件历史保留，对话立即移入独立对话列表。

测试后关闭并清理测试标签、profile、Provider 和对话，移除开发程序旁的 portable 标记。截图及机器证据在 `release/TermHub-Workspace*.png` 和 `release/BUILD_INFO.json`。

## Windows 交付

`npm run build:win -w @transterm/tauri -- --target x86_64-pc-windows-msvc` 成功生成主程序与 NSIS 安装包。完整 REA/Node 运行时和许可随 `release/TermHub-AI-Workspace/` 交付，桌面 `TermHub.lnk` 指向其中的 `TermHub.exe`，保留原图标。最终主程序通过 CLI 品牌和持续 stdio 连接上的 MCP 初始化检查，兼容 `agentContractVersion: 2`；文件大小和 SHA-256 写入 `release/BUILD_INFO.json` 与 `release/SHA256SUMS.txt`。

## 文件规模与兼容

面板由原约 645 行增长至约 835 行，未超过强制拆分阈值；工作空间导航、表单、动作、附件、原生拖放分别放在独立组件或 hook。Rust 新模块通过 `services/ai/mod.rs` facade 引入。核心类型、bridge、命令注册与 i18n 为聚合文件；CSS、测试、文档适用仓库豁免。

配置继续使用 `com.transterm.desktop`；原有对话缺少工作空间和附件字段时按独立对话恢复。目录偏好不是文件访问沙箱；工具权限、终端身份校验和 REA 手动开关继续由现有服务管理。

未验证商业模型对图片/PDF 的接受情况、用户实际 SSH 主机，以及 macOS/Linux 原生界面。本次协议验证使用可记录请求的本机测试 Provider。
