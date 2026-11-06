## FileTerm 2.3.1-beta.8

本测试版增加按显示器工作区与 DPI 适配的窗口尺寸、Monaco 空白字符显示控制，并完善 SSH 交互认证。

**下载地址**

| 平台    | 类型     | 下载                                                                                                                                                                                                                                                                                 |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS   | DMG      | [Apple 芯片](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-macos-arm64.dmg) · [Intel](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-macos-x64.dmg)                                           |
| Windows | 安装版   | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-windows-x64-setup.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-windows-arm64-setup.exe)                                  |
| Windows | 便携版   | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-windows-x64-portable.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-windows-arm64-portable.exe)（需安装 WebView2 Runtime） |
| Linux   | DEB      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-x86_64.deb) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-arm64.deb)                                            |
| Linux   | RPM      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-x86_64.rpm) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-arm64.rpm)                                            |
| Linux   | AppImage | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-x86_64.AppImage) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-arm64.AppImage)                                  |
| Linux   | Arch     | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-x86_64.pkg.tar.zst) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-arm64.pkg.tar.zst)                            |

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.8 更新重点

- **窗口与屏幕适配**：启动窗口和独立窗口根据显示器工作区与 DPI 调整尺寸；显示器几何或系统缩放变化时同步更新已打开窗口的限制。
- **Monaco 文件编辑器**：可切换空白字符显示，并在 LF 与 CRLF 间转换行尾；转换支持撤销。
- **SSH 交互认证**：认证提示可选择输入密码或已导入的私钥。密码眼睛仅显示当前输入内容，不会回填已保存密码；输入框聚焦时显示眼睛，点按后保留焦点以便再次隐藏。

### 本版本包含的主要 PR 和问题修复

- [PR #334](https://github.com/St0ff3l/fileterm/pull/334)：SSH 交互认证支持密码和已导入私钥，并增加密码显隐。
- [PR #335](https://github.com/St0ff3l/fileterm/pull/335)：适配窗口尺寸与屏幕变化，并为 Monaco 编辑器增加空白字符和行尾控制。
- [PR #336](https://github.com/St0ff3l/fileterm/pull/336)：修复密码眼睛的焦点与再次点按隐藏行为。

完整变更记录请查看 [v2.3.1-beta.7 与 v2.3.1-beta.8 的比较](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.7...v2.3.1-beta.8)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.8

This beta adds display-aware window sizing, Monaco whitespace controls and improved SSH interactive authentication.

**Downloads**

| Platform | Type      | Downloads                                                                                                                                                                                                                                                                             |
| -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | DMG       | [Apple silicon](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-macos-arm64.dmg) · [Intel](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-macos-x64.dmg)                                         |
| Windows  | Installer | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-windows-x64-setup.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-windows-arm64-setup.exe)                                   |
| Windows  | Portable  | [x64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-windows-x64-portable.exe) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-windows-arm64-portable.exe) (requires WebView2 Runtime) |
| Linux    | DEB       | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-x86_64.deb) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-arm64.deb)                                             |
| Linux    | RPM       | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-x86_64.rpm) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-arm64.rpm)                                             |
| Linux    | AppImage  | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-x86_64.AppImage) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-arm64.AppImage)                                   |
| Linux    | Arch      | [x86_64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-x86_64.pkg.tar.zst) · [ARM64](https://github.com/St0ff3l/fileterm/releases/download/v2.3.1-beta.8/FileTerm-2.3.1-beta.8-linux-arm64.pkg.tar.zst)                             |

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Display-aware windows**: Startup and independent windows fit the display work area and DPI; open windows update their constraints when display geometry or system scaling changes.
- **Monaco file editor**: Toggle whitespace markers and convert line endings between LF and CRLF, with undo support.
- **SSH interactive authentication**: Choose a password or an imported private key in the authentication prompt. The eye reveals only the value typed into the current field, never a saved password; it appears while the field is focused and stays clickable so it can be hidden again.

### Main PRs and issues

- [PR #334](https://github.com/St0ff3l/fileterm/pull/334): Support password or managed-key SSH interactive authentication and password visibility.
- [PR #335](https://github.com/St0ff3l/fileterm/pull/335): Adapt window sizing to display changes and add Monaco whitespace and line-ending controls.
- [PR #336](https://github.com/St0ff3l/fileterm/pull/336): Keep the password visibility toggle available while focused and make it reliably clickable again to hide the value.

See the [comparison between v2.3.1-beta.7 and v2.3.1-beta.8](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.7...v2.3.1-beta.8) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
