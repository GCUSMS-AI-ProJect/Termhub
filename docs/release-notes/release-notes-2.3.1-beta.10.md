## FileTerm 2.3.1-beta.10

本测试版改进多连接标签管理、SSH 兼容性与长时间终端任务的响应和诊断能力。

**下载地址**

| 平台    | 类型     | 下载                                                                                                                                                                                                                                                                                     |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS   | DMG      | [Apple 芯片](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-macos-arm64.dmg) · [Intel](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-macos-x64.dmg)                                           |
| Windows | 安装版   | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-windows-x64-setup.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-windows-arm64-setup.exe)                                  |
| Windows | 便携版   | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-windows-x64-portable.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-windows-arm64-portable.exe)（需安装 WebView2 Runtime） |
| Linux   | DEB      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-x86_64.deb) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-arm64.deb)                                            |
| Linux   | RPM      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-x86_64.rpm) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-arm64.rpm)                                            |
| Linux   | AppImage | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-x86_64.AppImage) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-arm64.AppImage)                                  |
| Linux   | Arch     | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-x86_64.pkg.tar.zst) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-arm64.pkg.tar.zst)                            |

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.10 更新重点

- **标签与工作区**：支持按主机分组浏览连接标签，并提供紧凑标签栏选项；切换和关闭连接时的工作区过渡更稳定。
- **SSH 兼容性**：支持通过 SSH 配置别名连接，改进 Fish shell 初始化和 Synology 路径处理。
- **终端稳定性与诊断**：限制终端输入、输出和诊断告警积压，减少重复重绘开销；增加交互延迟、终端处理进度及 WebView2 进程内存诊断。

### 本版本包含的主要 PR 和问题修复

- [PR #339](https://github.com/St0ff3l/fileterm/pull/339)：改进管理器上下文菜单和子窗口唤起。
- [PR #340](https://github.com/St0ff3l/fileterm/pull/340)：增加 SSH 配置别名连接，并强化 SSH 配置与密钥策略。
- [PR #341](https://github.com/St0ff3l/fileterm/pull/341)：增加主机分组标签导航和紧凑标签栏。
- [PR #342](https://github.com/St0ff3l/fileterm/pull/342)：改进 Fish shell 初始化兼容性。
- [PR #343](https://github.com/St0ff3l/fileterm/pull/343)：限制终端输出积压并公平调度多个终端。
- [PR #345](https://github.com/St0ff3l/fileterm/pull/345)：限制输入与诊断积压，改进长时间终端任务性能和诊断。

完整变更记录请查看 [v2.3.1-beta.9 与 v2.3.1-beta.10 的比较](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.9...v2.3.1-beta.10)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.10

This beta improves multi-connection tab management, SSH compatibility, and responsiveness and diagnostics for long-running terminal workloads.

**Downloads**

| Platform | Type      | Downloads                                                                                                                                                                                                                                                                                 |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | DMG       | [Apple silicon](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-macos-arm64.dmg) · [Intel](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-macos-x64.dmg)                                         |
| Windows  | Installer | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-windows-x64-setup.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-windows-arm64-setup.exe)                                   |
| Windows  | Portable  | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-windows-x64-portable.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-windows-arm64-portable.exe) (requires WebView2 Runtime) |
| Linux    | DEB       | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-x86_64.deb) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-arm64.deb)                                             |
| Linux    | RPM       | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-x86_64.rpm) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-arm64.rpm)                                             |
| Linux    | AppImage  | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-x86_64.AppImage) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-arm64.AppImage)                                   |
| Linux    | Arch      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-x86_64.pkg.tar.zst) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.10/FileTerm-2.3.1-beta.10-linux-arm64.pkg.tar.zst)                             |

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Tabs and workspaces**: Browse connection tabs grouped by host and choose a compact tab bar; workspace transitions are more reliable when switching or closing connections.
- **SSH compatibility**: Connect through SSH config aliases, with improved Fish shell initialization and Synology path handling.
- **Terminal stability and diagnostics**: Bound terminal input, output, and diagnostic alert backlogs while reducing repeated redraw work; add interaction latency, terminal progress, and WebView2 process memory diagnostics.

### Main PRs and issues

- [PR #339](https://github.com/St0ff3l/fileterm/pull/339): Improve manager context menus and child-window activation.
- [PR #340](https://github.com/St0ff3l/fileterm/pull/340): Add SSH config alias connections and strengthen SSH configuration and key policies.
- [PR #341](https://github.com/St0ff3l/fileterm/pull/341): Add host-grouped tab navigation and a compact tab bar.
- [PR #342](https://github.com/St0ff3l/fileterm/pull/342): Improve Fish shell initialization compatibility.
- [PR #343](https://github.com/St0ff3l/fileterm/pull/343): Bound terminal output backlog and schedule terminal output fairly.
- [PR #345](https://github.com/St0ff3l/fileterm/pull/345): Bound input and diagnostic backlogs and improve long-running terminal performance and diagnostics.

See the [comparison between v2.3.1-beta.9 and v2.3.1-beta.10](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.9...v2.3.1-beta.10) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
