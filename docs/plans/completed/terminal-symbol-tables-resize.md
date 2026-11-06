# 终端符号表格、选区与尺寸刷新

## 范围

- 用预排版表格验证 CC 常用的 `✻`、`※`、歧义符号和 emoji 组合；保持普通符号原有单列宽度，不按字体笔画强制扩为双列。
- 复现缩小字体、选中和取消选择后的表格列位置与可见字形变化，并在适配层修复。
- 检查终端区域及窗口尺寸变化：拖拽过程重绘，停止后同步 xterm 与 PTY 网格；保留普通 shell 输入行的重排保护。
- 更新单元/浏览器回归并运行项目门禁；浏览器结果与原生 Windows 11 验证分开记录。

## 完成结果

- `terminal-symbol-glyph-renderer.ts` 的显示槽改为严格等于 buffer 列宽：fallback 字体的实际 advance 与 xterm 重复字形测量不同，原先会推偏同一行后续的表格线。`✻`、`※`、`•`、`○`、`■`、`§`、`±`、`×` 继续占单列，`✅`、`❌`、`🚀` 等继续占双列；只有真正越界的笔画才先平移、再等比缩进单元格。
- 双列 emoji 的笔画提升到选区背景之上。此前从延续格开始的选区会盖住字形右半边，看起来像“选中后字形变了”，实际列数与表格位置没有变化。
- 尺寸变化改为像素级刷新：`syncTerminalSize` 在列数冻结期间也刷新显示行，覆盖拖动终端区域宽度、拖动窗口和缩放窗口；`ResizeObserver` 在宽度变化时立即重绘，稳定 140ms 后用真实宽度同步一次 `cols`。
- 移除 resize 对输出安静和 shell 提示符的依赖（`lastTerminalOutputAtRef`、`awaitingCommandCompletionRef`、`pendingPromptResizeRef`）：持续输出的 TUI 之前可能永远等不到同步时机，新尺寸一直发不出去。
- 浏览器回归新增 `terminal-symbol-tables.mjs`（预排版表格三层断言：buffer 表格线精确列、屏幕坐标与 ASCII 对照、全选复制文本逐字节一致）、`terminal-resize-repaint.mjs`；`terminal-symbol-proportions.mjs` 断言行数从 9 扩到 18。
- 结果记录在 `docs/quality/terminal-symbol-tables.md`，其中浏览器自动化结果与原生 WebView 待办分开列出。

## 验证结果

- 全仓库 typecheck、lint、Prettier、`git diff --check` 通过。
- Renderer 105 项测试通过，含“像素变化刷新冻结列且不发送不匹配的 PTY 尺寸”一项。
- Rust 全量测试通过：756 项单元、10 项 CLI 及 23 项 contract；clippy 全目标/全功能且 `-D warnings` 通过。
- Chromium 与 Playwright WebKit 两个引擎各跑 8 个脚本，共 16 次全部通过：符号表格、尺寸刷新、符号比例、符号字形、选区字形、字体加载、普通输出和持续重绘负载。
- 首次 Rust 测试因增量编译缓存占满磁盘、链接 `libfileterm_lib.a` 时 `No space left on device` 失败；删除可重新生成的 `target/debug/incremental` 后完整重跑通过，未修改任何源码。

## 已有问题与未验证范围

- 未做 macOS/Windows/Linux 原生 WebView 手测，浏览器回归不能视为原生平台通过。Windows 11 自带终端对同类表格也存在对齐问题，需用实际 Claude Code 输出在 WebView2 上复核缩放、拖动与全选后的对齐。
- `terminal-symbol-proportions.mjs` 的行级“整体墨迹等比”断言只对单一字素成立；多字素行改由逐行列宽与逐字形等比断言覆盖，理由与实测数据见 `docs/quality/terminal-symbol-tables.md`。
- emoji 组合、旗帜和键帽的列宽仍依赖 `terminal-emoji-widths.ts` 对 Unicode 11 字宽表的修正；xterm 升级时需要连同私有 API 一起复核。
