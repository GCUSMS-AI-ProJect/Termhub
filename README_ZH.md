# TermHub

面向开发者和运维人员的桌面远程工作台，将终端、远程文件管理、传输任务和 AI 助手集中到一个工作区。

[项目首页](./README.md) · [English](./README_EN.md) · [源码仓库](https://github.com/GCUSMS-AI-ProJect/Termhub)

## 项目状态与来源

当前源码版本为 `2.3.1-beta.10`。本仓库是基于 FileTerm 的 TermHub 源码分支；仓库中的历史构建记录不代表已经发布可下载的 TermHub 正式版。当前请按照下文从源码运行或自行构建安装包。

- 上游项目：[St0ff3l/fileterm](https://github.com/St0ff3l/fileterm)，来源提交为 `ef044caa8868d9edbf5eb0165d31865009897b0b`。
- 来源 fork：[gcusms/fileterm](https://github.com/gcusms/fileterm)，用于说明源码来源，不是 TermHub 安装包下载入口。
- 内置 REA 版本为 `6.7.0`，使用固定依赖与独立运行时。
- 保留原作者版权、[MIT 许可证](./LICENSE)和[第三方许可声明](./THIRD_PARTY_NOTICES.md)。

产品名称为 **TermHub**。为兼容现有数据和工具，源码 workspace、Rust crate、bridge、主题及 MCP 协议继续使用 `transterm` 标识，应用数据目录标识保留 `com.transterm.desktop`。Windows 打包程序为 `TermHub.exe`，开发态二进制为 `transterm.exe`。

## 核心能力

| 能力       | 说明                                                              |
| ---------- | ----------------------------------------------------------------- |
| 连接与终端 | SSH、本地终端、Telnet、串口；多标签工作区及分屏                   |
| SSH 网络   | 主机密钥验证、密码/密钥/MFA、代理、跳板和 SSH 隧道                |
| 远程文件   | SFTP、FTP/FTPS 浏览与文件操作；SSH 终端目录及权限上下文联动       |
| 文件编辑   | Monaco 编辑器、语法高亮、编码选择、文件修改恢复与撤销             |
| 传输管理   | 上传、下载、递归目录传输、进度、取消及可恢复传输                  |
| AI 助手    | 模型配置、流式对话、附件、终端上下文和受审批的工具执行            |
| REA 分析   | 默认关闭；支持本地与 POSIX SSH 主机上的分析工具                   |
| 配置与安全 | 连接分组、密钥库、设备绑定凭据加密、会话锁定及 WebDAV/S3 加密备份 |
| 桌面体验   | 明暗主题、自定义主题、独立管理窗口、文件抽屉和焦点模式            |

功能是否适用取决于连接协议、服务端能力及本机环境。Telnet、串口不提供 SFTP 能力；REA 不包含模型，需要配置支持工具调用的模型服务，额外分析引擎需在运行主机上具备相应依赖。

详见 [AI 助手](./docs/ai-copilot.md)、[REA](./docs/rea.md)与[架构说明](./docs/architecture.md)。

## 从源码开始

### 环境要求

- Node.js：22.x 至少 22.19、24.x 至少 24.11，或 26 及以上；内置 REA 准备脚本会校验版本。
- npm、Rust stable，以及当前平台的 Tauri v2 原生构建依赖。
- Windows：MSVC C++ Build Tools、Windows SDK、WebView2 Runtime 和 NASM；`cargo` 与 `nasm` 需在 PATH 中。
- macOS：Xcode Command Line Tools。
- Linux：GTK、WebKitGTK 4.1 等开发依赖；具体发行版说明见[安装指南](./docs/installation/zh-CN.md)。

所有命令均在包含根 `package.json` 的仓库目录执行：

```powershell
git clone https://github.com/GCUSMS-AI-ProJect/Termhub.git
cd termhub
npm ci
npm run dev
```

如果已克隆仓库，直接进入仓库目录执行 `npm ci` 和 `npm run dev`。

开发启动会自动构建共享包并准备内置 REA。首次准备需要下载 npm 依赖；完整桌面运行需要本地图形会话。REA 运行时按当前 Node.js 版本、操作系统与架构准备，跨平台或跨架构构建不能直接复用其他平台的资源。

### 仅预览界面

```powershell
npm run build:packages
npm run dev:renderer -w @transterm/tauri
```

默认开发地址为 `http://localhost:5188`。浏览器使用预览模式，真实 SSH/SFTP、本机文件系统和其他桌面能力需要 Tauri 运行时。

## 检查与构建

```powershell
npm run typecheck
npm run lint
npx prettier --check apps/tauri packages/core packages/shared packages/storage
npm run test:renderer -w @transterm/tauri
npm run test:tauri
cargo clippy --manifest-path apps/tauri/src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings
```

类型检查及开发/构建入口会自动构建所需共享包。Rust 测试需要原生构建环境；自动化通过之后，仍需对实际安装包和真实协议连接进行验收，见[发行候选验收计划](./docs/plans/active/release-candidate-acceptance.md)。

Windows 本地构建：

```powershell
npm run build:win
```

该命令使用现有 NSIS 配置，不生成自动更新签名产物。程序生成在 `apps/tauri/src-tauri/target/release/TermHub.exe`，安装包位于同级 `bundle/nsis/`。直接分发程序时，应同时保留相邻的完整 `rea/` 运行时及许可文件。

其他构建入口为 `npm run build`、`npm run release:mac`、`npm run release:win` 和 `npm run release:linux`；release 命令需要相应平台工具链及发行配置。

使用 `--no-bundle` 或直接分发 EXE 时，还需检查原生 DLL 依赖。本次 Windows GNU 构建需要相邻的 `WebView2Loader.dll`，它不能由 WebView2 Runtime 安装替代；修复步骤、独立运行时和本机验证范围见 [Windows 本地启动记录](./docs/quality/windows-local-startup.md)。

## 发布与更新现状

当前源码托管于 Gitee，仓库保留的 `.github/workflows/` 是 GitHub Actions 配置；推送到 Gitee 不会自动运行这些工作流。

现有发布脚本包含 macOS、Windows 和 Linux 的打包流程，但这不代表已有对应平台的 TermHub 发行包。发布前需要配置实际发布仓库、产物渠道、签名与更新地址，并完成平台验收。

Windows 更新配置 `apps/tauri/src-tauri/tauri.windows.conf.json` 仍指向 `gcusms/fileterm`，且 `plugins.updater.pubkey` 为空，因此当前不能作为已配置完成的 TermHub 签名自动更新渠道。发布者需要设置自己的公钥、更新端点以及发布环境中的 `TAURI_SIGNING_PRIVATE_KEY`；签名私钥不得提交到源码。

本次文档整理不改变运行时更新地址。安装包、版本说明和更新清单应属于同一发布渠道，不能把上游 FileTerm 的下载页当作 TermHub 发布页。

## 仓库结构

```text
apps/tauri/
  src/bridge/          TypeScript 命令与事件桥接
  src/renderer/        React 工作区界面
  src-tauri/src/       Rust commands、services、sessions 与存储
  rea-runtime/         REA 独立依赖与锁文件
packages/core/         领域类型与接口契约
packages/shared/       共享常量与工具
packages/storage/      存储抽象
vendor/russh/          本地 SSH 库补丁
docs/                  架构、设计、计划与质量记录
```

系统能力沿 `renderer → bridge → Rust commands → services → sessions` 调用。共享领域类型以 `packages/core` 为准，协议客户端由 Rust 管理。

## 参与开发与反馈

请在 [TermHub 仓库](https://github.com/GCUSMS-AI-ProJect/Termhub)反馈问题，附上操作系统、应用版本、复现步骤及脱敏日志。

开发约束见 [AGENTS.md](./AGENTS.md)，架构见 [docs/architecture.md](./docs/architecture.md)，后续规划见 [docs/roadmap.md](./docs/roadmap.md)。历史验收记录只对应记录中的版本、提交与平台，不代表当前源码已重新验证。
