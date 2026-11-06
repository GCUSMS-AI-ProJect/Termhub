# AI SVG 图标更新

从 Lucide 官方仓库选择统一的圆角线性 SVG，保存固定上游提交、原始文件和许可。

- AI 区域全部动作及状态图标采用同一套图形，替换现有混合风格与字体连字图标。
- 复用 AppIcon，本地 sprite 引用使用 currentColor；AI 机器人、REA 扫描、SSH 终端、附件回形针各有明确语义。
- 保留按钮可访问名称、加载/开启状态与 REA 点击反馈，检查小尺寸与主题兼容。
- 原生窗口验证工作台、窄侧栏、菜单、REA、聊天消息、设置、减少动效与缩放。
- 项目门禁与 CSS contract；重新编译 Windows 成品，更新桌面快捷方式。

## 完成

以上改动与验证已完成。43 个官方 SVG 随应用离线打包，完整来源与许可均已保留。
四种主题、自定义强调色、模式菜单、REA 弹层、消息、附件、窄侧栏、短窗口及 125% 缩放通过原生验证。
类型、ESLint、Prettier、Clippy 与 CSS contract 通过；169 项 renderer、858 项 Rust / contract 测试通过，2 项既有忽略。
Windows x64 主程序与 NSIS 安装包已重新编译，CLI 与 MCP 初始化检查通过；桌面快捷方式已指向新版。

交付：`release/TermHub-AI-Icons/TermHub.exe`。
验证记录：[AI SVG 图标验证](../../quality/ai-icons-validation.md)。
