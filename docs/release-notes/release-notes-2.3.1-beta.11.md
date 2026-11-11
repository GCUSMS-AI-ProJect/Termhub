# TermHub 2.3.1-beta.11

Windows x64 离线安装测试版，修复本地终端启动与更新入口问题。

## 下载与安装

[下载安装包](https://github.com/GCUSMS-AI-ProJect/Termhub/releases/download/v2.3.1-beta.11/TermHub_2.3.1-beta.11_x64-setup.exe)，按向导完成安装。内置 WebView2、REA 和所需 Loader DLL，无需安装开发工具。

## 更新重点

- Windows 本地终端使用检测到的 Shell 完整路径；旧配置中的 `pwsh.exe` 不存在时回退到系统可用 Shell。
- 项目与手动更新入口指向本 GitHub 仓库；未配置签名更新服务时，不再查询旧上游并反复提示重试。
- 离线安装包包含固定版 WebView2，并配置 Windows 10 所需的应用容器读取权限。
- 随包提供许可证与第三方依赖说明。

## 使用提示

仅交付 Windows x64 安装包，适用于 Windows 10/11。此版本未代码签名，采用手动下载安装更新。REA 默认关闭，模型服务需自行配置。请使用随发行版提供的 SHA-256 文件校验下载。

本地验证结果与限制见发行附件 `INSTALLER_VALIDATION.json`。其他操作系统、真实 SSH 服务和模型服务不属于本次安装包验收范围。

## 反馈与支持

请前往 [GitHub Issues](https://github.com/GCUSMS-AI-ProJect/Termhub/issues) 提交系统版本、复现步骤和脱敏日志，不要提交密码、私钥或令牌。

---

# TermHub 2.3.1-beta.11

An offline Windows x64 preview installer fixing local shell startup and release links.

## Download and install

[Download the installer](https://github.com/GCUSMS-AI-ProJect/Termhub/releases/download/v2.3.1-beta.11/TermHub_2.3.1-beta.11_x64-setup.exe). WebView2, REA, and the required loader are bundled; development tools are not required.

## Highlights

- Resolve Windows shell executables to full paths and recover older preferences referencing an unavailable PowerShell 7.
- Use this repository for project and manual update links without querying the historical upstream.
- Include the fixed WebView2 runtime, Windows 10 application-container permissions, and license notices.

## Usage and validation

Only Windows x64 is provided. This preview is unsigned and uses manual updates. REA is disabled by default and model services require user configuration. Check the SHA-256 file and `INSTALLER_VALIDATION.json` for local validation and limitations. Other platforms, real SSH services, and model providers were not validated for this installer.

## Feedback & Support

Report reproduction steps and redacted logs through [GitHub Issues](https://github.com/GCUSMS-AI-ProJect/Termhub/issues). Do not include credentials or tokens.
