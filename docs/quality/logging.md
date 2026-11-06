# 本地诊断日志

## 代码入口

Rust 统一入口为 `apps/tauri/src-tauri/src/services/logging/mod.rs`。持久化管线使用 `tracing` subscriber 和自定义 layer，旧的 `logging::debug/info/warn/error/session/write_global` 等 API 作为兼容 facade，把原有调用转成 tracing event。

| 模块        | 职责                                                |
| ----------- | --------------------------------------------------- |
| mod.rs      | 稳定 facade、日志目录、subscriber 注册与旧调用适配  |
| layer.rs    | tracing 字段和 span 提取、级别转换、写入统一 writer |
| level.rs    | TRACE / DEBUG / INFO / WARN / ERROR 类型与解析      |
| category.rs | scope 到统一功能分类的映射                          |
| format.rs   | 秘密脱敏、控制字符转义、单行和长度限制、行格式化    |
| writer.rs   | 有界队列、后台线程、文件写入、轮转、退出排空        |
| panic.rs    | panic 位置和消息捕获，同时保留原 stderr 行为        |

前端入口为 `apps/tauri/src/renderer/lib/diagnostic-log.ts`，统一 scope 常量和写入失败处理。
调用链为 renderer → writeDiagnosticLog IPC → Rust tracing event → subscriber layer → writer，组件不直接写文件。`tracing-log` 把依赖通过 `log` facade 发出的记录接入同一订阅器。

## 分类与格式

```text
毫秒时间戳 [INFO] [renderer:monitoring] category=monitoring sidebar action action="toggle" tab_id="…"
```

- level 表示严重程度。
- category 表示统一功能域：app、workspace、connection、terminal、monitoring、files、transfer、storage、security、updates、integration、logging、other。
- scope 保留原功能名和标签 ID，例如 ssh:tab-id、metrics:tab-id、renderer:workspace。
- 未识别的 scope 归入 other，不丢弃日志；增加业务日志时同步扩充 category.rs 映射。
- 新 Rust 代码优先使用 `tracing::{debug, info, warn, error}` 并记录具名字段；需要贯穿函数调用的上下文时使用 span / `#[instrument]`。不要把凭据、终端输入或完整远端输出作为字段传入。
- tracing event 的额外字段会以 `key=value` 附加到消息后；活动 span 名称会以 `span="…"` 附加。旧 facade 调用生成相同的 tracing event，但暂时保留原来的自由文本消息。

```rust
tracing::info!(
    category = "connection",
    scope = "ssh",
    tab_id = %tab_id,
    protocol = "ssh",
    "session connected"
);
```

分类用于检索，所有功能的事件仍写入同一个 app.log，方便按时间和 tab_id 串联跨层问题。
历史行没有 category 字段，新旧行仍兼容原来的时间戳/级别/scope 前缀。

## 文件与保留

日志位于应用数据目录的 logs/，设置页“系统与日志”可打开。
开发版使用独立 bundle ID `com.transterm.desktop.dev`，但与普通安装版共用 `com.transterm.desktop` 数据与日志目录；此前的 `.dev` 数据目录不迁移、不读取。Windows portable 沿用 exe 旁的配置目录规则。

app.log 在下一条日志导致超过 2 MiB 前轮转为 app.log.1，仅保留一个备份。单条消息上限为 16 KiB，控制字符转义，不允许换行注入。

密码、token、Authorization、私钥、OTP 等带标签字段会脱敏。业务代码仍应避免将秘密传给 logger，脱敏不能识别所有没有标签的秘密。

## 级别过滤

使用 tracing-subscriber `EnvFilter`，默认保留 DEBUG 及以上，延续原来的诊断行为。启动前可设置 `TRANSTERM_LOG_LEVEL` 为 TRACE、DEBUG、INFO、WARN、ERROR，或使用 tracing-subscriber 的 target 过滤指令；大小写不敏感，无法解析时回退到 DEBUG。
该设置在进程启动时读取，修改后需重启。过滤在事件格式化、脱敏和排队前完成，不影响原 renderer console 输出。

## 写入和限流

- 所有级别共用 1024 条有界队列，由一个专用线程串行写入。提交只尝试入队，不等待磁盘；满载、关闭或写入失败都不会逐条创建 Tokio task 或原生线程，也不回退到调用线程写盘。
- 队列预留 128 个位置给 WARN/ERROR，另预留 32 个位置给 ERROR。普通级别最多占 864 个位置，WARN 可以使用前 992 个位置，ERROR 可使用全部 1024 个位置；预留只控制接纳，实际入队的消息保持 FIFO，不按级别重排。容量包含待排空标记，不包含写盘线程正在处理的一条记录、并发格式化及分配余量，不作为进程内存上限。
- 超过相应容量的日志被丢弃，分别累计 `dropped_low_priority`、`dropped_warn`、`dropped_error`；写盘失败的记录也计入对应级别。必要时 WARN/ERROR 也会缺失，不能把没有 ERROR 当作没有故障。
- 写盘线程在后续处理消息时输出 `diagnostic logs dropped` 摘要，通常最多每 30 秒一条；排空标记强制尝试输出剩余计数。摘要含 ERROR 丢弃时使用 ERROR 级别，否则使用 WARN，仍受该级别过滤约束。摘要写入失败或级别禁用时保留计数，等待后续消息或排空再尝试，不递归提交日志、不增加定时器。
- 正常桌面退出对入队等待和排空确认共用最多 500ms 的等待预算。磁盘错误、写入线程异常、线程启动失败、强制终止或超时仍可能导致日志与摘要缺失；线程无法启动时本进程诊断日志不可用，不再为每条日志创建兜底线程。

业务采样日志应单独限频，不依赖队列满后的保护。监控样本摘要最多每分钟一条，侧栏状态变化去重，详见 monitoring-sidebar-diagnostics.md。

## 长时间运行诊断事件

以下性能事件写入 `app.log`。`renderer-health` 仅在可见 renderer 中每分钟提交一次；JS heap 不是 WebView 或应用进程的总内存。

| 事件 / scope                                     | 级别与触发                                                                           | 记录内容                                                                                                                                                                                                         | 解释限制                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `renderer-health` / `renderer:performance`       | DEBUG；可见页面每分钟                                                                | `uptimeMs`、可用时的 `usedJSHeapBytes` / `totalJSHeapBytes`、`ipcCallbackCount`、`terminalCount`、`domNodeCount`、本分钟 `maxEventLoopGapMs`；支持 Long Tasks API 时包含任务数、总时长和最大时长；应用版本与平台 | 隐藏页面不采样；JS heap 不代表 WebView 进程内存。可选字段可能不存在                  |
| `renderer-health.native`                         | 随上述记录，由 Rust 附加                                                             | `tokioAliveTasks`、`tokioGlobalQueueDepth`、`sessions`、`workers`、`workerQueuedCommands`、`sessionLogWriters`                                                                                                   | 只记录数量；使用非等待锁，锁忙时相应值为 `null`。全局就绪队列不包含所有 IO 等待任务  |
| `renderer-health.native`                         | 随上述记录，由 Rust 附加                                                             | `transferTasks`、`transferRuns`、`transferProgressSamples`、`terminalOutput.windows`、`terminalOutput.inFlight`、`terminalOutput.queuedBatches`、`terminalOutput.queuedBytes`、`terminalOutput.queuedTabs`       | 只记录数量；锁忙时相应值为 `null`，不是累计历史数或内存字节数                        |
| `event-loop-gap` / `renderer:performance`        | WARN；可见页面的 1 秒心跳间隔达到 4 秒，最多每 30 秒一次                             | `elapsedMs`、页面是否聚焦、应用版本与平台                                                                                                                                                                        | 在 renderer 恢复后才能记录；不能单独证明键盘输入或按钮响应耗时                       |
| `terminal-output-parse` / `renderer:performance` | WARN；终端输出解析耗时达到 1 秒、监听器失败或输出发生跳过，最多每 30 秒一次          | `elapsedMs`、待处理字符数和批次数、监听器数、是否有监听器失败、跳过的字节数                                                                                                                                      | 记录确认链路的耗时和积压，不包含终端输出正文                                         |
| `terminal:output` / category `terminal`          | WARN；renderer 等待输出额度达到 1 秒，或某窗口待发送队列已满；最多每窗口每 30 秒一次 | 等待时记录窗口/标签标识、等待毫秒和额度上限；队列满时记录窗口/标签标识、累计跳过字节数与 `since_last_ack_ms`                                                                                                     | 表示输出显示遇到背压或发生跳过，不包含终端输出正文；跳过后终端会提示可用 Ctrl+L 重绘 |

当前排查分支（尚未发布，beta.9 不含以下新增字段）补充：

- `renderer-health.terminalOutput`：当前窗口订阅的累计接收、解析结束、确认数量，解析/确认失败数，最近接收、解析结束、解析成功和确认的 delivery ID；以及待解析批数/字符数、待确认数、连续繁忙时长和距上次解析结束的时间。没有订阅时为 `null`；计数在重新订阅时重置，ID 不是按顺序完成的水位。解析结束包含失败，需结合 `parseFailures` 和 `lastSuccessfulDeliveryId`。不带原始正文或 tab 名称。
- `renderer-health.interaction`：Event Timing 支持状态、采样数量、最大输入派发延迟和最大事件至下一次绘制耗时。只汇总 `keydown` / `click`，采集阈值为 16ms，浏览器耗时有精度取整；样本数量不是全部操作次数，耗时也不包含远端命令响应。API 不支持时标记 `supported=false`，省略耗时。
- `renderer-progress-slow`：可见页面待解析且连续至少 5 秒无解析结束，或交互采样耗时达到 1 秒时，由既有每秒心跳触发 WARN，最多每 30 秒一次。带上述两份摘要，不新增定时器、逐批日志或逐次交互日志；`event-loop-gap` 与慢解析告警也携带输出进度。
- 原生 `window display queue saturated` / `renderer backpressure` 的 `progress`，以及健康报告的 `native.terminalOutput.windowProgress`：窗口、已分配批次数、最近确认 ID/距确认时间、待确认批数及最早 ID、队列批数/字节数。原生告警不等待 renderer 心跳，仍沿用 30 秒限频；健康报告最多展开 16 个窗口，其余计入 `omittedWindows`。锁忙字段为 `null`，不能当作零。`issuedBatches` 是分配 ID 的计数，不保证通道发送成功。

以上无需管理员权限，不记录按键值、输入内容或终端正文。页面彻底停住时，Event Timing 与 renderer 日志需恢复后才能上报；用已有原生过载告警交叉判断，不能把没有交互采样理解成响应正常。

`renderer-health.maxEventLoopGapMs` 包含心跳定时器本身的 1,000ms 间隔，
约 1,002ms 不能解释成阻塞了 1 秒；需要结合长任务和 `event-loop-gap` 判断。
`renderer:performance` 的 `terminal log coloring disabled after failure` 表示当前终端的
可选语义着色在写入后处理时异常，后续写入绕过该着色，解析完成与 ACK 继续。
该提示每个终端实例至多一次，不记录输出正文。

`terminal:output` 的 `since_last_ack_ms` 是最近一次有效确认（窗口、通道与批次均匹配）
距今的毫秒数，尚无确认时为 `none`。数值很小表示最近仍有确认进度；数值很大也可能
来自此前长时间无输出，不能单独认定 renderer 停止消费。队列饱和还可能来自短小消息
连续入队或转发任务暂未获得调度；需结合同一时间的 `appForeground`、`maxEventLoopGapMs`
与解析耗时判断，不能仅凭跳过标记区分输出突发、隐藏/挂起或可见页面阻塞。

`skipped_display_bytes` 在各窗口内按标签累计，恢复提示也只附在该标签下一批可发送的
输出前，其他标签的输出不会清除它。关闭标签或窗口会清理对应计数。
待发送上限为每标签 8 批、每窗口 128 批，单批至多 16 KiB；`queuedBytes` 是待发送正文
的 UTF-8 字节数，`queuedTabs` 是待发送标签数，两者不包含已发待确认的批次。
这两个字段按各窗口求和，同一标签在两个窗口等待发送时会计算两份。
队列锁忙时这三个待发送字段一起为 `null`，不等待业务锁。

这些性能记录不包含终端文本、终端输入或传输文件内容。普通 `app.log` 还包含各功能主动写入的运行与错误事件；启用的终端会话 transcript 单独保存在 `session-logs/`，其内容策略见“范围”。

## Windows 系统与大小核对照

Windows 构建在日志初始化后启动一个独立原生采样线程，立即采样一次，随后每 60 秒采样，
写入 `app.log`，scope 为 `app:windows-performance`，事件为 `windows-native-health`，级别 INFO。
不依赖 renderer 的事件循环、IPC 或动画帧；页面卡住时原生采样仍可继续。进程暂停、系统睡眠、
采样线程调度延迟及日志队列丢弃仍可能造成记录间隔或缺失；日志缺失本身不证明应用冻结。

- 每条记录带应用版本、主进程 PID、采样器运行时间、`sampleIntervalMs`、`sampleDurationMs` 和
  `appForeground`（本应用是否拥有前台窗口，读取失败为 `null`）。首次间隔为 `null`。
- `host` 缓存并重复记录 Windows build、display version、edition、进程架构、CPU 型号，以及
  Windows CPU Sets 报告的效率等级、各等级逻辑处理器数和物理核心数。失败记录 `errorCode`；
  多效率等级仅说明系统报告了异构拓扑，不把等级直接标成 Intel P/E 核，也不代表实际线程调度。
- `power` 记录电源连接和节电状态原始值；`acLineStatus` 的 0/1/255 对应离线/在线/未知。
- 主窗口与子窗口在创建时经 WebView2 `BrowserProcessId` 登记浏览器进程，窗口销毁时移除；
  采样用浏览器 PID 补充父子树，避免浏览器由已有环境托管时只找到 transterm。每次校验创建
  时间，防止退出后 PID 复用。登记不轮询 UI，不依赖 renderer IPC；若浏览器已退出或身份
  查询失败则明确报告，不扫描系统里所有同名 WebView2 进程。
- `processes.samples` 只选本 transterm 和上述已确认的 WebView2 进程树，记录 PID、角色、累计 CPU 时间、
  `cpuPercentOneCore`、工作集字节、private committed bytes、优先级及 power throttling 原始 masks。
  CPU 百分比按两次成功采样间隔计算，100 表示占满一个逻辑处理器；多线程可超过 100，
  不是任务管理器按整机容量归一化的数值。首次采样或 PID 被复用时为 `null`。
- 普通内存/CPU/策略采集只申请 `PROCESS_QUERY_LIMITED_INFORMATION`，不申请 `PROCESS_VM_READ`
  或调试权限，也不尝试提权。微软的 [GetProcessMemoryInfo 接口要求](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getprocessmemoryinfo)
  支持有限查询权限。域策略仍可能拒绝访问，拒绝时保留错误码，不用 0 代替未知内存。
- `processes` 增加 `discoveryMethod`、`webview2Count`、`memoryReadCount` 与 `accessMode`。
  `browserRegistrations` 说明登记状态：`awaiting-webview` / `available` / `partial` / `registry-busy`；
  每窗详细记录可显示 `pending` / `browser-replaced` / `unavailable` 和失败阶段/错误码。
  最多展开 16 个窗口，`windowCount` / `omittedWindows` 保留数量；`memoryReadCount` 是成功
  读到内存的进程数量，必须结合 `count`、`truncated` 和登记状态判断覆盖情况。启动最早一条
  记录可能尚无窗口登记，`webview2Count=0` 不证明 WebView2 没有内存占用。
- 同一用户数据目录可能复用浏览器进程。PID 在单条记录内去重；不同 transterm 实例若共用
  同一浏览器，可能列出相同 PID，不能跨实例相加后当作各自独占内存。CPU 百分比与工作集
  都是进程级统计，工作集含共享页面。
- 最多采样 32 个进程，`count` 保留实际匹配数量，超出时 `truncated=true`。退出、权限不足或 API
  不支持会记录对应 `*ErrorCode`，不作为 0 CPU/0 内存；退出进程的采样状态会清理，句柄及时关闭。

对照同一时间的 `renderer-health`、`event-loop-gap`、`terminal-output-parse`：若页面心跳中断而
原生日志继续，可进一步看 WebView2 的 CPU、内存与策略变化；策略 masks 不能证明线程被调度到
小核。实际核心驻留和调度等待由下面的短时 ETW 诊断补充。这里不改变绑核、业务线程优先级或
节能策略，不采集用户名、命令行、窗口标题、终端内容或凭据，也不写独立的无限增长日志文件。

### 自动线程调度采集

Windows 启动约 10 秒后，原生侧只检查并回收孤儿会话，不启动全局 ETW 跟踪。
仅既有 `event-loop-gap` / `terminal-output-parse` 告警触发一次 3 秒采集，采集起点至少相隔
30 秒；触发队列最多一项，`collectionMode=warning-triggered`。正常使用没有周期 ETW 采集，
原有每分钟进程健康日志保持不变。页面完全冻结且未恢复时可能没有新的告警；恢复后的 WARN
只能触发后续窗口，不能还原已经错过的卡顿。无需用户手动启动 WPR；用户只需发送 `app.log` 与 `app.log.1`，
并提供卡顿的大致时间。新事件 `windows-thread-scheduling` 使用同一 scope，级别 INFO。

精确采集受 Windows 内核跟踪权限限制。helper 只启用现有 token 中的
`SeSystemProfilePrivilege`，不提权、不弹 UAC、不安装服务或修改账户权限。普通权限不足时
记录 `status=unavailable`、`stage`、`errorCode`、`requiresElevation=true`，停止本次运行中的
重复尝试；若需要精确数据，用户可以自行选择以管理员身份重启 transterm 后复现。没有权限时
现有每分钟进程健康采样继续工作，`windows-native-health.scheduler` 重复保留采集状态，避免
日志轮转后把“未采到”误认为“未发生”。多处理器组、拓扑不完整等情况同样明确降级，不猜 CPU 映射。

每次采集使用独立的内部 helper 进程，不初始化 Tauri/WebView。只创建自己命名的短时实时
会话，不接管 WPR 或其他程序的跟踪。会话名称和 GUID 同时带 transterm 所有权标记、主进程
PID 与创建时间；启动和每次采集前枚举并回收确认原所有者已退出或 PID 已复用的会话。
仅前缀相同、身份不明、权限不足或枚举不完整时不擅自停止会话，并停止新采集。枚举最多
256 个会话；报告回收数量或 `orphan-recovery` 错误，不记录其他会话的名称或路径。
helper 正常退出前停止会话，主程序即使先退出，helper
仍会完成这项清理。父进程对 helper 设置 8 秒超时并尝试清理自己的会话后终止 helper；
若整个进程树同时被强杀，任何用户态清理代码都无法立即执行；旧会话要在下次具备权限的启动
或采集前回收。无法保证强杀瞬间已清理完毕，不能把进程退出等同于 ETW 会话已停止。

开销限制：请求 16 个 64 KiB ETW 缓冲（禁用按 CPU 自动扩张），不启用堆栈、磁盘或网络事件；
最多消费 250,000 个事件，消费线程每 4,096 个事件检查一次累计 CPU 时间，超过 50ms 提前结束。
消费结束和汇总后再次检查尾段 CPU；helper 完成报告裁剪/序列化后检查整个进程的 CPU，预算
为 200ms。`consumerCpuMs` / `helperCpuMs` 分别记录消费线程和整个 helper 的成本，
`budgetExceeded` / `helperBudgetExceeded` 超限或无法读取 CPU 时间时令证据失效并停止后续采集。
上述限制不是整机 ETW 开销的保证，实际分配量见 `bufferBytes`，真实 Windows 负载仍需验证。
最多筛选 32 个本应用/WebView2 进程、持有 1,024 个线程对象，只输出至多 12 个线程；helper
报告限制 12 KiB，超出先裁剪末尾线程并标记。一次失败、事件丢失、版本不支持、超预算或
采集总耗时超过 5 秒时停止后续自动采集，状态中的 `automaticCaptureStopped=true` 会保留。

主要字段：

| 字段                                                                                      | 含义与边界                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `windowStartedUnixMs` / `observedWindowMs` / `triggerUnixMs`                              | 采集开始、观察到的事件跨度和 WARN 到达原生侧的时间；启动回收没有采集窗口。不能把后续采集当作卡顿现场。                                                                               |
| `threads[].pid` / `tid` / `role`                                                          | UI 和 renderer-main 优先于其他角色，其次 browser/GPU main，再其次 compositor/IO。同优先级包含未结束等待/运行时长，避免裁掉卡住的线程；字节上限裁剪也保留该顺序。角色来自固定白名单。 |
| `runtimeByEfficiencyClassMs` / `runtimeByProcessorMs`                                     | CSwitch 中实际 CPU 的已完成切入/切出区间，不是理想核心或 affinity。起点之前已经在运行的时间不猜测；处理器明细最多八项，可能裁剪，等级汇总仍保留。                                    |
| `runningAtWindowEnd`                                                                      | 窗口末端仍在运行的线程所在处理器、效率等级与已观察运行时长下界，和已完成区间分开记录，避免漏掉长时间没有切出的忙线程。                                                               |
| `readyWaitTotalMs` / `readyWaitMaxMs` / `observedReadyDispatches` / `readyWaitOver16ms`   | ReadyThread（或抢占后 Ready 状态切出）到下一次切入的等待；不把 IO、锁或睡眠时间算作调度等待。16ms 仅是统计阈值。                                                                     |
| `pendingReadyMsLowerBound`                                                                | 截止最后观察时间仍未得到运行机会的 Ready 等待下界；未知 Ready 起点为 `null`。                                                                                                        |
| `processorEfficiencyClasses` / `processorNonIdleScheduledMs`                              | Windows CPU Sets 的 CPU→效率等级，以及非 idle 线程的调度驻留时间和 `coveredMs`。不是完整 CPU 忙碌时间，未校正 DPC/ISR 中断；不能据此反推可用算力或“大核有空却不用”。                 |
| `rendererMainThreads` / `uiThreadTracked` / `inaccessibleThreads` / `threadLimitReached`  | 当前关键线程识别和覆盖情况；采集开始后新建的线程不进入本次跟踪，下一次重新枚举。                                                                                                     |
| `evidenceUsable` / `eventsLost` / `buffersLost` / `unsupportedEvents` / `discontinuities` | 只在存在本应用线程转换、载荷版本受支持、事件序列和 ETW 消费无已知错误且未超预算时将已观察证据标为可用。`true` 不代表覆盖所有线程或整个卡顿时间。                                     |

`interruptTimeAccounted=false`、`availableCpuCapacityKnown=false` 和
`runtimeInterpretation=scheduled-residency-includes-interrupts` 始终明确缺失的中断信息。
已运行线程迟到的同时间戳 Ready 通知不会重新挂上等待；运行/等待状态存在无法消解的矛盾时
`discontinuities` 增加，证据失效，不能据此诊断调度饥饿。

Windows 的效率等级数值越高，表示内在性能较高、能效较低；只有多个等级时才可作相对
快/慢核心对照，不把某个固定数字硬编码成 Intel P/E 核。定义见
[SYSTEM_CPU_SET_INFORMATION](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-system_cpu_set_information)。
调度等待来自 [ReadyThread](https://learn.microsoft.com/en-us/windows/win32/etw/readythread) 与
[CSwitch](https://learn.microsoft.com/en-us/windows/win32/etw/cswitch)，权限限制见
[StartTraceW](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-starttracew)。

这些记录可以确认采集窗口内某个已识别线程实际在哪类核心运行、何时处于 Ready 等待，
但不能据此判断较快核心的实际执行余量，也不能单独证明“小核导致卡顿”。必须先确认窗口
与实际卡顿重合、事件没有丢失、关键线程有覆盖，再结合前后样本及相同工作负载下的对照；
频率、热降频、驱动中断或应用自身工作量仍可能影响结果。日志始终保留
`causality=not-established`，不会自动给出已确认根因或自动绑核的结论。

## 前端异常

`renderer-error-log.ts` 通过同一 IPC 将异常写入 `app.log`，级别为 ERROR、scope 为 `renderer:error`（category 为 workspace）。覆盖 React ErrorBoundary、window error、未处理的 Promise 拒绝和 bridge 就绪后的初始化失败。

记录 source、应用版本、平台、窗口类型、错误名称/消息、JavaScript stack 和 React componentStack。只提取窗口类型，不记录完整 URL 或任意拒绝对象；不自动收集连接配置、终端内容或业务状态。堆栈在生产构建中可能包含压缩符号，但仍保留定位信息。三个错误正文/堆栈字段分别按转义后 UTF-8 3000 字节限制，同来源同内容在 5 秒内去重，React 组件堆栈不会被全局错误去重覆盖。

日志提交是 best-effort：bridge 尚未就绪、写入失败、进程强制退出时可能无法落盘。处理器不更新 React state，不阻止浏览器默认错误处理，也不把所有 console 输出转存为文件日志。

## 范围

诊断 app.log、终端会话 transcript 和 WebView console 是三个不同入口。诊断日志不自动保存终端输出，console 也不会自动归入文件日志。
