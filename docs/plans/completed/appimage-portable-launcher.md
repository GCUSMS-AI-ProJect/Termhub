# AppImage portable launcher

## 问题与范围

2.2.26 开始把 DEB 的绝对路径 desktop 文件加入 AppImage，导致 AppRun 调用宿主机 `/usr/bin/fileterm`。实际核对 2.2.20、2.2.26、2.2.31 与 2.3.1-beta.8 发布包后确认差异。linuxdeploy 还把两个 desktop ID 都提升到了 AppDir 根目录。

## 实现与验收

- AppImage 使用专用的可迁移 desktop 文件，保留应用 ID、GNOME 分组、分类和图标；系统安装包保留原入口。
- 在现有重打包步骤中保持唯一根 desktop 文件与匹配的 256px 图标。
- 扩展现有包校验器，验证实际 AppDir 的入口、图标、desktop 文件和 AppStream；通过最终 AppImage 的 `--help` 检查启动链。
- 使用 fixture 回归检查宿主机绝对路径、重复根 desktop 和缺少可执行文件等失败场景。
- 运行项目门禁；没有 Linux 构建和 GUI 离线启动环境时如实记录限制。

## 规则来源

- [AppDir specification](https://docs.appimage.org/reference/appdir.html)：根目录仅允许一个 desktop 文件，图标名称匹配 `Icon`，提供 AppRun 和 .DirIcon。
- [Manual packaging](https://docs.appimage.org/packaging-guide/manual.html)：入口可迁移，desktop 文件通过 desktop-file-validate。
- [AppImageHub requirements](https://docs.appimage.org/packaging-guide/distribution.html#appimagehub)：验证 desktop 与 AppStream，并在 Linux 和离线环境实测；本地静态检查不等于已获目录收录。

## 完成记录

- AppImage 专用 desktop 文件使用 `Exec=fileterm %U`，省略可选的 `TryExec`，防止桌面集成后按宿主机 PATH 判断应用是否存在。
- 现有重打包脚本保留唯一根 desktop 文件；GNOME companion 仍保留在 `usr/share/applications`，根图标指向包内 256px 图。
- 扩展现有校验器及 fixture，验证宿主机绝对路径、重复根入口、根入口内容不一致、错误图标和缺少可执行文件等失败场景。
- CI 与发布流程安装官方 desktop/AppStream 校验器，检查最终 AppDir，并执行最终 AppImage 的 `--help`。
- Ubuntu 22.04 的 AppStream 校验器不接受既有的 `vcs-browser` URL 类型；删除了与 homepage 重复的这一项，保留应用 ID、图标、截图与其他元数据。
- 实际重打包发现原有 `unsquashfs | awk ... exit` 在 `pipefail` 下可能因 SIGPIPE 返回 141；改为消费完整输出，重跑后通过。

## 验证结果

- `npm run typecheck`、`npm run lint`、项目范围 Prettier 检查通过。
- Renderer 的 114 项测试、`npm run test:tauri` 和全目标全特性的 Clippy 检查通过；相关 shell 语法检查通过。
- Ubuntu 22.04 x86_64 容器：实际 beta.8 的内部 AppRun 复现原始错误；替换入口后执行 `--help` 成功。
- Ubuntu 22.04 ARM64 容器：实际 beta.8 完整 AppImage 复现原始错误；使用修改后的重打包脚本生成最终 AppImage，权限、更新信息、zsync 摘要和最终 `--help` 均通过。
- 官方 `desktop-file-validate`、`appstreamcli validate-tree --no-net`、固定提交 `19e30b276ffedf4d3b4b56bc6320f463625a74f8` 的 `appdir-lint.sh` 无致命错误。AppStream 有两项信息提示；旧 lint 只搜索 `.appdata.xml`，对合法 `.metainfo.xml` 报缺失提示，因此 CI 显式验证整棵 AppDir。lint 另保留既有的 `libwayland-client.so.0` 打包提示。
- 断开 ARM64 容器外部网络后，在 Xvfb 中启动最终 AppImage，确认可见 FileTerm 窗口、进程路径来自 AppImage 内部，并持续运行；仅使用软件渲染环境设置，没有关闭 WebKit sandbox。

## 边界

- Linux 验证复用了实际 beta.8 的程序二进制，针对本次打包改动重建 AppImage，没有重新编译整个 Linux 应用。
- Apple Silicon 的 Rosetta 无法执行 x86_64 AppImage 外层静态运行时；x86_64 完整包启动仍由原生 Linux CI 中新增的整包 smoke 检查覆盖。
- beta.8 资产保持不变；本修复已准备纳入 beta.9，尚未提交 AppImageHub 收录申请。
