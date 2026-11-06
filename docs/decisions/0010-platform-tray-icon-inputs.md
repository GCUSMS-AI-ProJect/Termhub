# ADR-0010: 平台托盘图标使用专用的 8-bit 位图输入

## 状态

Accepted（2026-09-19）

## 背景

transterm 的 tray 在 macOS、Windows 和 Linux 上由不同的原生后端渲染。macOS 需要独立的单色 Template 图标；Windows 和 Linux tray 使用专用的 32×32、8-bit RGBA PNG。Windows 桌面快捷方式仍使用包含多尺寸图层的 ICO，窗口分别使用 32px 和 256px 图像。

Tauri 会把 Linux bundle 配置中第一张 PNG 嵌入为原始像素缓冲。若 PNG 是 16-bit RGBA，32×32 图会携带 8192 字节，而 tray 后端只接受 4096 字节的 32bpp 数据。将 `default_window_icon()` 直接交给 Linux tray 会使应用在 setup hook 中失败，影响所有 Linux 安装包，包括 `.AppImage`、`.deb`、`.rpm` 和 Pacman 包。

## 决策

1. macOS tray 继续使用独立的 `tray/macos/template@2x.png`，并以 template 模式渲染。
2. Windows tray 使用 `tray/windows/*-32.png`，Linux tray 使用 `tray/linux/*-32.png`。两者必须是满版 8-bit RGBA PNG，不复用大尺寸 app icon 或 Tauri 自动生成的 `default_window_icon()`。
3. Windows 快捷方式 ICO 包含 16、20、24、32、40、48、64、128、256px 图层；运行窗口分别使用 32px 小图标与 256px 大图标。Windows/Linux 的应用图标资源从 `dock-*.png` 去除 macOS 安全边距后生成；Linux 包内图标及窗口/启动器图标必须保持 8-bit RGBA 与满版构图。
4. Linux bundle 使用的 `app/linux/32x32.png`、`app/linux/128x128.png` 与 `app/linux/128x128@2x.png` 必须为 8-bit RGBA，且不带 macOS Dock 透明安全边距。保留 `128x128@2x.png` 文件名，让 Tauri 将 256px 图输出到 `hicolor/256x256@2`。运行 `apps/tauri/scripts/generate-platform-app-icons.py` 生成 Windows/Linux 图标；该脚本不得修改 Dock 图或 `app/macos/icon.icns`。
5. Rust 回归测试检查 PNG 的 IHDR 位深、RGBA 颜色类型、原生尺寸和透明边界，防止后续资产更新重新引入缩小图案或 16-bit 图像。

## 影响

### 正面影响

- Linux tray 初始化拥有确定的 32bpp 输入，各 Linux 安装包不再因位图字节数不匹配而在启动阶段崩溃。
- 平台图标职责清晰：macOS template、Windows 多尺寸 ICO 与 32px tray PNG、Linux 满版 8-bit RGBA 位图不会相互复用。
- 资产编码错误能够在常规 Rust 测试中被发现，不依赖桌面环境复现。

### 限制与非目标

- 此决策不改变 Linux 桌面是否显示 tray 的桌面环境策略，也不处理 GTK 主题自身的 CSS warning。
- 这不是 UI 图标规范；renderer 内图标仍遵循 `apps/tauri/src/renderer/assets/icons/` 的本地 SVG 分类规则。

## 实现位置

- `apps/tauri/src-tauri/src/lib/runtime.rs`：按平台选择 tray 图标。
- `apps/tauri/src-tauri/icons/tray/{linux,windows}/*-32.png`：平台 tray 的显式 8-bit RGBA 输入。
- `apps/tauri/src-tauri/icons/app/shared/`：Windows/Linux 共用的满版变体 PNG，也供设置预览使用。
- `apps/tauri/src-tauri/icons/app/windows/`：Windows 动态多尺寸 ICO。
- `apps/tauri/src-tauri/icons/app/{linux,macos}/`：Linux bundle 图标与 macOS ICNS。
- `apps/tauri/src-tauri/icons/tray/macos/`：macOS template tray 资源。
- `apps/tauri/scripts/generate-platform-app-icons.py`：从 Dock 原图生成 Windows/Linux 图标及 Linux bundle 图标。
- `apps/tauri/src-tauri/src/lib/tests.rs`：Linux bundle 图标格式回归测试。
