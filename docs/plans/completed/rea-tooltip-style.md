# REA 聊天栏提示适配

- 将 REA 开关与“分析目标与运行环境”的系统 title 改为主题浮层。
- 复用公共 Tooltip，保留现有 SVG、按钮尺寸与开关逻辑。
- 验证悬停、焦点、Esc、点击、窄窗口、四种主题与减少动态效果。
- 完成项目门禁、编译 Windows 软件并更新桌面快捷方式，保留正在运行的用户会话。

已完成实现与当前源码原生桌面验收：四种主题、320px 聊天栏、悬停与焦点、Esc、点击展开详情、减少动态效果与 REA 开关状态均通过。156 项 renderer 与 849 项 Rust/协议测试及所有项目门禁通过。交付路径为 `release/transterm-2026-10-21-tooltip/transterm.exe`，NSIS 安装包与桌面入口同步更新，保留用户现有运行窗口。详见 [验收记录](../../quality/rea-tooltip-validation.md)。

## REA 详情遮挡修复

REA 详情原来位于聊天栏内部，向左展开时会被祖先的 overflow/container 裁切。现在通过 portal 渲染到 document.body，以固定定位避开侧栏裁切，并在打开、窗口变化、滚动和内容尺寸变化时调整到可视区域内。限制弹层尺寸，保留内部滚动、语义主题颜色、外部点击关闭和 Esc 焦点恢复。

新增 `apps/tauri/tests/browser/rea-popover.mjs`，用真实组件与带有 overflow、contain 和 transform 的裁切容器验证四种主题、两种窗口高度、内容展开、窗口缩放、编辑、分析回调、Esc 焦点恢复与外部点击。脚本接受 `ESBUILD_MODULE_PATH`、`PLAYWRIGHT_MODULE_PATH`、`PLAYWRIGHT_CHANNEL` 和可选 `REA_SCREENSHOT_PATH`；使用拦截的 localhost 页面提供安全上下文，不需要运行服务器。

8 组浏览器场景和 198 项 renderer 测试通过，类型、lint、格式和 CSS contract 通过。CSS 检查保留原有债务提示，无新增主题颜色。本次没有原生桌面窗口操作工具，浏览器组件测试不代表原生窗口验收。Windows 成品入口为 `release/TermHub-SSHImagePaste/TermHub-ReaFix.exe`，保留之前的图片粘贴与主题修复。
