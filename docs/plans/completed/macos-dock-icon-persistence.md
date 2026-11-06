# macOS Dock 图标退出后保留

## 目标

- 应用退出后，固定在 Dock 的图标保留所选变体。
- Finder、Launchpad 与安装包继续使用经典银边静态图标。
- 验证现有 ad hoc 签名能否加载 Dock 插件。

## 根因与实现

- 系统崩溃报告显示 `setDockTile:` 反复调用自身直至栈溢出。将同名 property setter 赋值改为 backing ivar 赋值。
- Dock helper 的标准偏好附加 suite 后未持续收到其他进程的选择变化。改用独立的 `NSUserDefaults` suite 实例，保留 KVO 更新。
- 恢复插件打包与偏好写入；保留之前修复的经典银边静态图标产物。
- CI 增加插件加载、绘制、重复挂载和卸载的原生回归检查，以及静态图标产物一致性检查。

## 验证

- macOS 27.0.1：临时 App 与插件均使用 ad hoc 签名，固定到 Dock 后成功加载；主进程退出后插件继续显示所选变体，并响应跨进程偏好变化。
- 临时 Dock 项与测试偏好已移除，并核对原有 Dock 排列一致。
- 类型、Lint、格式、94 项 Renderer 测试、778 项 Rust 测试、Clippy 和完整 macOS 打包通过。
- DMG 中插件与经典银边静态图标与构建产物一致；完整 App 的临时副本使用 ad hoc 签名后通过严格签名校验。
- 初次 Rust 测试和打包因磁盘空间不足中断；清理本项目可再生成的 debug 构建产物后重跑通过。
- 本次不发布新版，也不替换已安装的应用。
