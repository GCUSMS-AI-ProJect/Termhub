## FileTerm 2.3.1-beta.3

本测试版修复 Windows 应用图标切换不刷新的问题，并统一检查 Linux deb、rpm 和 pacman 安装包中的默认图标与启动器配置。

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.3 更新重点

- **Windows 应用图标**：窗口图标会随设置中的 Logo 选择刷新；默认静态图标恢复经典银边样式，托盘图标继续跟随选择。
- **Linux 应用图标**：修正经典银边默认图标，并让已安装的启动器图标在切换 Logo 后刷新，同时保留用户自定义的启动器内容。
- **Linux 安装包**：检查 deb、rpm 和 pacman 包的图标资源、桌面启动器与包装脚本，避免不同打包格式产生不一致。

### 本版本包含的主要 PR 和问题修复

- [PR #320](https://github.com/St0ff3l/fileterm/pull/320)：修复 Windows 与 Linux 应用图标刷新，并验证 deb、rpm 和 pacman 安装包图标。

完整变更记录请查看 [v2.3.1-beta.2 与 v2.3.1-beta.3 的比较](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.2...v2.3.1-beta.3)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.3

This beta fixes Windows app icon changes not refreshing and checks the default icons and launcher configuration in Linux deb, rpm, and pacman packages.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Windows app icon**: Refresh the window icon when the logo selection changes in Settings. The default static icon uses the classic silver rim, while the tray icon continues to follow the selection.
- **Linux app icon**: Restore the classic silver-rim default and refresh installed launcher icons after a logo change while preserving user-customized launcher content.
- **Linux packages**: Check icon assets, desktop launchers, and wrapper scripts in deb, rpm, and pacman packages for consistent behavior.

### Main PRs and issues

- [PR #320](https://github.com/St0ff3l/fileterm/pull/320): Fix Windows and Linux app icon refresh and validate icons in deb, rpm, and pacman packages.

See the [comparison between v2.3.1-beta.2 and v2.3.1-beta.3](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.2...v2.3.1-beta.3) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
