# TermHub

面向开发者和运维人员的桌面远程工作台，集成 SSH、本地终端、SFTP、FTP/FTPS、传输管理和 AI 助手。

[源码仓库](https://gitee.com/ai-design-gcusms/termhub) · [中文使用说明](README_ZH.md) · [English](README_EN.md)

当前源码版本为 `2.3.1-beta.10`。本仓库基于 [St0ff3l/fileterm](https://github.com/St0ff3l/fileterm)，源码来自 [gcusms/fileterm](https://github.com/gcusms/fileterm) fork。历史构建记录不代表已经发布可下载的 TermHub 正式版；请从源码运行或自行构建。

产品名称为 **TermHub**，保留原有界面、图标、布局及 REA 功能。应用继续使用既有 `com.transterm.desktop` 配置目录，现有连接、设置、密钥和外部工具接口无需因改名而迁移。源码 workspace、Rust crate、主题 ID 与内部通信名称保留兼容标识。

## 来源

- fileterm：`ef044caa8868d9edbf5eb0165d31865009897b0b`，版本 `2.3.1-beta.10`。
- REA：版本 `6.7.0`，参考提交 `90e433df06b3f83417176b8db1b0a905f9df1d3a`；独立依赖与锁文件位于 `apps/tauri/rea-runtime/`。
- REA 已接入 AI 面板：点击聊天输入栏的 REA 图标后可使用本地或远端分析工具；默认关闭，SSH 通过独立通道运行。软件随附本地运行时，普通终端/文件功能不依赖它。见 [REA 使用说明](docs/rea.md)和[最初调研](REA_NOTES.zh-CN.md)。

## 开发

需要 Node.js 22.19+、24.11+ 或 26+、npm、Rust stable，以及当前平台的 Tauri v2 构建依赖。Windows 桌面构建需要 MSVC C++ Build Tools、Windows SDK 和 WebView2。开发与构建会自动准备内置 REA 运行时。

```powershell
npm ci
npm run dev
```

只预览前端界面：

```powershell
npm run build:packages
npm run dev:renderer -w @transterm/tauri
```

浏览器预览不提供真实 SSH/SFTP 或其他桌面系统能力；完整功能需要通过 Tauri 运行。

浏览器入口会自动选择预览模式，不调用原生窗口接口。首页提示条采用浮层布局，不占用工作区网格行。

## 检查与构建

```powershell
npm run typecheck
npm run lint
npm run test:renderer -w @transterm/tauri
npm run test:tauri
npm run build
```

完整功能与开发说明见 [中文说明](README_ZH.md)、[英文说明](README_EN.md)及 [架构说明](docs/architecture.md)。所有命令在包含根 `package.json` 的仓库目录执行。

## 打包与更新

`npm run build` 使用现有 Tauri 构建流程。发布命令保留为 `npm run release:win`、`npm run release:mac` 和 `npm run release:linux`。

Windows 本地安装包（无需配置更新签名密钥）：

```powershell
npm run build:win
```

该命令复用 Windows CI 的 NSIS 配置，不生成自动更新签名产物。生成的程序在 `apps/tauri/src-tauri/target/release/TermHub.exe`，安装包在同级 `bundle/nsis/`。需要 Rust stable MSVC、C++ Build Tools、Windows SDK、WebView2 和 NASM；`cargo` 与 `nasm` 需在 PATH 中。

直接分发 Windows 程序时，请保留同目录的完整 `rea/` 运行时和许可文件。历史交付路径与改名验收见 [TermHub 名称验收](docs/quality/termhub-brand-validation.md)；其中的本地 `release/` 产物不随源码克隆提供，也不代表当前提交已重新构建或验收。

Windows 本地启动依赖、`WebView2Loader.dll` 缺失修复、独立 WebView2 和本次启动验证范围见 [Windows 本地启动记录](docs/quality/windows-local-startup.md)。

当前源码托管于 Gitee；保留的 `.github/workflows/` 为 GitHub Actions 配置，不会因推送到 Gitee 自动执行。

Windows 更新地址仍指向 `gcusms/fileterm`，`plugins.updater.pubkey` 为空，尚未配置完成 TermHub 签名更新渠道。发布前需设置自己的更新端点，将公钥写入 `apps/tauri/src-tauri/tauri.windows.conf.json`，并在发布环境配置 `TAURI_SIGNING_PRIVATE_KEY`。私钥不进入源码。本次文档整理不改变运行时更新地址。

## 许可证

保留原作者的 [MIT LICENSE](LICENSE)、版权信息及 [第三方许可声明](THIRD_PARTY_NOTICES.md)。字体、图标和 vendor 内容继续适用其各自的许可证。
