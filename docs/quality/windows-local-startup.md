# TermHub Windows 本地启动验证与依赖修复

验证日期：2026-11-06。本文记录一次 Windows x64 本机构建及启动验证，不代表跨平台或真实远程连接已验收。

## 环境与验证结果

- Windows 10 专业版 22H2，64 位，16GB 内存。
- Node.js 24.16.0、Rust/Cargo 1.99.1、NASM 3.01。
- 当前本机构建使用 Windows GNU 工具链；常规 Windows 发行构建仍按项目要求使用 MSVC 工具链。
- `npm run typecheck` 通过，renderer 测试 198 项通过，README 与发行候选验收计划的 Prettier 检查通过。
- `npm run build -w @transterm/tauri -- --config src-tauri/tauri.ci.windows.conf.json --no-bundle` 构建成功。
- 首次直接启动发现缺少 `WebView2Loader.dll`；补齐依赖并指定独立 WebView2 后，主窗口标题为 TermHub，窗口响应正常，renderer 日志记录了工作区状态加载。
- 未验证真实 SSH/FTP 服务器、模型服务、其他电脑及 macOS/Linux；未执行完整 Rust 测试与 Clippy。GNU 链接阶段出现 multiple non-default manifests 警告，当前主窗口启动验证通过，该结果不能代替其他原生功能的验收。

## 缺少 WebView2Loader.dll

本次采用 `--no-bundle` 生成 EXE，该 GNU 构建动态依赖微软 WebView2 Loader。只复制 EXE 不会自动收集这个 DLL；即使电脑安装了 WebView2 Runtime，也应同时分发构建所需的 Loader。

使用本次构建生成的 x64 Loader，将其放到 `TermHub.exe` 同目录。以下命令在仓库根目录执行：

```powershell
$appDirectory = 'release\TermHub'
New-Item -ItemType Directory -Path $appDirectory -Force | Out-Null
Copy-Item -LiteralPath 'apps\tauri\src-tauri\target\release\TermHub.exe' -Destination $appDirectory

$loaders = @(Get-ChildItem -Path 'apps\tauri\src-tauri\target\release\build\webview2-com-sys-*\out\x64\WebView2Loader.dll')
if ($loaders.Count -ne 1) {
    throw '请确认当前构建对应的 x64 WebView2Loader.dll，避免混用不同构建或架构的文件。'
}
$signature = Get-AuthenticodeSignature -LiteralPath $loaders[0].FullName
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw '微软 DLL 签名验证失败。'
}
Copy-Item -LiteralPath $loaders[0].FullName -Destination $appDirectory
```

若使用 `--target` 或自定义 Cargo target 目录，需要调整上述路径。x86/ARM64 应使用匹配目标架构的 Loader，不应复制这里的 x64 文件。不要从第三方 DLL 下载站获取替代文件。

## 缺少 WebView2 Runtime

Loader 与 Runtime 是两个不同组件：前者负责加载，后者负责渲染界面。普通部署可以安装[微软 WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)。

本机在线及完整安装程序均返回错误码 2，未确定系统安装失败的根因；因此本地验证改用微软官方固定版本 `157.0.4341.42 x64`，解压在应用目录的 `webview2/` 内。启动器仅为当前进程设置 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER`，指向实际包含 `msedgewebview2.exe` 的目录，不修改系统环境变量。

Windows 10 使用固定版本 120 及以上时，还需按微软文档为该运行时目录授予应用容器读取/执行权限。解压方式、权限命令和部署要求见[微软官方部署说明](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#the-fixed-version-runtime-distribution-mode)。固定版本不会自动更新，后续应随应用维护更新。

## 本地交付与快捷方式

本次验证的本地目录包含：

```text
release/TermHub/
  TermHub.exe
  WebView2Loader.dll
  Launch-TermHub.vbs
  rea/                   Node.js、REA 与运行时许可证
  webview2/              微软独立 WebView2 运行时
  LICENSE
  THIRD_PARTY_NOTICES.md
  LOCAL-RUN.txt
  BUILD_INFO.json
```

`Launch-TermHub.vbs` 是本机生成的启动器，使用相邻的独立运行时；桌面快捷方式指向该启动器，图标来自 `TermHub.exe`。创建快捷方式前检查新启动进程的完整路径、主窗口标题、窗口句柄和响应状态，不能把系统错误对话框当作启动成功。

`release/`、运行时和桌面快捷方式属于本地产物，不随 Git 克隆提供。迁移到另一台兼容 Windows x64 电脑时应复制完整目录，检查运行时权限并重建快捷方式；桌面快捷方式中的原电脑绝对路径不能直接复用。本机验证不保证其他电脑已经通过兼容性测试。
