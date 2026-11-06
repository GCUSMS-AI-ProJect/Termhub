## FileTerm 2.3.1-beta.2

本测试版修复 macOS Dock 自选图标在应用退出后无法保持的问题，并明确静态图标的使用范围。

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.2 更新重点

- **macOS Dock 图标**：修复退出应用后 Dock 仍显示所选图标的问题；Dock 插件直接监听 FileTerm 的图标偏好，避免递归设置 Dock tile。
- **静态应用图标**：Finder、Launchpad 和安装包继续使用经典银边图标，不受 Dock 图标选择影响。
- **回归检查**：CI 验证 Dock 插件生命周期，并检查打包后的 macOS 静态图标与经典图标资源一致。

### 本版本包含的主要 PR 和问题修复

- [PR #319](https://github.com/St0ff3l/fileterm/pull/319)：修复 macOS Dock 自选图标在退出后回退，并加入 Dock 插件生命周期回归检查。

完整变更记录请查看 [v2.3.1-beta.1 与 v2.3.1-beta.2 的比较](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.1...v2.3.1-beta.2)。

### 测试版验证范围

Dock 图标在 macOS 27.0.1 的本地 ad hoc 签名测试应用中，已验证在退出、重新启动和重启 Dock 后保留所选样式；CI 也会运行原生 Dock 插件生命周期测试。实体串口硬件、Windows/WSL 桌面手动回归和 Windows 11 12 小时长测仍待完成。请将此版本用于测试，并反馈设备、系统与复现步骤。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.2

This beta fixes selected macOS Dock icons reverting after FileTerm quits and clarifies which macOS locations use the static icon.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **macOS Dock icon**: Keep the selected icon after FileTerm quits. The Dock tile plugin now observes FileTerm's icon preference directly and avoids recursive Dock tile assignment.
- **Static app icon**: Finder, Launchpad, and installation packages continue to use the classic silver-rim icon, independent of the Dock selection.
- **Regression checks**: CI exercises the Dock plugin lifecycle and verifies the packaged macOS static icon matches the classic icon asset.

### Main PRs and issues

- [PR #319](https://github.com/St0ff3l/fileterm/pull/319): Fix the macOS Dock icon reverting after quit and add a Dock plugin lifecycle regression check.

See the [comparison between v2.3.1-beta.1 and v2.3.1-beta.2](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.1...v2.3.1-beta.2) for the complete change set.

### Beta validation scope

The selected Dock icon was verified on a locally built, ad hoc-signed app on macOS 27.0.1 after quitting and reopening FileTerm and restarting Dock. CI also runs the native Dock plugin lifecycle test. Physical serial hardware, manual Windows/WSL desktop regression, and the 12-hour Windows 11 soak test are still pending. Please use this version for testing and include the device, operating system, and reproduction steps in feedback.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
