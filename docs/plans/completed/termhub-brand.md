# TermHub 应用名称

将用户可见产品名从 transterm 改为 TermHub，包括窗口、首页、设置、原生菜单、托盘与 Windows 程序/安装包/桌面快捷方式。保留原作者许可。

沿用 com.transterm.desktop、内部 bridge、工具名、主题 ID、缓存和配置目录，确保原有连接、设置与外部集成兼容。Windows 使用 Tauri mainBinaryName 输出 TermHub.exe；开发态与其他平台内部二进制名保持兼容。

检查品牌文案与打包脚本，运行所有项目门禁，精确绑定当前源码原生开发窗口验收；编译 Windows 软件，交付完整 REA 运行时并更新桌面入口。保留用户正在使用的旧版窗口。

已完成：产品显示名、原生菜单、首页、CLI 文案与 Windows 文件名统一为 TermHub，协议标识保留兼容。156 项 renderer、849 项 Rust/协议测试（2 项忽略）、类型、lint、项目范围格式、Clippy 与 CSS contract 通过；原生桌面与本机 REA 启停通过。最终 EXE 的 MCP 初始化和 43 个工具兼容性验证通过。

Windows 正式构建及 NSIS 安装包成功，交付于 `release/TermHub/TermHub.exe` 和 `release/TermHub_2.3.1-beta.10_x64-setup.exe`。桌面 TermHub 快捷方式指向包含完整 REA 运行时的新目录。详细验收见 [TermHub 名称适配验收](../../quality/termhub-brand-validation.md)。
