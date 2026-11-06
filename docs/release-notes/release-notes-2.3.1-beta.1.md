## FileTerm 2.3.1-beta.1

本测试版加入多级 SSH 跳板、串口稳定性改进、终端长输出优化和可选择的桌面图标。

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.3.1-beta.1 更新重点

- **SSH 多级跳板**：支持最多 8 层跳板，逐跳配置认证与主机密钥校验，并在连接失败或关闭时清理路由资源。
- **串口稳定性**：发送数据时继续接收；补齐设备打开超时、取消和延迟返回后的资源释放；连接列表可查看和搜索串口参数。
- **终端连续输出**：隔离慢窗口的显示队列，限制缓存与积压，并减少不必要的渲染和布局工作。
- **桌面图标选择**：Windows/Linux 托盘和 macOS Dock 可选择图标；Finder、Launchpad 与安装包保留经典银边图标。

### 本版本包含的主要 PR 和问题修复

- [PR #317](https://github.com/St0ff3l/fileterm/pull/317)：加入多级 SSH 跳板、串口与终端稳定性改进，以及桌面图标选择。

完整变更记录请查看 [v2.2.31 与 v2.3.1-beta.1 的比较](https://github.com/St0ff3l/fileterm/compare/v2.2.31...v2.3.1-beta.1)。

### 测试版验证范围

实体串口硬件、Windows/WSL 桌面手动回归和 Windows 11 12 小时长测尚未完成。请将此版本用于测试，并反馈设备、系统与复现步骤。macOS 退出应用后 Dock 图标保持所选样式，也需要在安装后的测试版本中确认。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.3.1-beta.1

This beta adds multi-hop SSH routing, serial-port stability improvements, smoother handling of sustained terminal output, and selectable desktop icons.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **Multi-hop SSH**: Connect through up to eight jump hosts, with per-hop authentication and host-key verification plus route cleanup on failure or shutdown.
- **Serial-port stability**: Continue receiving while sending; handle device-open timeouts, cancellation, and delayed resource cleanup; show and search serial settings in the connection list.
- **Sustained terminal output**: Isolate slow-window display queues, bound caches and backlogs, and avoid unnecessary rendering and layout work.
- **Desktop icon selection**: Choose tray icons on Windows/Linux and a Dock icon on macOS. Finder, Launchpad, and installation packages keep the classic silver-rim icon.

### Main PRs and issues

- [PR #317](https://github.com/St0ff3l/fileterm/pull/317): Add multi-hop SSH, serial and terminal stability improvements, and desktop icon selection.

See the [comparison between v2.2.31 and v2.3.1-beta.1](https://github.com/St0ff3l/fileterm/compare/v2.2.31...v2.3.1-beta.1) for the complete change set.

### Beta validation scope

Physical serial hardware, manual Windows/WSL desktop regression, and the 12-hour Windows 11 soak test are still pending. Please use this version for testing and include the device, operating system, and reproduction steps in feedback. The selected macOS Dock icon persisting after the app quits also needs confirmation on an installed beta build.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
