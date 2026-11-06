# 文件目录导航验收

日期：2026-10-21；版本：2.3.1-beta.10；Windows x64。

## 行为

本地与服务器文件路径栏各增加两个 SVG 图标按钮：上箭头进入父目录，下箭头进入唯一选中的子目录。下箭头不表示浏览历史前进。目录来自已有列表，打开动作复用已有回调，支持 SSH/SFTP、FTP 和本地共享目录原有的导航链路。

未选中目录、选中文件、多选或选中 `..` 时，下箭头禁用；根目录没有父目录时上箭头禁用。目录加载、工作区切换/刷新和服务器文件不可用时禁用相应操作。使用公共 Button、Tooltip、语义主题变量、现有 AppIcon 和中英文标签，不增加常驻按钮文本。

同时修复共享父目录项对 Windows 混合/尾随分隔符的处理，驱动器根返回“本地”磁盘列表；POSIX 文件名中的反斜杠保持原样。

## 检查

类型检查、ESLint、项目范围 Prettier、160 项 renderer 测试、849 项 Rust/协议测试（2 项忽略）、Clippy 与 CSS contract 通过。新增 4 项路径回归测试覆盖混合与尾随分隔符、驱动器根、POSIX 反斜杠名称、共享根边界。

CSS contract 保持既有 11 处 `!important` 和约 6 处 legacy 直接颜色债务，无新增问题。

## 原生桌面

验证进程为当前工作区 `apps/tauri/src-tauri/target/debug/transterm.exe`，PID 2988；页面精确匹配 `http://localhost:5188/`，运行时产品名 TermHub Dev，原生 bridge 为 true。使用隔离开发配置中的实际 FileManager 组件夹具：本地目录经原生文件 API 读取，服务器目录由内存夹具模拟，未使用用户真实连接或传输数据。

已验证两侧进入选中目录和返回父目录；文件、多选、父项、根目录、加载与断开连接状态；键盘 Enter；四种内置主题、自定义 accent 与 180px 本地窗格。结束后卸载夹具并关闭测试进程，保留用户软件窗口。

截图位于 `release/TermHub-directory-navigation.png`，各主题截图位于同目录对应文件。真实远程 SSH/FTP、共享服务器及 macOS/Linux 原生环境未在本次验收中实测。

## Windows 交付

最终 Windows x64 release 与 NSIS 安装包构建通过。程序位于 `release/TermHub-directory-navigation/TermHub.exe`，附带完整 REA 运行时及许可；安装包为 `release/TermHub_2.3.1-beta.10_x64-setup.exe`。桌面 `TermHub.lnk` 已指向新程序并保留现有图标。

最终程序 CLI 产品名为 TermHub，MCP 初始化兼容原有协议；程序与安装包 SHA-256 均已核对。版本与验证记录见 `release/BUILD_INFO.json`，校验值见 `release/SHA256SUMS.txt`。原有交付目录保留。本次为本地构建，未发布版本。
