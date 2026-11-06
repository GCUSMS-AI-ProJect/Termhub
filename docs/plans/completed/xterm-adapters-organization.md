# xterm 适配目录整理

## 范围

- 保留已有 emoji 字宽改动，将 renderer 中的 xterm 专用实现归入 `xterm-adapters/`。
- 搜索私有 API、DOM 结构依赖、字体缓存、IME、回包和 WebView 兼容处理；按职责抽取，保持事件顺序、输入守卫和释放逻辑。
- 生命周期、会话状态、应用快捷键与 resize 编排继续由组件负责。
- 更新生产入口、单元测试和浏览器 fixture 路径；补充目录职责说明。

## 完成结果

- 原有 9 个 TypeScript 实现和排版 CSS 移入 `apps/tauri/src/renderer/xterm-adapters/`，保留当前未提交的 emoji 字宽实现。搬迁前后比对确认原适配器主体未变化，只有相对引用调整。
- 从其他文件抽出 IME/Shift 输入、查询回包过滤、Vim Visual 选区、字体栈脉冲、备用屏幕/标签激活渲染恢复、滚轮重定向、兼容选项和安全回放截断；不新增统一注册器或兼容 re-export。
- `terminal-lifecycle-core.ts` 从 338 行降到 293 行，`terminal-lifecycle-input.ts` 从 579 行降到 227 行，`terminal-view-utils.ts` 从 794 行降到 230 行。按职责拆分，新增源码最大 502 行，没有触发千行文件拆分豁免。
- 更新生产导入、单元测试、浏览器 fixture 和文档路径。跨组件字体观察保持共享，xterm 专用失效处理归入适配目录。
- 浏览器集成测试原来的“粘贴”模糊匹配同时命中两个菜单项，改为精确匹配带快捷键的目标菜单项，未修改生产菜单行为。

## 验证结果

- 全仓库 typecheck、lint、Prettier 和 `git diff --check` 通过。
- Renderer 104 项测试通过；覆盖新抽取的输入去重/IME、查询回包过滤、历史截断、字体校准、激活恢复和销毁边界。
- Rust 全量测试通过：757 项单元、10 项集成及 23 项 contract；clippy 全目标/全功能且 `-D warnings` 通过。初次运行遇到同时修改中的 Linux 图标失败，后续完整重跑已通过。
- CSS contract 通过，与基线一致保留原有 11 处 `!important` 警告。
- Chromium 和 WebKit 均通过字体加载、鼠标选区、框线、普通输出、主题前景，以及生产 React TerminalView 的粘贴/侧栏交互回归。每个引擎的交互回归包含 40 次真实 xterm 粘贴、360 次菜单打开期间的父组件更新和 40 次侧栏切换。

## 已有问题与未验证范围

- `terminal-symbol-proportions.mjs` 的 `⚠️•` 行级比例断言在两个引擎均失败。使用整理前保存的符号和 emoji 实现复跑，失败位置与像素尺寸完全相同：Chromium 原始 23×16、适配后 22×13；WebKit 原始 22×16、适配后 22×13。后续测量确认该断言本身不成立于多字素行：`⚠️` 在 2 格槽位内被缩放到 0.8406，而 `•` 不缩放，整行墨迹没有统一缩放因子。该行改由逐行“实际占用列宽 = Unicode 列宽”和逐字形等比缩放断言覆盖，同时把断言行数从 9 扩到 18；细节见 `docs/quality/terminal-symbol-tables.md`。
- 未做 macOS/Windows/Linux 原生 WebView 手测；浏览器回归不能视为对应原生平台通过。
- xterm 私有 API 和 DOM 结构依赖集中后仍需在升级 xterm 时复核。
