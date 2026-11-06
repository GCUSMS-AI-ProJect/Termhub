## FileTerm 2.2.31

FileTerm 2.2.31 adds remote directory-tree navigation and per-connection file-pane defaults, with refinements to themes, update settings, and terminal rendering.

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.2.31 更新重点

- **远程目录树**：文件区可在本地文件和远程目录树之间切换；目录树按需加载，并可按连接保存默认显示模式。新建连接默认显示本地文件。
- **主题与设置**：统一内置和第三方主题的选中状态与界面颜色；连接默认值和更新通道选项更清晰。更新通道区分稳定版与最新版本（含 Alpha、Beta、RC 预览版），默认选择最新版本。
- **终端与 Copilot**：线框字符根据终端单元格几何绘制，在不同字体和缩放下保持连接与对齐；Copilot 面板展开时窗口控件保持在右侧。
- **依赖安全更新**：更新 `quinn-proto` 和 `rustls`，修复 RustSec 审计报告的安全公告。

### 本版本包含的主要 PR 和问题修复

- [PR #311](https://github.com/St0ff3l/fileterm/pull/311)：修复 AI Copilot 展开时窗口控件偏移。
- [PR #312](https://github.com/St0ff3l/fileterm/pull/312)：改进终端线框字符绘制并更新 `quinn-proto`。
- [PR #315](https://github.com/St0ff3l/fileterm/pull/315)：加入远程目录树与按连接保存文件区模式，改进主题、设置和更新通道。

完整变更记录请查看 [v2.2.30 与 v2.2.31 的比较](https://github.com/St0ff3l/fileterm/compare/v2.2.30...v2.2.31)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.2.31

FileTerm 2.2.31 adds remote directory-tree navigation and per-connection file-pane defaults, with refinements to themes, update settings, and terminal rendering.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Remote directory tree**: Switch the file pane between local files and a remote directory tree. The tree loads directories on demand, and each connection can save its default view. New connections default to local files.
- **Themes and settings**: Align selected states and interface colors across built-in and third-party themes, and clarify connection defaults and update-channel choices. Update channels distinguish stable releases from the latest version, including Alpha, Beta, and RC previews; the latest version is selected by default.
- **Terminal and Copilot**: Draw box-drawing characters from terminal-cell geometry for consistent joins and alignment across fonts and display scales. Keep window controls at the right edge when the Copilot panel opens.
- **Dependency security updates**: Update `quinn-proto` and `rustls` to address advisories reported by the RustSec audit.

### Main PRs and issues

- [PR #311](https://github.com/St0ff3l/fileterm/pull/311): Fix window controls shifting when AI Copilot is open.
- [PR #312](https://github.com/St0ff3l/fileterm/pull/312): Improve terminal box-drawing and update `quinn-proto`.
- [PR #315](https://github.com/St0ff3l/fileterm/pull/315): Add remote directory-tree navigation and per-connection file-pane modes, and refine themes, settings, and update channels.

See the [comparison between v2.2.30 and v2.2.31](https://github.com/St0ff3l/fileterm/compare/v2.2.30...v2.2.31) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
