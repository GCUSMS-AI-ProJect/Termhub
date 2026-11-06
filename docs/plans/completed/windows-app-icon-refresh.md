# Windows 应用图标刷新

## 目标与根因

- 更新后默认图标为经典银边，设置切换时同步窗口、任务栏、Alt+Tab 和托盘。
- 原有 `icon.ico` 仍为旧版无银边图标。
- 当前 Tauri runtime 的 `set_icon()` 仅调用 Tao `set_window_icon()`，Windows 上只发送 `WM_SETICON / ICON_SMALL`，未更新 `ICON_BIG`。

## 实现

- Windows 原生适配放在 `src/app_icon/windows.rs`；在主线程同时设置大小图标，启动恢复、设置切换与新建子窗口复用此入口。
- 使用现有 Windows 256px RGBA 变体资源。三个原生图标句柄由主线程缓存持有，避免切换后句柄提前销毁或每次切换泄漏资源。
- 从经典银边源图生成 `icons/app/windows/classic.ico`，包含 16、20、24、32、40、48、64、128、256px 图层；当前经典、Material、Clean 三种 ICO 都按平台归档在 `icons/app/windows/`。
- 静态安装图标保持经典银边；设置切换作用于运行时窗口和托盘。

## 验证结果

- Windows 原生隐藏窗口测试通过：实际发送并读取 `WM_SETICON / WM_GETICON`，覆盖三个变体及恢复经典银边。
- 打包 ICO 最大图层与经典银边运行时位图像素一致性检查通过。
- 类型检查、94 项 Renderer 测试、726 项 Rust/contract 测试、Rust 格式与 diff 空白检查通过。
- 标准 Lint 和 Prettier 被当前工作区现有 CRLF 换行阻断；分别用 `prettier/prettier` 的 `endOfLine: auto` 和 Prettier `--end-of-line auto` 复查后全部通过，未批量改动无关文件。
- 严格 Clippy 被六处既有问题阻断：四处测试未使用导入，以及 `commands/platform_commands.rs:190` 的 `byte_char_slices`、`storage/paths.rs:81` 的 `needless_return`；本次图标代码无诊断。
- 尚未通过安装包升级并人工确认 Explorer 缓存、固定任务栏快捷方式、高 DPI 和完整设置页操作；macOS/Linux 未实机回归。本次未替换用户已安装应用，也未发布版本。
