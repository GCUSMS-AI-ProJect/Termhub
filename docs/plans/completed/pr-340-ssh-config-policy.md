# PR #340 SSH 配置策略修补

修补范围限于 Rust SSH config 解析、会话认证和主机密钥校验。

- 保留 `StrictHostKeyChecking yes`，先校验 known_hosts，拒绝未知或变更密钥；已保存的 FileTerm 指纹不能绕过该策略。
- 区分未配置 IdentityFile 和显式 IdentityFile（包括 none、缺失文件），仅前者允许在 agent 认证结束后回退默认私钥；保持作者原有的 IdentitiesOnly 限制及 agent 身份尝试顺序。
- 按 OpenSSH 规则处理 ProxyCommand / ProxyJump 先后顺序，包括 none 边界。
- 添加配置、密钥加载、主机信任策略回归测试，运行仓库质量门禁后向原 PR 追加提交。

不增加 ProxyCommand 执行能力，不变更 renderer 或凭据存储。

## 验证

- `npm run typecheck`、`npm run lint`、仓库指定范围的 Prettier 检查通过。
- Renderer 测试：120 项通过。
- Rust Clippy：`--locked --all-targets --all-features -- -D warnings` 通过。
- 使用本机 `ssh -G` 核对 ProxyCommand / ProxyJump 和 none 的优先级。
- 未进行桌面 UI 手动操作或生产远端连接验证；本次修改不涉及 renderer。
- 本地全量 Rust 测试发现原 PR 的 agent 集成测试在 macOS 下 socket 路径为 116 字节，超过 Unix socket 路径限制。测试改用 `/tmp` 下权限 0700 的短目录，并以 Drop 保证 panic 时也清理 agent 进程与目录。
- 修复测试 socket 路径后，`npm run test:tauri` 全量通过（809 项单元测试及 33 项集成测试）；真实 sshd + ssh-agent 集成测试通过，新增的 6 项回归测试通过。再次运行 Clippy 通过。

实现与本地验证已完成，作为原 PR 的追加提交交付。

## 收窄默认密钥修补范围

按用户要求撤回额外的默认身份加载行为：agent 筛选前仍仅加载显式 IdentityFile；默认私钥仅在原有条件满足时于 agent 认证结束后作为回退，额外增加显式 IdentityFile 禁止默认回退的限制。未配置 IdentityFile 的 IdentitiesOnly yes 行为及 agent 尝试顺序恢复原实现。测试同时覆盖默认公钥存在时的 agent 顺序、IdentitiesOnly 限制与 none/缺失显式文件的禁止回退策略。

收窄范围后再次通过全部本地门禁：类型、lint、Prettier、120 项 renderer 测试、809 项 Rust 单元测试及 33 项集成测试、全目标全 feature Clippy。另与作者原始提交逐段比较，确认显式身份加载函数、agent 排序代码、私钥回退前的认证流程完全一致。
