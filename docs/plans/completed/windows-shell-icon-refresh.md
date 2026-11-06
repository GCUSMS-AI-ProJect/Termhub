# Windows Shell 图标刷新

状态：已完成并准备提 PR。

## 目标

修复更新安装后桌面/任务栏快捷方式仍显示旧图标，以及 Windows 设置中的应用图标选择只更新托盘和 Alt+Tab、未更新 Shell 快捷方式的问题。

## 排查结论

- `WM_SETICON` 已更新 Alt+Tab 使用的窗口图标，但 Explorer 桌面与固定任务栏快捷方式继续使用 `.lnk` 缓存的图标。
- 仅对可执行文件发送 Shell 更新通知无法可靠地让快捷方式改用新资源；快捷方式需要指向一个新的图标资源路径。
- 设置选择是用户级偏好，因此只更新当前用户桌面、开始菜单和任务栏固定目录中的、目标为当前 FileTerm 可执行文件的链接。

## 实现与验证

- 运行时同时更新窗口句柄和窗口类图标。
- 为所选变体写入带应用版本和内容摘要的 ICO 文件，更新受管理的 FileTerm 快捷方式图标位置，并通知 Shell。
- 在启动恢复和设置切换时刷新快捷方式；保留目标、参数及用户指定的非 FileTerm 图标。
- 验证 Rust Windows 编译/测试、项目门禁，并检查实际 ShellLink 更新与图标资源格式。

验证结果：Windows 定向 Rust 测试、完整 `npm run test:tauri`（700 个单元测试、10 个 CLI 测试、23 个 contract 测试）、`npm run test:renderer -w @fileterm/tauri`（95 个测试）、`npm run typecheck`、`cargo fmt --check`、改动文件的 Prettier/ESLint 检查均通过。完整 `npm run lint` 与仓库范围 Prettier 检查受现有全仓 CRLF 格式差异影响；完整 Clippy 受 6 个既有告警影响，忽略这些告警后 Clippy 通过。本次未运行或等待 CI。
