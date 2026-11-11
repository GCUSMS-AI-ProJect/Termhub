# TermHub

TermHub 是面向开发者和运维人员的桌面远程工作台，将远程连接、本地终端、文件管理和 AI 助手集中在一个应用中。

[下载安装](https://github.com/GCUSMS-AI-ProJect/Termhub/releases) · [问题反馈](https://github.com/GCUSMS-AI-ProJect/Termhub/issues) · [详细说明](README_ZH.md) · [English](README_EN.md)

## 主要功能

- **终端与连接**：SSH、本地终端、多标签工作区和终端分屏。
- **文件管理**：SFTP、FTP/FTPS、本地文件浏览，以及文件上传、下载和传输队列。
- **连接管理**：保存主机配置，管理连接分组、SSH 密钥、代理和隧道。
- **远程工作**：终端与文件目录联动，查看远程主机系统信息。
- **AI 助手**：接入用户配置的模型服务，辅助分析终端内容和处理工作任务；可按需启用 REA 工具。
- **个性化设置**：主题、终端字体、界面语言及工作区布局设置。

## 下载与安装

前往 [Releases](https://github.com/GCUSMS-AI-ProJect/Termhub/releases)，选择对应版本的安装包。

当前提供 Windows 10/11 x64 离线安装包：

1. 下载名称以 `x64-setup.exe` 结尾的安装文件。
2. 运行安装包，按照向导完成安装。
3. 从开始菜单或桌面快捷方式启动 TermHub。

离线安装包内置 WebView2 和所需运行时，无需安装 Node.js、Rust 等开发工具。测试版本标记为预发布版；其他平台的下载以发行页实际附件为准。

## 开始使用

- **连接服务器**：新建连接，填写主机地址、端口和认证信息，保存后连接。
- **使用本地终端**：打开本地终端；可在设置中选择本机可用的 Shell。
- **管理文件**：在支持的连接中打开文件面板，浏览目录并上传或下载文件。
- **使用 AI 助手**：配置模型服务地址、模型及访问凭据后使用。联网模型服务可能将所选上下文发送至对应服务商，请按需选择内容。

REA 默认关闭，普通终端和文件管理功能不依赖它。详见 [REA 使用说明](docs/rea.md)。

## 版本更新

当前采用手动更新方式。请从 [发行页](https://github.com/GCUSMS-AI-ProJect/Termhub/releases) 下载新版本安装包，退出 TermHub 后进行安装。

## 问题反馈

请在 [GitHub Issues](https://github.com/GCUSMS-AI-ProJect/Termhub/issues) 提供软件版本、操作系统和复现步骤。提交截图或日志前，请移除密码、私钥、访问令牌等敏感信息。

## 许可证与致谢

TermHub 基于 [fileterm](https://github.com/St0ff3l/fileterm) 开发，保留原作者版权信息。项目采用 [MIT License](LICENSE)，其他组件适用各自的 [第三方许可证](THIRD_PARTY_NOTICES.md)。
