# TermHub

A desktop remote workspace for developers and operators, combining terminals, remote files, transfers, and an AI assistant.

[Project overview (中文)](./README.md) · [中文使用说明](./README_ZH.md) · [Source repository](https://gitee.com/ai-design-gcusms/termhub)

## Status and attribution

The current source version is `2.3.1-beta.10`. TermHub is based on [St0ff3l/fileterm](https://github.com/St0ff3l/fileterm), sourced through [gcusms/fileterm](https://github.com/gcusms/fileterm), at commit `ef044caa8868d9edbf5eb0165d31865009897b0b`.

Historical build records do not establish a public TermHub release. Use the source instructions below to run or build this checkout. Upstream FileTerm downloads are not TermHub release packages.

The product is named **TermHub**. Internal `transterm` workspace, crate, bridge, theme, and MCP identifiers remain compatible, as does the `com.transterm.desktop` application data identifier. The Windows packaged binary is `TermHub.exe`; the development binary remains `transterm.exe`.

Original copyright, the [MIT license](./LICENSE), and [third-party notices](./THIRD_PARTY_NOTICES.md) are preserved.

## Features

- SSH, local terminals, Telnet, and serial sessions with tabs and split panes.
- SSH host verification, key/password/MFA authentication, proxies, jump hosts, and tunnels.
- SFTP and FTP/FTPS file management, a Monaco editor, and transfer tasks.
- AI conversations, attachments, terminal context, and approved tool execution.
- Bundled REA 6.7.0 analysis tools, disabled by default.
- Themes, connection groups, a key library, device-bound credential encryption, session locking, and encrypted WebDAV/S3 backups.

Capabilities depend on the protocol and host. REA does not include a model: configure a model provider supporting tool calls. Additional analysis engines require their own dependencies. See the [REA guide](./docs/rea.md).

## Development

Requirements:

- Node.js 22.x starting at 22.19, 24.x starting at 24.11, or 26 and later.
- npm, Rust stable, and the native Tauri v2 build dependencies for the target platform.
- Windows: MSVC C++ Build Tools, Windows SDK, WebView2 Runtime, and NASM; `cargo` and `nasm` must be on PATH.
- macOS: Xcode Command Line Tools.
- Linux: GTK and WebKitGTK 4.1 development dependencies; see the [installation guide](./docs/installation/en-US.md).

Run commands from the repository root:

```powershell
git clone https://gitee.com/ai-design-gcusms/termhub.git
cd termhub
npm ci
npm run dev
```

For an existing checkout, start with `npm ci`. Development automatically builds shared packages and prepares the bundled REA runtime. Initial setup downloads npm dependencies and desktop execution requires a graphical session. REA resources are specific to the Node.js version, operating system, and architecture used to prepare them.

For browser preview only:

```powershell
npm run build:packages
npm run dev:renderer -w @transterm/tauri
```

The default development URL is `http://localhost:5188`. Browser preview does not provide real SSH/SFTP or native desktop capabilities.

## Validation and packaging

```powershell
npm run typecheck
npm run lint
npx prettier --check apps/tauri packages/core packages/shared packages/storage
npm run test:renderer -w @transterm/tauri
npm run test:tauri
cargo clippy --manifest-path apps/tauri/src-tauri/Cargo.toml --locked --all-targets --all-features -- -D warnings
```

Build a local Windows NSIS installer without updater signing:

```powershell
npm run build:win
```

The executable is generated at `apps/tauri/src-tauri/target/release/TermHub.exe`; the installer is under the adjacent `bundle/nsis/` directory. When distributing the executable directly, include the complete adjacent `rea/` runtime and license files.

Other build entry points are `npm run build`, `npm run release:mac`, `npm run release:win`, and `npm run release:linux`. They require the appropriate native toolchain and release configuration. Automated checks do not replace testing packaged applications and real connections.

When distributing an EXE directly or using `--no-bundle`, check native DLL dependencies as well. The locally verified Windows GNU build requires an adjacent `WebView2Loader.dll`, separately from the WebView2 Runtime. See the [Windows startup record (中文)](./docs/quality/windows-local-startup.md) for the fix, bundled runtime setup, and verification limits.

## Publishing and updates

This repository is hosted on Gitee. The retained `.github/workflows/` files are GitHub Actions workflows and do not run automatically on Gitee pushes.

The Windows updater configuration still points to `gcusms/fileterm` and has an empty `plugins.updater.pubkey`. A TermHub signed update channel requires the publisher's own public key, update endpoint, and `TAURI_SIGNING_PRIVATE_KEY` in the release environment. Never commit the private key.

Packaging workflows describe supported build paths, not available public releases. Configure the publishing destination and complete platform acceptance before distributing packages. These documentation changes do not change runtime update endpoints.

## Architecture and contribution

The application lives in `apps/tauri`. React calls the typed bridge, which invokes Rust commands, services, and protocol sessions. Shared domain contracts live in `packages/core`; SSH patches live in `vendor/russh`.

See the [architecture](./docs/architecture.md), [agent guide](./AGENTS.md), [release acceptance plan](./docs/plans/active/release-candidate-acceptance.md), and [Chinese guide](./README_ZH.md) for details. Report issues in the [TermHub repository](https://gitee.com/ai-design-gcusms/termhub) with the platform, version, reproduction steps, and redacted logs.
