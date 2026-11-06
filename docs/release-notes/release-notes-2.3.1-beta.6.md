## FileTerm 2.3.1-beta.6

本测试版改进终端中 Claude Code 等 TUI 的符号表格对齐、emoji 选区显示和拖动缩放时的刷新，并减少持续输出下的终端渲染开销。

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.6 更新重点

- **终端符号与 emoji**：保持 `✻`、`※` 等常见歧义符号占一列，修复回退字体造成的表格线偏移；双列 emoji 在跨格选中时完整显示。
- **终端缩放与重绘**：调整终端区域宽度或窗口大小时立即刷新；尺寸稳定后同步终端网格，即使远端程序持续输出也不会一直等待。
- **终端性能**：合并滚动期间重复的渲染、前景色适配和滚动条通知，减少高负载输出时的额外工作。
- **Windows 诊断**：增加低频原生性能与系统状态日志，辅助排查 Windows 下长时间运行时的响应问题；日志不包含终端内容、命令行、窗口标题或凭据。
- **Linux 桌面图标**：启动后刷新桌面图标缓存，让应用图标更新更及时。

### 本版本包含的主要 PR 和问题修复

- [PR #326](https://github.com/St0ff3l/fileterm/pull/326)：刷新 Linux 桌面图标缓存。
- [PR #327](https://github.com/St0ff3l/fileterm/pull/327)：减少终端滚动重复工作并增加 Windows 原生健康日志。
- [PR #328](https://github.com/St0ff3l/fileterm/pull/328)：修复终端符号表格对齐、emoji 选区显示和尺寸刷新。

完整变更记录请查看 [v2.3.1-beta.5 与 v2.3.1-beta.6 的比较](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.5...v2.3.1-beta.6)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.6

This beta improves symbol table alignment, emoji selection, and resizing in Claude Code and other terminal TUIs, and reduces rendering overhead during continuous output.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Terminal symbols and emoji**: Keep common ambiguous symbols such as `✻` and `※` in one cell, fix table drift caused by fallback fonts, and preserve double-cell emoji when selecting across cells.
- **Terminal resizing and repainting**: Repaint immediately when the terminal pane or window changes size, then synchronize the terminal grid once the size settles, including while remote programs continue to produce output.
- **Terminal performance**: Coalesce repeated rendering, foreground adaptation, and scrollbar notifications during scrolling to reduce extra work under heavy output.
- **Windows diagnostics**: Add low-frequency native performance and system health logs to help investigate long-running responsiveness issues. The logs exclude terminal content, command lines, window titles, and credentials.
- **Linux desktop icons**: Refresh the desktop icon cache at startup so updated app icons appear sooner.

### Main PRs and issues

- [PR #326](https://github.com/St0ff3l/fileterm/pull/326): Refresh the Linux desktop icon cache.
- [PR #327](https://github.com/St0ff3l/fileterm/pull/327): Reduce repeated terminal scroll work and add native Windows health logs.
- [PR #328](https://github.com/St0ff3l/fileterm/pull/328): Fix terminal symbol table alignment, emoji selection, and resize repainting.

See the [comparison between v2.3.1-beta.5 and v2.3.1-beta.6](https://github.com/St0ff3l/fileterm/compare/v2.3.1-beta.5...v2.3.1-beta.6) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
