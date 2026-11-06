# TermHub 名称适配验收

日期：2026-10-21；版本：2.3.1-beta.10；平台：Windows x64。

## 产品名称与兼容性

窗口、首页、设置、系统菜单、托盘、CLI 帮助与 MCP 工具显示文案统一为 TermHub。Windows 正式程序为 `TermHub.exe`，安装包为 `TermHub_2.3.1-beta.10_x64-setup.exe`；开发版显示 TermHub Dev。macOS 应用包名为 TermHub.app，Linux 启动器显示 TermHub；本次仅构建 Windows。

保留 `com.transterm.desktop`、workspace/crate 名、bridge、主题 ID、MCP 工具协议名和已有文件格式标识，以继续使用原有连接、密钥、设置与 REA 缓存。原作者 MIT 许可和第三方许可随软件保留。

MCP 初始化结果仍使用 `_meta.transterm`、`transtermAgentContract` 和 `transterm_*` 工具名。产品文案替换不得修改这些结构化字段；现有协议回归测试覆盖该边界。

## 原生桌面验证

验证窗口来自当前工作区原生开发程序 `apps/tauri/src-tauri/target/debug/transterm.exe`，PID 19040；页面精确匹配 `http://localhost:5188/`，原生 bridge 为 true，运行时产品名为 TermHub Dev。使用隔离的开发配置，没有操作用户正在使用的旧版程序。

已检查首页“欢迎使用 TermHub”、页脚“TermHub Team”以及终端页标题。截图位于本地构建目录 `release/TermHub-home.png` 与 `release/termhub-rea-tooltip.png`。

聊天栏 REA 按钮可正常开启和关闭，本机 REA 返回 207 个工具；四种内置主题、窄侧栏、键盘焦点、Escape、减少动效和提示浮层均完成回归。提示不占用消息区高度。测试仅使用本地临时终端与无网络模型配置，结束后关闭测试窗口。

## 验证范围

类型检查、ESLint、项目要求范围的 Prettier、156 项 renderer 测试、849 项 Rust/协议测试（2 项忽略）、Clippy 与 CSS contract 已通过。

直接运行最终 `TermHub.exe` 的 CLI 帮助与 MCP initialize/tools/list 验证通过：帮助显示 TermHub，`_meta.transterm.agentContractVersion` 为 2，43 个应用 MCP 工具仍使用兼容前缀。此处是应用对外的 MCP 工具数，与 REA 提供的 207 个分析工具不同。Windows EXE 文件属性中的 ProductName 与 FileDescription 均为 TermHub。

最终 Windows 构建和 NSIS 打包成功。交付程序位于 `release/TermHub/TermHub.exe`，相邻保留完整 `rea/` 和许可文件；安装包位于 `release/TermHub_2.3.1-beta.10_x64-setup.exe`。桌面 `TermHub.lnk` 的目标与文件存在性已读回验证。产物信息及 SHA-256 见本地 `release/BUILD_INFO.json` 和 `release/SHA256SUMS.txt`。

未重测真实远程 SSH、用户模型服务或额外分析引擎；未构建 macOS/Linux。完整仓库 Prettier 检查发现既有 `vendor/russh/README.md` 格式问题，项目要求范围的格式检查通过。
