# transterm Windows 本地编译与黑屏排查

- 目标：修复浏览器入口在缺少 Tauri runtime 时的黑屏，编译并启动本项目 Windows 原生应用，交付安装包。
- 保持原版布局、协议实现和资产；浏览器仅使用现有无 desktop API 的预览分支。
- 安装并验证 Rust MSVC、Microsoft C++ Build Tools、NASM；复用现有 WebView2。
- 通过实际浏览器与原生窗口截图验证首屏；运行项目质量门禁并记录产物路径。
- 本地构建禁用 updater 签名产物，不创建 tag 或发布 GitHub Release。

## 已完成

- 用 Chrome CDP 复现：bridge 模块初始化时 `getCurrentWindow()` 读取不存在的 Tauri metadata，React 根节点为空。
- main/bridge 根据 `isTauri()` 选择原生或现有浏览器预览分支；预览不伪造 desktop API。
- 修复首页浮层状态条与工作区 `grid-row: 2` 的冲突，实测工作区从高度 0 恢复到 820px。
- 浏览器完整首页截图无启动异常；保留原版视觉布局，仅修正预览提示中的过时 Electron 文案。
- 安装 Rust 1.99.1 MSVC、clippy、rustfmt、NASM 2.16.01、C++ Build Tools 17.14 与 Windows SDK 10.0.26100；安装成功，无需重启。
- 新增 `npm run build:win` 复用现有 NSIS CI 配置；本机 Cargo 下载配置位于被本地 Git exclude 忽略的 `.cargo/config.toml`，绕过失效的全局 Git 代理并使用镜像，不作为项目分发配置。
- typecheck、lint、Prettier、155 项 renderer 测试、前端生产构建及 CSS contract 通过。
- 首次 release 编译成功，生成 65,315,840 字节的原生 exe。核对可执行路径、PID、标题、界面版本，用 Win32 PrintWindow 与 UI Automation 验证完整首屏及本地 PowerShell 提示符。
- 修正测试标记大小写：S3 非法桶名应含大写、分片 SSH ready marker 应与 `TranstermReady` 一致。Windows 默认 shell 的序列化测试与实际默认值一致，不再假设必有 pwsh.exe。
- 修正 Windows 上 Unix 测试导入警告、scheduler fixture 的缺失注册 stub 与专用函数条件，以及 Rust 1.99 的两处等价风格告警。
- Rust 测试 837 项通过，1 项上游忽略；clippy `--all-targets --all-features -- -D warnings` 通过。
- 首次 NSIS 下载超时，已下载缓存并按官方 SHA1 验证 NSIS 3.11 与插件；Windows CI 配置使用 target 下的本地工具缓存。
- 此次新建的本机配置关闭自动检查更新；尚无 fork Release，源码默认值不变。

## 交付结果

- `npm run build:win` 成功：release 优化编译和 NSIS x64 打包均完成。
- `release/transterm.exe`：65,315,840 字节，SHA256 `A4C227D26767408158AFD82FFD19CF9B92B29D4FEA10F76C9F585E250EB83291`，与最终 target 产物一致。
- `release/transterm_2.3.1-beta.10_x64-setup.exe`：29,844,294 字节，SHA256 `4099FA0BA6148610303B595A30A098583B6573459279C18D0D92F147075ACFEA`。
- `release/transterm-home.png` 为最终构建的真实窗口截图；核对进程 PID 25376、完整路径 `apps/tauri/src-tauri/target/release/transterm.exe`、主窗口标题 `transterm` 和显示版本 `2.3.1-beta.10`。应用保持运行。
- `release/` 同时包含原始 LICENSE 与第三方许可声明。
- Rust 和 NASM 加入用户 PATH；NASM 安装到 `LocalAppData/bin/NASM`，供现有 Tauri 启动器自动发现。

## 验证范围

- 浏览器：真实 Chrome CDP 验证完整首页渲染，启动异常为 0，状态条不再将工作区压缩为 0 高度。
- Windows：最终打包程序实际启动、完整首页截图通过；首次构建能够打开本地 PowerShell 并显示提示符。
- 终端键盘自动化未稳定绑定目标控件，不将其记为命令执行验证通过；最终交付只保留确定的首页截图。
- 本地安装包未签名，未执行安装向导，未发布 GitHub Release，自动更新密钥尚未配置。
- 真实 SSH/SFTP/FTP 服务器、macOS/Linux 与完整原生菜单/托盘交互未验收。

## 检查日志

详细本机日志保存在忽略目录 `.npm-cache/native-build/`：`windows-build-final.log`、`rust-tests-fixed.log`、`clippy-final.log`、`renderer-tests.log`、`typecheck.log`、`lint.log`、`format.log`、`css-after.log` 和浏览器检查结果。
