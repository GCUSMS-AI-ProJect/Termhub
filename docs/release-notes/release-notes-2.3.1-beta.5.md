## FileTerm 2.3.1-beta.5

本测试版改进 Windows 与 Linux 应用图标的尺寸和清晰度，并修正 Linux 安装包的高分辨率图标资源。

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.5 更新重点

- **Windows 应用图标**：裁去 macOS Dock 安全留白并提供多尺寸 ICO；窗口小图标和大图标分别使用合适的分辨率，桌面、开始菜单和固定任务栏快捷方式会在启动或切换 Logo 时更新。
- **Linux 应用图标**：窗口、系统托盘和应用生成的桌面启动器使用清晰的满版图标；DEB、RPM 和 Pacman 包保留适合 Linux 图标主题的 32、128、256px 经典图标。
- **图标资源整理**：Windows 与 Linux 共用的运行时变体集中存放，平台安装包所需的专用资源继续按平台归档。

### 本版本包含的主要 PR 和问题修复

- [PR #324](https://github.com/St0ff3l/fileterm/pull/324)：提升 Windows 与 Linux 应用图标清晰度，整理平台图标资源并校验 Linux 包图标。

完整变更记录请查看 [v2.3.1-beta.4 与 v2.3.1-beta.5 的比较](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.4...v2.3.1-beta.5)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.5

This beta improves Windows and Linux app icon sizing and clarity, and fixes the high-resolution icon resource used in Linux packages.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Windows app icons**: Remove the macOS Dock safety margin and provide a multi-size ICO. Windows uses suitable resolutions for small and large window icons, and refreshes Desktop, Start menu, and pinned taskbar shortcuts on startup or when the logo changes.
- **Linux app icons**: Use clear full-canvas artwork for windows, the system tray, and app-generated desktop launchers. DEB, RPM, and Pacman packages retain classic 32, 128, and 256px icons suited to Linux icon themes.
- **Icon asset organization**: Keep runtime variants shared by Windows and Linux together, with package-specific resources filed under their target platform.

### Main PRs and issues

- [PR #324](https://github.com/St0ff3l/fileterm/pull/324): Improve Windows and Linux app icon clarity, organize platform assets, and verify Linux package icons.

See the [comparison between v2.3.1-beta.4 and v2.3.1-beta.5](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.4...v2.3.1-beta.5) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
