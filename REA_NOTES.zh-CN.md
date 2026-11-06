# REA 调研

[REA（Reverse Engineer Anything）](https://github.com/morluto/rea) 是面向 AI agent 的逆向分析工具，提供 MCP 服务和 CLI。它把分析证据交给 agent，由 agent 继续调查、解释行为、编写和验证实现。

## 适用场景

- 原生二进制：借助 Hopper、Ghidra 或 IDA 查看伪代码、汇编、字符串及调用关系。
- JavaScript/Electron：分析模块、导入、source map 和 IPC 边界，不需要原生反编译引擎。
- 网站与运行行为：结合浏览器或运行时工具调查页面、请求及程序交互，具体支持范围依赖平台和工具。
- 也提供 .NET、Android 等分析入口，具体要求以当前版本文档为准。

分析目标在本地处理；工具结果交给 agent 后，模型服务商的数据规则仍然适用。REA 不保证自动还原出完整、可构建的原项目。

## 下载结果

已从 [gcusms/rea](https://github.com/gcusms/rea) 下载到本工作区 `rea-upstream/`。

- 源码版本：`6.7.0`。
- Commit：`90e433df06b3f83417176b8db1b0a905f9df1d3a`。
- 已通过 Git 连通性/对象完整性检查，参考源码未作修改。
- 这是源码下载，没有安装 REA、注册 MCP 或修改全局 agent 配置。

官方 npm 安装入口为：

```powershell
npx rea-agents setup
```

配置步骤见 [官方安装文档](https://github.com/morluto/rea/blob/main/docs/installation.md)。本地 fork 的 README 反映该源码版本；npm 实际发布版本可能与仓库版本不同。

## 当前接入状态

后续已接入 REA：Rust 内置 MCP 客户端，本地运行时随安装包分发；POSIX SSH 通过当前连接在远端用户缓存准备 REA 6.7.0。REA 默认关闭，在 AI 面板点击“开启 REA”后，半自动/全自动模式才能使用分析工具；纯对话模式不执行工具。未注册全局 agent。见 [使用说明](docs/rea.md)。

前面的“源码下载，没有安装”描述最初调研阶段；现在使用官方 npm 发布包与独立锁文件，参考源码 `rea-upstream/` 仍保持原样。

## 与 transterm 的关系

[fileterm](https://github.com/St0ff3l/fileterm) 已公开完整源码，并采用 MIT 许可证。最初直接复制你的 [fileterm fork](https://github.com/gcusms/fileterm)，无需逆向分析；后续 REA 接入用于用户自己的软件分析任务。

fileterm 基于 Tauri v2、Rust、React、TypeScript、xterm.js 和 Monaco Editor，提供 SSH 终端、SFTP/FTP/FTPS 文件管理、编辑器、多连接标签页和传输中心。transterm 保留这些实现，统一更换产品名称与相关身份配置。

## 下载通道说明

原有 Git 全局代理指向 `127.0.0.1:7897`，当时不可连接。下载时临时跳过该代理；大文件传输遇到 HTTP/2 中断后使用 HTTP/1.1 分批获取。没有修改全局 Git 代理配置。
