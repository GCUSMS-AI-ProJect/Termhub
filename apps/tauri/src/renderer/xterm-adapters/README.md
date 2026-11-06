# xterm 适配与扩展

这里集中维护 transterm 对 xterm 6 的渲染、输入和缓冲区适配。使用私有字段或依赖 xterm DOM 的实现应放在这里，升级 xterm 时一起复核。

| 文件                                                          | 职责                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `terminal-emoji-widths.ts`                                    | emoji、VS16、键帽、旗帜、肤色和 ZWJ 组合列宽                                   |
| `terminal-symbol-glyph-renderer.ts`                           | 按 buffer 列宽固定符号显示槽；越界笔画等比收进单元格，保持跨格选中时的笔画完整 |
| `terminal-block-glyph-renderer.ts`、`box-drawing.ts`          | 按网格自绘块字符和框线                                                         |
| `terminal-selection-renderer.ts`                              | 防止选中装饰背景遮挡相邻字形                                                   |
| `terminal-foreground-adapter.ts`                              | 普通白色文字随默认背景采用主题前景色                                           |
| `terminal-render-cache.ts`、`terminal-shared-glyph-widths.ts` | 缓存上限、相同字体环境间共享测量和失效处理                                     |
| `terminal-log-colorizer.ts`                                   | 日志着色规则、xterm buffer 单元颜色修改及还原                                  |
| `terminal-input-compat.ts`                                    | IME 组合事务、Shift 数字键、原生 input/keydown 与 xterm onData 去重            |
| `terminal-transcript-replay.ts`                               | 避免历史截断后从半段控制序列开始回放                                           |
| `terminal-responses.ts`                                       | 终端查询回包识别及历史回放的合成回包过滤                                       |
| `terminal-vim-selection.ts`                                   | Vim 接管鼠标后，从 buffer 恢复 Visual 选区用于复制                             |
| `terminal-render-recovery.ts`                                 | 字体/DPI 缓存校准、普通/备用屏幕切换重绘和标签激活渲染恢复                     |
| `terminal-wheel-compat.ts`                                    | 将 WebView 重定向到 document 的滚轮事件交还 xterm                              |
| `terminal-options.ts`                                         | TUI、ConPTY、本地选择等兼容选项                                                |
| `xterm-compat.css`                                            | 禁用影响 DOM renderer 单元格测量的中文标点间距                                 |

`components/terminal-lifecycle-core.ts` 负责接入和销毁渲染适配：Unicode11 和 emoji 列宽在 `terminal.open()` 前安装，DOM 适配在其后安装；选区、符号、块字形的注册顺序保持不变。

输入适配由 `terminal-lifecycle-input.ts` 接入，兼容处理先于应用快捷键。应用层继续决定连接/活动状态、串口独占、快捷键、会话输入队列和 PTY resize；不要绕过这些守卫直接向后端发送输入。滚轮目标判定和缩放归属也留在应用层，适配只转发已经确认属于终端的事件。

跨组件的字体加载/DPI 观察仍在 `app/font-metrics.ts`，Monaco 与 xterm 共用；仅 xterm 需要的字体栈脉冲和 atlas 重建在本目录。标签激活重试和隐藏窗口尺寸恢复的调度、主题/字号后的 PTY 尺寸同步，以及 transcript 回放时机仍由组件编排。

`styles/features/session.css` 和各主题 skin 继续维护终端布局、选区颜色与自定义滚动条的样式契约；与字形测量有关的排版修正在本目录的 `xterm-compat.css`。

单元测试在 `apps/tauri/tests/terminal-*.test.mjs`；真实 xterm 的字体、字宽、符号、框线和鼠标选区回归在 `apps/tauri/tests/browser/terminal-*.mjs`。这些 fixture 直接加载生产模块，移动文件时须同步路径。
