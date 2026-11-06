## FileTerm 2.2.31-beta.1

FileTerm 2.2.31-beta.1 is a test release for improved terminal box-drawing across fonts and display scales, with a fix for AI Copilot window controls.

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.2.31-beta.1 更新重点

- **终端线框字符**：按终端单元格几何绘制线框字符，改善不同字体和显示缩放下的连接与对齐。
- **AI Copilot 窗口控件**：展开或调整 Copilot 面板时，最小化、最大化和关闭按钮保持在窗口最右侧。
- **依赖安全更新**：更新 `quinn-proto`，修复 RustSec 审计报告的安全公告。

### 本版本包含的主要 PR 和问题修复

- [PR #311](https://github.com/St0ff3l/fileterm/pull/311)：修复 AI Copilot 展开时窗口控件偏移。
- [PR #312](https://github.com/St0ff3l/fileterm/pull/312)：改进终端线框字符绘制并更新 `quinn-proto`。

完整变更记录请查看 [v2.2.30 与 v2.2.31-beta.1 的比较](https://github.com/St0ff3l/fileterm/compare/v2.2.30...v2.2.31-beta.1)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.2.31-beta.1

FileTerm 2.2.31-beta.1 is a test release for improved terminal box-drawing across fonts and display scales, with a fix for AI Copilot window controls.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Terminal box-drawing**: Draw box-drawing characters from terminal-cell geometry for better joins and alignment across fonts and display scales.
- **AI Copilot window controls**: Keep the minimize, maximize, and close buttons at the far right of the window when the Copilot panel opens or resizes.
- **Dependency security update**: Update `quinn-proto` to address advisories reported by the RustSec audit.

### Main PRs and issues

- [PR #311](https://github.com/St0ff3l/fileterm/pull/311): Fix window controls shifting when AI Copilot is open.
- [PR #312](https://github.com/St0ff3l/fileterm/pull/312): Improve terminal box-drawing and update `quinn-proto`.

See the [comparison between v2.2.30 and v2.2.31-beta.1](https://github.com/St0ff3l/fileterm/compare/v2.2.30...v2.2.31-beta.1) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
