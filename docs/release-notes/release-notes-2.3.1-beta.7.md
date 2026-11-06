## FileTerm 2.3.1-beta.7

本测试版增加 Windows 线程调度诊断，帮助排查长时间运行后的终端输入延迟，并减少终端历史滚动期间无效的滚动条更新。

**下载地址**

| 平台    | 类型     | 下载                                                                                                                                                                                                                                                                                 |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS   | DMG      | [Apple 芯片](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-macos-arm64.dmg) · [Intel](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-macos-x64.dmg)                                           |
| Windows | 安装版   | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-windows-x64-setup.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-windows-arm64-setup.exe)                                  |
| Windows | 便携版   | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-windows-x64-portable.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-windows-arm64-portable.exe)（需安装 WebView2 Runtime） |
| Linux   | DEB      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-x86_64.deb) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-arm64.deb)                                            |
| Linux   | RPM      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-x86_64.rpm) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-arm64.rpm)                                            |
| Linux   | AppImage | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-x86_64.AppImage) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-arm64.AppImage)                                  |
| Linux   | Arch     | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-x86_64.pkg.tar.zst) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-arm64.pkg.tar.zst)                            |

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.7 更新重点

- **Windows 卡顿诊断**：在已有卡顿告警后短时采集 FileTerm 和 WebView2 关键线程的实际核心效率等级驻留与 Ready 调度等待，方便与卡顿时间对照。精确 ETW 数据可能需要管理员权限；普通使用不需要提权，也不会弹出 UAC。权限不足时保留常规健康日志并说明诊断不可用。
- **诊断边界与隐私**：采集有时间、事件和 CPU 开销上限，不改变绑核或线程优先级；日志不包含终端内容、命令行、窗口标题或凭据。观察到线程运行在较低效率等级不能单独证明它导致卡顿。
- **终端滚动性能**：终端行数、历史长度和视口位置都未变化时跳过滚动条通知，减少持续输出期间的重复更新。

### 本版本包含的主要 PR 和问题修复

- [PR #330](https://github.com/St0ff3l/fileterm/pull/330)：增加受限的 Windows 线程调度诊断并减少滚动时的无效滚动条更新。

完整变更记录请查看 [v2.3.1-beta.6 与 v2.3.1-beta.7 的比较](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.6...v2.3.1-beta.7)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.7

This beta adds Windows thread scheduling diagnostics to help investigate terminal input delays after long sessions, and reduces unnecessary scrollbar updates while scrolling terminal history.

**Downloads**

| Platform | Type      | Downloads                                                                                                                                                                                                                                                                             |
| -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | DMG       | [Apple silicon](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-macos-arm64.dmg) · [Intel](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-macos-x64.dmg)                                         |
| Windows  | Installer | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-windows-x64-setup.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-windows-arm64-setup.exe)                                   |
| Windows  | Portable  | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-windows-x64-portable.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-windows-arm64-portable.exe) (requires WebView2 Runtime) |
| Linux    | DEB       | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-x86_64.deb) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-arm64.deb)                                             |
| Linux    | RPM       | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-x86_64.rpm) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-arm64.rpm)                                             |
| Linux    | AppImage  | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-x86_64.AppImage) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-arm64.AppImage)                                   |
| Linux    | Arch      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-x86_64.pkg.tar.zst) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.7/FileTerm-2.3.1-beta.7-linux-arm64.pkg.tar.zst)                             |

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Windows responsiveness diagnostics**: After an existing stall warning, collect a short trace of actual processor efficiency-class residency and Ready-to-run wait for key FileTerm and WebView2 threads. Precise ETW data may require administrator privileges; normal use does not require elevation and no UAC prompt appears. If access is unavailable, regular health logs continue and the diagnostic status explains the limitation.
- **Diagnostic limits and privacy**: Collection is bounded by time, event count, and CPU cost and does not change processor affinity or thread priority. Logs exclude terminal content, command lines, window titles, and credentials. Running on a lower efficiency-class processor alone does not prove that it caused a stall.
- **Terminal scrolling**: Skip scrollbar notifications when terminal rows, history length, and viewport position are unchanged, reducing repeated updates during continuous output.

### Main PRs and issues

- [PR #330](https://github.com/St0ff3l/fileterm/pull/330): Add bounded Windows thread scheduling diagnostics and skip unnecessary scrollbar updates during scrolling.

See the [comparison between v2.3.1-beta.6 and v2.3.1-beta.7](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.6...v2.3.1-beta.7) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
