# Responses SSH 工具请求失败修复

SSH 接入后开启工具的 Responses 请求返回 HTTP 200，但 SSE `response.failed` 报 `invalid_function_parameters`：严格模式声明了 `explanation` 属性，却没有将其加入 `required`。旧解析器把失败与未完成回答合并，隐藏了真实原因。

- 修正 Responses 命令工具的严格 JSON Schema，维持现有审批与执行边界。
- 区分失败、输出额度不足和过滤；显示经过脱敏、限长处理的 Provider 原因。流式和 JSON 响应使用相同校验，失败时不得执行已接收的工具片段。
- 增加严格工具 Schema 与失败事件回归测试，用隔离 SSH 验证 Responses 的审批、执行和后续回答。
- 完成项目门禁，重新构建 Windows 软件并更新桌面入口，保留用户正在运行的窗口。

接口已使用合成数据复现；不读取或上传实际终端内容。Schema 修正后的同接口模拟工具回传已获得 `TOOL_LOOP_OK`。

参考：[OpenAI 严格模式](https://developers.openai.com/api/docs/guides/function-calling#strict-mode)、[Responses 流式事件](https://developers.openai.com/api/reference/resources/responses/streaming-events)。

已完成实现、全量门禁、原生 SSH 与当前 Responses 接口的完整工具循环验证，以及 Windows EXE/安装包构建。桌面入口已切换至 `release/TermHub-Responses-Fix/TermHub.exe`，保留旧窗口供用户自行退出。详见[验收记录](../../quality/responses-ssh-schema-validation.md)。
