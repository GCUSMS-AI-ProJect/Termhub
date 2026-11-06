## FileTerm 2.2.30

FileTerm 2.2.30 improves SSH startup compatibility with slow and memory-constrained hosts.

**安装指南**

[![简体中文安装指南](https://img.shields.io/badge/%E4%B8%AD%E6%96%87-%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/zh-CN.md)

### 2.2.30 更新重点

- **SSH 启动兼容性**：SSH shell 启动沿用连接配置中的有界超时，让响应较慢的主机有足够时间完成终端启动。
- **低占用 SSH 模式**：在连接常规设置中为单个 SSH 连接关闭资源监控、后台命令通道和 SFTP，并将连接超时至少设为 60 秒；手动启用这些功能或缩短超时后，模式会自动退出。

### 本版本包含的主要 PR 和问题修复

- [PR #310](https://github.com/St0ff3l/fileterm/pull/310)：兼容响应缓慢或内存较小的 SSH 主机，并加入按连接启用的低占用模式。

完整变更记录请查看 [v2.2.29 与 v2.2.30 的比较](https://github.com/St0ff3l/fileterm/compare/v2.2.29...v2.2.30)。

### 反馈与支持

> &bull;&nbsp;遇到问题请前往 [GitHub Issues](https://github.com/St0ff3l/fileterm/issues) 提交反馈，并附上操作系统、FileTerm 版本、连接类型、复现步骤和脱敏日志；不要提交密码、私钥或 token。
> &bull;&nbsp;也可以加入微信群交流：请打开仓库 [README 的“社区交流”部分](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81) 扫描二维码进微信群，也可加入 QQ 群 534418986。

---

## FileTerm 2.2.30

FileTerm 2.2.30 improves SSH startup compatibility with slow and memory-constrained hosts.

**Installation guides**

[![English Installation Guide](https://img.shields.io/badge/English-Installation_Guide-0969DA?style=for-the-badge&labelColor=555)](https://github.com/St0ff3l/fileterm/blob/main/docs/installation/en-US.md)

### Highlights

- **SSH startup compatibility**: SSH shell startup now uses the bounded timeout configured for the connection, giving slower hosts time to bring up the terminal.
- **Low-resource SSH mode**: In a connection's General settings, disable resource monitoring, the background command channel, and SFTP for that SSH connection, and set its connection timeout to at least 60 seconds. Manually enabling one of these features or shortening the timeout automatically exits the mode.

### Main PRs and issues

- [PR #310](https://github.com/St0ff3l/fileterm/pull/310): Improve compatibility with slow or memory-constrained SSH hosts and add a per-connection low-resource mode.

See the [comparison between v2.2.29 and v2.2.30](https://github.com/St0ff3l/fileterm/compare/v2.2.29...v2.2.30) for the complete change set.

### Feedback & Support

> &bull;&nbsp;For problems, open a [GitHub Issue](https://github.com/St0ff3l/fileterm/issues) with the operating system, FileTerm version, connection type, reproduction steps, and redacted logs. Do not submit passwords, private keys, or tokens.
> &bull;&nbsp;Join the community through the [README community section](https://github.com/St0ff3l/fileterm#%E7%A4%BE%E5%8C%BA%E4%BA%A4%E6%B5%81).
