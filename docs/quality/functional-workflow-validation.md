# TermHub 功能流程优化验证

本轮完成用户确认的功能优化，保持既有 Tauri、SSH/SFTP/FTP、传输队列、REA 手动开关和三类 Provider 协议。验证日期：2026-10-22，Windows x64。

## 功能与兼容

- AI：按工具边界保存检查点，停止/失败后继续，已执行或结果不明的修改不会自动重放。本地执行绑定实际 shell 和 CWD；危险命令限制、审批、取消进程树保留。普通本地/SSH 命令最多运行 30 分钟，交互式认证及网络设备沿用原路径。
- 会话：逐会话草稿与附件引用恢复、正文搜索、工作空间过滤、编辑重发和分支。分支清除旧终端授权与任务状态；恢复草稿期间锁定输入/发送。长对话使用本地摘录和保守预算，原始消息保留。
- 文件：AI 文件修改逐文件显示差异并审批；保存和撤销检查目标/版本，制作有上限的恢复副本。编辑器冲突保留草稿，撤销期间锁定编辑。严格编解码拒绝无效序列及不可表示字符，覆盖 UTF-8、UTF-16 BOM/换行回归；FTP 文件编解码与终端编解码保持分离。
- 同步：按大小/时间比较，忽略模式和选择列表使用服务端保存的预览；预览后源/目标变化拒绝执行。同步专用 manifest 绑定主机、本地根与路径祖先，排除符号链接/junction。旧 manifest 缺省字段保持原行为。
- Provider/REA：回答、流式、工具及图片分项检测，只在点击时发起测试；REA 显示准备阶段与引擎检查，不自动安装 Ghidra/IDA。

## 自动检查

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npx prettier --check apps/tauri packages/core packages/shared packages/storage`：通过。
- `npm run test:renderer -w @transterm/tauri`：182 项通过。
- `npm run test:tauri`：908 项通过，2 项已有忽略；包含 872 项单元及 36 项 contract/集成检查。
- `cargo clippy --manifest-path apps/tauri/src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings`：通过。最后的远程文件大小预检查也经过此次编译检查。
- CSS contract：通过；检查器仍报告既有 11 处 `!important` 和约 6 处旧直接颜色，无新增阻断。

完整 Rust 测试后修正了三个等价的 Clippy 写法，并加入远程文件读取前的大小检查；随后 Clippy 全目标检查通过。Windows 构建包含这些最终修正。

## 原生桌面与协议夹具

只操作当前仓库 `target/debug/transterm.exe`，使用 exe 旁 portable 标记和独立 `debug/config`。CDP 页面为当前 Vite `http://localhost:5188/`，核对进程路径、端口及版本后才操作。未使用用户真实 SSH、Provider 密钥或正式应用窗口。

- 真实本地进程：修改计数器后模拟 Provider 503，继续任务时计数仍为一次；32 秒静默长命令持续发出进度，完成输出存在；停止长命令保留输出并终止后续副作用；托管模式的未知本地命令仍需确认。
- 真实 SSH/SFTP loopback：本地与远程文件保存/撤销、外部修改冲突和撤销冲突；UTF-16 BOM/CRLF 按字节恢复；非法 UTF-8 拒绝读取。
- 同步：新增/修改/未变分类，忽略规则，伪造选项拒绝，目标在预览后变化拒绝覆盖，选中上传和下载成功，目标独有文件与未选文件保留。
- 原目录上传入口：隐藏 `.git` 和二进制文件照常上传，未继承同步的忽略规则。
- 真实 React 和 IPC：草稿关闭重开、附件引用复用、正文搜索及匹配片段、分支清除授权并保留原对话、任务继续入口、文件差异和逐项审批。
- 界面：四个内置主题、320px 内容、定制 accent、减少动态效果、1024×600、小窗口同步预览滚动及 125% 缩放；菜单、附件、模型选择和已有 REA 入口可操作。

关键截图：[同步预览](../../release/TermHub-Directory-Sync-Preview.png)、[小窗口同步](../../release/TermHub-Directory-Sync-Short.png)。本地完整 JSON 证据位于 `.npm-cache/native-build/functional-*-native.json`、`runtime-checkpoints-evidence.json`；构建成品的 `BUILD_INFO.json` 收录结果。

## 模块规模

原集中式聊天执行职责已拆成请求循环（278 行）、命令执行（547 行）和检查点（314 行）模块；Provider transport 为 503 行。侧栏 panel 为 799 行，模式控制、终端交接和选择边界独立维护（67 / 33 / 41 行）。文件管理器为 802 行，低于 1000 行强制拆分边界，略高于 800 行目标。领域类型、i18n、CSS、测试与文档按仓库规定豁免规模约束。本轮开始的完整源码快照未保留，因此不虚构改前行数。

## 验证边界

未连接用户真实 Provider 或 SSH，账号权限和第三方实际模型能力仍取决于服务端。macOS/Linux 未在本轮原生验证。同步使用大小/时间，不是内容 hash；不会删除目标端独有文件。远程协议无通用原子 compare-and-swap，最后复核与实际写入间仍有极短的外部修改窗口。大日志引用复用现有读取能力，未加入服务端分页。

构建、成品 CLI/MCP 与桌面快捷方式的最终结果记录在 `release/BUILD_INFO.json`；这轮只生成本地软件，不创建 tag 或 GitHub Release。
