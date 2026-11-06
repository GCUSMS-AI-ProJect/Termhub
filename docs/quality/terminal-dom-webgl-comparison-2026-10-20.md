# DOM / WebGL 终端对照：2026-10-20

这是独立 Chrome 终端夹具的对照，不是完整 transterm 或 Windows WebView2 的现场复现。
应用默认仍为 DOM；没有加入生产 WebGL 依赖、开关或自动切换。

## 环境与范围

- 生产适配器基于提交 `1d6f0e97`；xterm `6.0.0`，实验插件 `@xterm/addon-webgl@0.19.0`。
- MacBookPro18,3 / Apple M1 Pro，8 个逻辑 CPU、16 GiB 统一内存；macOS 27.0.1
  （26A434），Chrome 155.0.8059.80，headless，ANGLE Metal 硬件加速。夹具拒绝
  SwiftShader / llvmpipe 等软件路径，并验证 WebGL 插件确实接管 renderer。
- 1600×1200 viewport、DPR=1；10 个可见终端，每个 90×10 格、6,000 行历史上限。
  JetBrains Mono 14px，line-height=1.05；中文使用系统 fallback。先写入 6,500 行，
  确认每个普通缓冲区保持 6,010 行，再预热 200 批、GC，随后开始测量。
- 两组共享 Unicode 11、emoji 宽度、对比度/字宽缓存限制、默认前景适配、日志着色和
  同一套解析/ACK 流控。DOM 保留符号、框线和选区适配；WebGL 用插件自身字形/选区
  渲染。同网格复测对生产 DOM 适配器组合做了测试专用归一化；不能把全部收益归因于 GPU 硬件。
- 每轮固定 4,000 批、7,398,010 个 UTF-8 输出字节。内容包含全屏擦除、光标移动、
  中文、符号、长横线和计数；4 批在途信用，解析完成才确认，保持既有输出语义。
  这是 CC 式合成重绘，不是录制的 Claude Code 会话；未覆盖网络、SSH 或模型推理。
- 常速和 CDP 6 倍 CPU 降速各三轮，按 DOM/WebGL、WebGL/DOM、DOM/WebGL 顺序执行。
  每轮启动独立浏览器，未并行运行构建/测试。6 倍降速不等同 Windows 节能/效率模式，
  也不会以相同比例限制 GPU。对照夹具允许 180 秒以取得完整结果；既有输出背压回归的
  120 秒门限未改。这里额外固定真实字体、满历史和连续终端键盘探针，与此前 87 秒夹具
  的负载不同，不能把两次耗时直接当作同一基准的前后变化。

## 计量方法

CPU 使用 [CDP SystemInfo.getProcessInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/#method-getProcessInfo)
的进程累计 CPU 秒差，包含浏览器、renderer、GPU 进程等。表中的 CPU 时间是完成同一工作
消耗的总 CPU 时间，不是任务管理器的瞬时百分比，也不是 GPU 利用率或功耗。

内存每秒通过 `ps` 读取该独立浏览器所有进程的 RSS，并分别记录 renderer/GPU 峰值。
RSS 合计可能重复计算共享页，不能当作私有提交量、准确物理内存或专用显存。
同时保留 JS 堆和 [Runtime.getHeapUsage](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage)
的 backing storage（包括 ArrayBuffer 等）数据，避免把 JS 堆误当作总内存。
图集按每个 WebGL context 的 RGBA 尺寸估算，另列共享 canvas；该估算不覆盖 framebuffer、
驱动和其他 GPU 分配，不能再与 RSS 简单相加。

输入探针约每 250ms 通过真实键盘事件向首个终端发送 `x`，经 xterm `onData` 本地回显，
记录事件时间到 handler、解析完成及下一次 rAF 的间隔。下一帧只是绘制机会，不代表最终
GPU 提交/屏幕扫描完成，也不包含远端响应。另存自动化调用耗时，未将其混入浏览器侧延迟。
三轮分别计算 p95 后取中位数，避免慢组因样本更多而在汇总中获得更高权重。

## 网格校准：2026-10-20 补充

已定位截图中约 5% 的格宽差异：xterm 6 DOM 保留浮点字符宽度，WebGL 0.19 对
`measuredWidth × DPR` 向下取整。14px JetBrains Mono 的原始测量均为约 8.399994px，
但 DPR=1、90 列时 DOM 画布宽 756px、WebGL 为 720px。字体已经加载，不能通过
再次加载字体消除这种后端策略差异，也不能把旧结果称为同像素网格比较。

校准只放在 `tests/browser/helpers/terminal-grid-calibration.mjs`：实验 DOM 在计算布局
期间使用与 WebGL 一致的物理像素格宽，随后立即恢复原始测量；字体族、字号、字宽缓存
和生产 DOM 均不修改。两侧 CSS 格宽/格高从实际取整后的画布尺寸除以列数/行数取得，
让 FitAddon、鼠标命中和选区使用相同的显示网格，不拉伸 WebView 或直接覆盖截图宽度。
钩子在字号、字体、DPI 和 resize 的正常重算链路执行，移除或失败时恢复原方法。
这是实验基线归一化，不是把整数格宽接入已发布的 DOM 运行时。

同时补齐性能夹具遗漏的 `terminal-host` 类，并断言生产 `text-spacing-trim: space-all` /
`text-autospace: no-autospace` 规则实际生效；之前只是加载了 CSS，缺少作用域。旧对照
数据因此还包含这个夹具差异，复测不沿用它们。

浏览器回归 `terminal-renderer-font-grid.mjs` 已通过 52 组检查：DPR 1/1.1/1.25/1.5/2，
JetBrains Mono 与导入字体、12/13.65/14/16/24px，字体延迟加载及恢复默认 DPI/字体。
格宽、格高、画布尺寸和 FitAddon 列/行数的两组最大差值为零；物理格宽浮点差值最大
3.56e-15px。中文/全角标点、组合字符、emoji 占格与选区文本一致，实际 DOM 边界误差
最大 0.176 CSS px；首列、中间列和末列鼠标命中正确。延迟字体加载前后两组均从
54 列变为 32 列，且与新建终端一致。还验证失败时原始字体测量可恢复。

### 同网格性能对照

两组在 14px、DPR=1 时均使用 8×18px 单元格、720×180px 画布，原始字体测量仍为
8.399994px。以下为常速和 6 倍降速各三轮中位数，字体、数据量和实际网格均一致：

| 指标                        | 常速 DOM | 常速 WebGL | 6 倍降速 DOM | 6 倍降速 WebGL |
| --------------------------- | -------: | ---------: | -----------: | -------------: |
| 4,000 批完成时间（秒）      |    22.35 |      10.47 |       154.20 |          45.62 |
| CPU 总时间（秒）            |    31.10 |       9.52 |       172.97 |          51.12 |
| 平均 CPU（单核=100%）       |   140.02 |      90.90 |       112.17 |         112.04 |
| 主线程布局时间（秒）        |    2.803 |      0.004 |       21.058 |          0.109 |
| 进程 RSS 采样峰值（MiB）    |  1433.27 |    1254.81 |      1361.39 |        1251.42 |
| renderer RSS 峰值（MiB）    |   846.48 |     657.25 |       779.81 |         657.33 |
| GPU 进程 RSS 峰值（MiB）    |   164.48 |     179.53 |       160.03 |         174.97 |
| JS 堆采样峰值（MiB）        |    54.01 |      37.62 |        41.78 |          37.35 |
| 结束后 GC 的 JS 堆（MiB）   |    19.44 |      19.69 |        19.52 |          19.71 |
| backing storage 峰值（MiB） |    71.21 |      75.42 |        71.15 |          77.11 |
| 事件分派 p95（ms）          |    13.90 |       1.60 |        66.90 |          10.10 |
| 输入至解析完成 p95（ms）    |    21.30 |      17.10 |        83.50 |          44.00 |
| 输入至下一 rAF p95（ms）    |    35.30 |      32.20 |       116.20 |          54.80 |

12 轮均完整确认 4,000 批，待解析字符/回调/xterm 待写字节最终为零，context loss 和
着色失败均为零。持续饱和时两组仍可能接近满核；CPU 总时间是同样工作消耗的累计时间，
不能当作瞬时 CPU 百分比的降幅。所有截图在测量结束后保存，并核对了中文、符号和横线。

WebGL 图集的每 context RGBA 估算合计仍为 10 MiB，共享 canvas 为 1 MiB；不包含全部
GPU/驱动分配。两组结束后 GC 的 JS 堆相近，而 RSS 包含浏览器、共享页和缓存，不能把
短测峰值差直接解释成长时间常驻内存或现场泄漏的变化。销毁终端后两组均回到 21 个 DOM
节点、约 1 MiB backing storage；浏览器 RSS 不同步归零。

同网格的实验 DOM 对部分符号需要更多拟合节点，不能把它相对旧数据的耗时增加解释为
生产 DOM 回归。后端仍有绘制/字形处理差异，这里并不要求两个后端的字形抗锯齿逐像素相同。

| 降速 | 后端  | 轮次 | 耗时 s |  CPU s | RSS 峰值 MiB | GPU RSS MiB | 下一帧 p95 ms | 输入样本 |
| ---- | ----- | ---: | -----: | -----: | -----------: | ----------: | ------------: | -------: |
| 1    | dom   |    1 |  22.35 |  30.78 |      1433.27 |      164.19 |         35.30 |       86 |
| 1    | webgl |    1 |  10.19 |   9.52 |      1249.34 |      174.70 |         32.20 |       40 |
| 1    | webgl |    2 |  10.70 |   9.54 |      1254.81 |      180.25 |         33.50 |       42 |
| 1    | dom   |    2 |  22.21 |  31.10 |      1437.00 |      164.48 |         34.90 |       85 |
| 1    | dom   |    3 |  22.45 |  31.85 |      1428.27 |      165.28 |         41.20 |       86 |
| 1    | webgl |    3 |  10.47 |   9.52 |      1255.59 |      179.53 |         25.70 |       41 |
| 6    | dom   |    1 | 155.55 | 174.44 |      1361.39 |      161.36 |        116.20 |      524 |
| 6    | webgl |    1 |  46.55 |  52.14 |      1251.97 |      181.50 |         54.80 |      179 |
| 6    | webgl |    2 |  45.62 |  51.12 |      1249.69 |      172.30 |         60.10 |      175 |
| 6    | dom   |    2 | 154.20 | 172.97 |      1392.03 |      160.03 |        119.50 |      521 |
| 6    | dom   |    3 | 145.55 | 163.83 |      1356.98 |      158.77 |        106.40 |      508 |
| 6    | webgl |    3 |  43.59 |  49.06 |      1251.42 |      174.97 |         52.50 |      168 |

[校准后的逐轮汇总与字体校验](terminal-dom-webgl-comparison-2026-10-20-calibrated.json)
包含源文件 SHA-256、网格、CPU/内存/交互数据和检查状态。完整采样为
`/tmp/transterm-renderer-comparison-calibrated.json`，SHA-256 写入汇总；未混入先前被中断的
不完整试跑或未校准的历史数据。

### 历史：未校准网格的对照

以下数据保留为最初的当前 DOM 栈/原生 WebGL 栈对照，网格像素面积不同。
完整数值仍保存在 [原始逐轮汇总](terminal-dom-webgl-comparison-2026-10-20.json)。

| 条件     | DOM 完成时间 | WebGL 完成时间 | DOM / WebGL CPU 秒 | DOM / WebGL 下一帧 p95 |
| -------- | -----------: | -------------: | -----------------: | ---------------------: |
| 常速     |       19.11s |         10.44s |       28.07 / 9.60 |          36.4 / 29.1ms |
| 6 倍降速 |      126.29s |         47.04s |     143.85 / 52.56 |         106.2 / 56.9ms |

旧的完整采样位于 `/tmp/transterm-renderer-comparison-full.json`，SHA-256 已写入原始汇总。
这两种条件的旧数据不能与同网格对照混算中位数，也不能据旧结果宣称已消除了网格差异。

## 复现

性能夹具：`apps/tauri/tests/browser/terminal-renderer-comparison.mjs`，默认执行同网格校准。
字体/DPI 回归：`apps/tauri/tests/browser/terminal-renderer-font-grid.mjs`，沿用相同插件和
Playwright 环境变量运行；原始断言输出保存到 `/tmp/transterm-renderer-font-grid.json`。
插件只下载到临时目录，不修改根依赖或 lockfile：

```bash
mkdir -p /tmp/transterm-webgl-bench
npm pack @xterm/addon-webgl@0.19.0 --pack-destination /tmp/transterm-webgl-bench
tar -xzf /tmp/transterm-webgl-bench/xterm-addon-webgl-0.19.0.tgz -C /tmp/transterm-webgl-bench
TRANSTERM_WEBGL_BUNDLE=/tmp/transterm-webgl-bench/package/lib/addon-webgl.js \
TRANSTERM_COMPARISON_OUTPUT=/tmp/transterm-dom-webgl.json \
PLAYWRIGHT_MODULE_PATH=/path/to/playwright \
PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node apps/tauri/tests/browser/terminal-renderer-comparison.mjs
```

插件 tarball 的 npm SHA-512 integrity：
`sha512-b3fMOsyLVuCeNJWxolACEUED0vm7qC0cy4wRvf3oURSzDTYVQiGPhTnhWZwIHdvC48Y+oLhvYXnY4XDXPoJo6A==`。
原始 JSON 每轮完成后保存进程采样、输入样本和检查结果；轮数/降速可通过
`TRANSTERM_COMPARISON_REPEATS` / `TRANSTERM_COMPARISON_SLOWDOWNS` 指定。
该脚本的 RSS 采样限定 macOS，硬件断言当前限定 Apple Metal；移到 Windows 前需
替换采样实现和硬件断言，不能直接沿用这些内存数字。

## 边界

没有改变应用默认 renderer。尚未验证 Windows WebView2 的普通/节能模式、数小时真实 CC、
完整 transterm 的输入法、搜索、原生选区和挂起恢复。DPI/字体网格已由浏览器夹具覆盖，
尚未代替原生 WebView 的平台验收。短时合成回放不能证明
现场泄漏已经解决，也不能据此承诺 WebGL 在所有机器上更省内存。

## 仓库验证

校准后已通过 `npm run typecheck`、`npm run lint`、全范围 Prettier、155 项 renderer
测试、879 项 Rust/contract 测试、全 target/feature 严格 Clippy、`cargo fmt --check`
及 `git diff --check`。另完成 52 组真实浏览器字体/DPI 回归和 12 轮同网格性能对照。
生产终端默认值和依赖保持不变；未执行 Windows 原生验收或数小时真实 CC 负载。
