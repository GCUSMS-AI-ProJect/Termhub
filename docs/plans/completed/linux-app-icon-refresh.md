# Linux 包与运行时图标刷新

## 范围

- 检查 deb、rpm、pacman 的静态图标、桌面入口、升级与变体切换，保留既有 Windows 修复。
- 静态包统一经典银边；X11 窗口图标、Wayland 桌面入口、任务栏与托盘同步选择。
- 不覆盖用户管理的桌面入口，不让开发版改写正式版启动器，不绕过 deb 私有兼容运行时的启动脚本。

## 已发现

- Linux 打包 PNG 仍为旧版无银边。
- 运行时只覆盖 `FileTerm.desktop`，遗漏匹配 Wayland app ID 的 `com.fileterm.desktop.desktop`。
- 始终写入同一个 `launcher.png`，桌面缓存可能不失效；切回 classic 时又删除覆盖并退回旧静态图标。
- 使用 `current_exe()` 会把 deb/Arch 启动器改为内部 ELF 路径，开发版还会污染正式版启动器。
- 原有 Exec 字符转义未应用 desktop-entry 字符串层和参数层两级规则。
- 实际 RPM 中 `FileTerm.desktop` 被 Tauri 默认模板覆盖；缺少规范的绝对启动命令和 `TryExec`。现已对 deb/rpm 显式指定同一桌面模板。
- Windows checkout 的 CRLF 会进入桌面模板，使实际 Linux 包不能通过 `desktop-file-validate`。新增 `.desktop` / `PKGBUILD` 的 LF 属性，并在验包工具中拒绝 CRLF。

## 验证

- 资源、配置和解包内容校验覆盖三种包格式及两种架构。
- 文件系统回归覆盖变体切换、经典恢复、用户入口保护、路径转义和缓存路径。
- Linux 原生 GTK/GIO 桌面入口解析检查；项目质量门禁与无法实测项记录在完成报告。

## 已完成验证

- 下载并解包 beta.2 的 x86_64 / ARM64 deb、rpm、pacman 六个实际发行包：确认全部携带旧图标；两个 RPM 的可见桌面入口同时存在模板覆盖问题。新验证器能识别这些问题。
- 本机 Windows 全量 Rust/contract 测试 731 项通过；Renderer 95 项通过；类型通过。Lint 与 Prettier 使用 `endOfLine: auto` 适配本工作区现有 CRLF 后通过，未批量格式化无关文件。
- WSL Ubuntu 24.04 原生编译通过，9 项图标专项测试通过，包括通过真实 GIO 加载并启动含空格、中文、引号、反引号、美元、百分号和反斜杠的可执行路径。GIO 对命令中 `%%` 的预检查问题通过仅对含 `%` 的路径使用 `/usr/bin/env` 解决，没有引入 shell 执行。
- 新建的本机 x86_64 debug deb/rpm/pacman 完成实际打包与解包检查：五个图标文件与源资源字节一致，两个 desktop ID 的图标、可见性、启动命令和换行均正确，`desktop-file-validate` 通过（仅保留原有多主分类提示）。
- `.pkg.tar.zst` 另通过真实 `pacman -Qip` 查询，归档可识别，架构及依赖正确；同时验证了本机工具默认生成的 `.pkg.tar.gz`。
- 验包工具已接入 deb/rpm 元数据检查和 Arch 包的输入、最终归档检查；覆盖两个架构的 CI 流程。
- 严格 Windows Clippy 仍被六处未修改的既有问题阻断，与 Windows 修复报告一致；本次图标代码没有新增诊断。Shell 语法、Python 语法、Rust 格式和 diff 空白检查通过。

## 验证环境与限制

- 首次 Linux 编译缺少 OpenSSL 头文件，补齐后原生图标测试与二进制编译通过。
- 验证中 WSL Rust 中间缓存使 C 盘耗尽，导致首次打包 I/O 错误。恢复时暂存并归还了原 npm 缓存，重启 WSL、清理本次中间缓存并执行 trim；后续打包改为受控的图标 payload 验收。
- 本机打包只用于图标验收，使用 debug 二进制；RPM 审计关闭压缩以避免巨大调试符号导致长时间压缩。Tauri 提示该 debug 二进制的 bundle type 标记不可再次写入；这些包不是发布候选，不用于分发。
- pacman 使用 Ubuntu 的 makepkg 本地生成；其 `.BUILDINFO` 查询缺少本机 alpm 数据库而提示错误，归档仍生成，图标及 `.PKGINFO` 依赖检查通过。正式 CI 继续使用 Arch 容器中的 makepkg。
- 未进行真实 GNOME/KDE 桌面的 Dock/任务切换器目视验收、ARM64 新代码编译或三个发行版上的安装升级。Linux 全量 Rust 测试曾因宿主磁盘 I/O 中断，未在清理后重新全编译；Windows 全量与 Linux 原生专项结果分别报告。
- 未替换已安装应用、发布版本或修改 Issue 状态。
- 验证结束后清理本次 WSL 构建与打包缓存并 trim。删除 D 盘 `.git/icon-package-audit/verified-built` 临时解包目录被自动审批拒绝，仅返回 `blocked by policy`；目录保留，未改用其他方式删除。
- 收尾时 C 盘约 3GB 可用；WSL 虚拟盘尚未做离线压缩，已删除的内部缓存空间不等于全部归还给宿主盘。没有执行需要提升权限的系统磁盘操作。
