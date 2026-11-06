## FileTerm 2.3.1-beta.4

本测试版修复 Windows 桌面和任务栏快捷方式在更新或切换 Logo 后仍显示旧图标的问题，并支持将 FileTerm SSH 密钥库纳入加密远程备份。

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.4 更新重点

- **Windows 应用图标**：启动应用或切换图标时，刷新当前用户桌面、开始菜单和固定任务栏中指向 FileTerm 的快捷方式；保留快捷方式目标和自定义图标。安装包和程序文件本身仍使用经典银边图标。
- **SSH 密钥远程备份**：用户手动上传 WebDAV 或 S3 备份时，FileTerm 密钥库中的 SSH 私钥和已保存的密钥口令会与连接配置一起加密。下载会新增或更新备份中的密钥，并保留本机独有的密钥。
- **旧备份兼容**：此前创建的备份仍可导入，但不含 SSH 私钥；要同步密钥，请使用新版 FileTerm 重新上传备份。

### 本版本包含的主要 PR 和问题修复

- [PR #322](https://github.com/St0ff3l/fileterm/pull/322)：刷新 Windows Shell 快捷方式图标，并将 SSH 密钥库加入远程备份同步。

完整变更记录请查看 [v2.3.1-beta.3 与 v2.3.1-beta.4 的比较](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.3...v2.3.1-beta.4)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.4

This beta fixes stale Windows Desktop and taskbar shortcut icons after app updates or logo changes and adds encrypted remote backup for the FileTerm SSH key vault.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Windows app icons**: Refresh current-user Desktop, Start menu, and pinned taskbar shortcuts that target FileTerm when the app starts or the icon selection changes. Shortcut targets and custom icons are preserved. The installer and executable continue to use the classic silver-rim icon.
- **SSH key remote backups**: When users manually upload a WebDAV or S3 backup, SSH private keys from the FileTerm key vault and saved key passphrases are encrypted with the connection configuration. Downloads add or update keys from the backup while keeping keys stored only on the current device.
- **Existing backup compatibility**: Existing backups remain importable but do not contain SSH private keys. Upload them again with the updated FileTerm to sync keys.

### Main PRs and issues

- [PR #322](https://github.com/St0ff3l/fileterm/pull/322): Refresh Windows Shell shortcut icons and add SSH key vault sync to remote backups.

See the [comparison between v2.3.1-beta.3 and v2.3.1-beta.4](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.3...v2.3.1-beta.4) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
