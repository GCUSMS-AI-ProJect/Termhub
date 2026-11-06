# AI 模型菜单遮挡修复

## 原因与改动

当前项目的 Windows 开发版中复现：模型选项有模型名、服务商两行内容，旧工具栏规则将每项限制为 25px，造成文本重叠与裁切。通用菜单的 1200 层级还被后加载的 `.context-menu` 规则覆盖为 110。

- 模型菜单按内容自动增高，最小 48px；长模型名和服务商可换行，勾选标记不收缩。
- 公共菜单使用明确的组合选择器，避免旧菜单样式覆盖层级、滚动和最大高度；选项不参与 flex 收缩。
- 请求的上下展开方向在空间不足时可回退到另一侧。高度限制在可用空间，窗口缩放、滚动和菜单尺寸变化时重新定位。
- 仍使用 body Portal 和语义主题颜色，保留模型/服务商切换、原生 macOS 选择器及现有审批流程。

## 桌面验证

精确绑定 `apps/tauri/src-tauri/target/debug/transterm.exe`，核对当前仓库 Vite 5188 服务、进程树拥有的 CDP 9241 端口及当前页面。使用独立 debug portable 配置，没有操作用户安装版。

在当前 React 模型选择器中注入 25 个测试选项（含极长模型名/服务商，不发起模型请求），验证以下 12 个组合：

| 主题                | 侧栏宽度 / 界面缩放                      |
| ------------------- | ---------------------------------------- |
| Codex 深色 / 浅色   | 320px / 100%、420px / 100%、320px / 125% |
| TermHub 深色 / 浅色 | 320px / 100%、420px / 100%、320px / 125% |

全部组合中，选项内容不裁切、无行间重叠，菜单保持视口内、列表可滚动、可命中点击。修复后层级为 1200；测试数据下普通行约 57px，极长模型名自动增高。截图对比保存于本机 `.npm-cache/native-build/model-menu-{before,after}-<theme>.png`，几何数据保存为 `model-menu-{before,after}.json`。

额外验证：End 移到最后一项并滚动到可见区域；Enter 成功切换模型并关闭菜单；Esc 关闭并恢复触发器焦点；顶部空间不足时向下展开。夹具清理后恢复原主题与缩放，停止本次启动的开发进程。

补充小窗口回归：窗口高度缩至 300px 时菜单限制为 146px；刷新选项后恢复原窗口，菜单恢复为 280px，避免把上一次临时视口限制当作样式上限。修正后重新通过上述 12 组合和键盘检查。四主题裁剪对比图位于 `release/TermHub-model-menu-themes.png`。

未原生验证 macOS/Linux、自定义主题及真实用户的 Provider/SSH；此次没有修改模型请求或执行后端。

## 项目门禁和交付

类型、lint、Prettier、182 项 renderer、918 项 Rust/contract（2 项既有忽略）、Clippy 和 CSS contract 通过。CSS 检查仍报告原有 11 个 `!important` 与约 6 处旧颜色债务，本次未增加。

Windows 主程序和 NSIS 安装包已构建，成品 CLI/MCP 初始化通过，桌面快捷方式已更新。检测到用户正在使用 `release/TermHub-Optimized/TermHub.exe`，因此新版放入 `release/TermHub-ModelMenu/`，保留当前用户进程与会话。用户退出旧版后从桌面重新打开才能使用修复。

- 新程序：`release/TermHub-ModelMenu/TermHub.exe`，68,242,944 字节，SHA-256 `cf7b704452e7e26c2eb04f2069eb5f621351fae50302ee58ad8543c1071b486e`。
- 安装包：`release/TermHub_2.3.1-beta.10_x64-setup.exe`，67,084,947 字节，SHA-256 `011459738ec0e1310fab42ecab232a87a26184cd68203aa2ba6ae38225cfcc7a`。
