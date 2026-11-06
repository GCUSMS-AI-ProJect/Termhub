# 桌面 UI 本地预览

当前产品展示名为 TermHub，开发版产品名为 `TermHub Dev`。应用标识、源码 workspace、开发态二进制 `transterm` 与下述配置目录保持兼容；Windows 打包后的入口为 `TermHub.exe`。

以下命令在用户打开的项目目录运行；这里的目标目录不代表需要创建 worktree。

- 根目录 `npm run dev` 最终执行 `npm run dev -w @transterm/tauri`，必须加载 `tauri.dev.conf.json`。配置中的 productName 为 `transterm Dev`、bundle ID 为 `com.transterm.desktop.dev`，但 macOS 开发运行的是未打包可执行文件 `apps/tauri/src-tauri/target/debug/transterm`，Dock/进程名称为小写 `transterm`。数据与日志解析到普通安装版的 `com.transterm.desktop` 目录；旧 `.dev` 数据目录不迁移、不读取；Windows portable 继续使用 exe 旁的配置目录。
- 验证桌面 UI 时，从目标项目目录启动或复用开发版，并核对启动日志、进程完整路径、工作目录、Vite 监听端口和界面版本。开发页面应来自当前 Vite 服务，不能把 `tauri://localhost` 的旧打包版当成当前源码预览。
- Computer Use 必须精确绑定已确认的开发进程/窗口，不用可能自动启动应用的名称或包 ID 查询做探测。`transterm Dev` / `com.transterm.desktop.dev` 可能自动启动 `target/debug/bundle/macos/transterm Dev.app` 等旧打包产物；小写 `transterm` 也可能被忽略大小写后匹配到 `/Applications/transterm.app`。工具无法绑定当前未打包进程时报告具体阻碍，停止桌面操作，不启动其他 `.app` 验证。清理旧打包产物时保留配置、日志和当前 `target/debug/transterm` 可执行文件。
- 如果默认 dev 端口 `5188` 已被目标项目目录的 Vite 服务占用，可复用该服务运行 `npm run dev -w @transterm/tauri -- --config '{"build":{"beforeDevCommand":null}}'`；这仍会加载开发版身份配置。否则不要猜窗口版本、改用安装版或结束可能保有远程会话的进程。
- 只有确认窗口由当前项目目录的开发进程启动后，才用 Computer Use 操作或截图验证；无法区分开发版与安装版时，先报告具体阻碍。
