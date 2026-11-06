# 终端线框接缝修复

## 问题与方案

2.2.29 只把 `─ / ━ / ═` 接入字符格位图，竖线、拐角与交叉点仍用字体。
混合绘制造成表格笔画位置、粗细和接缝不一致；字体回退与缩放会放大差异。

参考 Ghostty 的四方向线型与字符格光栅化、iTerm2 的字符格路径与像素对齐原则，
在现有逐行 canvas 上独立实现 U+2500–U+257F 的几何绘制，包含轻/粗/双线、
混合连接、虚线、圆角和斜线。普通符号继续通过字体适配，保留块字符、ANSI、
选区、主题和 CJK/组合字符的 buffer 列宽。

- [Ghostty box.zig](https://github.com/ghostty-org/ghostty/blob/main/src/font/sprite/draw/box.zig)
- [iTerm2 box drawing factory](https://github.com/gnachman/iTerm2/blob/master/sources/Drawing/iTermBoxDrawingBezierCurveFactory.m)

## 验证

- 几何测试：字符区覆盖、轻粗线边缘、双线拐角/交叉点的留白、虚线、半线。
- 浏览器像素回归：真实 xterm、JetBrains Mono/Cascadia、不同字号与 DPI，
  表格连续性、ANSI/反显、选区、滚动/备用缓冲区、缩放及销毁。
- 重跑横线、符号遮挡、鼠标选区与持续重绘回归；项目质量门禁。
- Windows 10/11 原生 WebView2、macOS 与 Linux 的验证状态需分别记录。

## 结果

2026-10-13 完成实现：线框区统一使用逐行字符格 canvas；几何模块独立存放，
直线使用整数像素矩形的并集，透明笔画只填充一次，圆角/斜线按格裁剪。
双线连接保留独立通道；几何缓存最多 1024 项，沿用逐行 canvas 复用和批量 DOM 更新。
非整数 DPI 下线宽至少一 CSS 像素再按设备像素取整，防止小字号细线过细。

- Edge/Chromium：JetBrains Mono 与 Cascadia、12/13/14/24px、1/1.25/1.5/2 DPR，
  共 32 组表格/字形目录/生命周期组合通过；横线、符号遮挡、鼠标拖选回归通过。
- 60 秒真实 xterm 重绘：1570 次写入全部排空，空闲刷新为 0，最大 10 个 canvas、
  3046 个 DOM 节点；时间统计只作诊断，不代表真实端到端延迟。
- Windows 11 26300、WebView2 154.0.4258.62：通过 Computer Use 操作从本仓库
  `npm run dev` 启动的开发版。以进程路径、`tauri.dev.conf.json`、5188 Vite 与
  `com.fileterm.desktop.dev` WebView 数据目录核对身份。实际本地 ConPTY 输出中文表格、
  单/双/粗线、圆角、ANSI 蓝底/反显、块与普通符号，检查鼠标拖选、默认字号/字号变化、
  最大化与还原。测试程序已结束，保留输出供查看。
- 全仓库类型检查、56 项 renderer 测试、666 项 Rust 单元、10 项 CLI、23 项 contract
  测试通过。本次文件 ESLint/Prettier 与 CSS contract 通过。
- 全仓库 lint/Prettier 分别受既有 CRLF 错误（67671 项）与 383 个文件格式问题阻挡。
  Clippy 受 4 个既有 Windows 测试 unused import，以及 `platform_commands.rs` 的
  `byte_char_slices`、`storage/paths.rs` 的 `needless_return` 阻挡，未改动这些 Rust 文件。
- Windows 10、macOS、Linux 原生验证未运行；本机无 WebKit 测试引擎。

原生复现样本保存为 `apps/tauri/tests/fixtures/terminal-box-drawing.mjs`，浏览器加载器跟随
本地 TS 模块依赖。临时诊断代码已移除，不对普通会话记录终端内容。
