# transterm initial fork

Implementation completed on 2026-10-20. Native validation is pending the local
Rust/MSVC toolchain; no desktop installer was produced or published.

## Source

- gcusms/fileterm: `ef044caa8868d9edbf5eb0165d31865009897b0b`, version `2.3.1-beta.10`.
- gcusms/rea: `90e433df06b3f83417176b8db1b0a905f9df1d3a`, source version `6.7.0`.
- Original worktrees remain in `fileterm-upstream/` and `rea-upstream/`, excluded
  from this application's Git tree. Both reference worktrees are unchanged.

## Result

Copied the fileterm source into the workspace root and renamed the product to
`transterm`. Updated npm packages/imports, Rust crate names, app IDs, CLI names,
data namespaces, window/menu labels, themes and packaging references consistently.
Preserved original artwork, layout, protocol implementations, credential encryption
format markers, original authorship and third-party licenses.

Runtime update/project links now use the existing gcusms/fileterm fork. Removed the
upstream Windows update public key; signed releases require the fork's own keys.
REA is an independent source reference, with no installation or MCP registration.

This mechanical rename preserves the requested copy. It does not split or
restructure unrelated files, including existing large source files.

## Verification

- Locked npm install: 324 packages installed successfully.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npx prettier --check apps/tauri packages/core packages/shared packages/storage`: passed.
- `npm run test:renderer -w @transterm/tauri`: 155 passed, zero failures/skips.
- `npm run build:renderer -w @transterm/tauri`: passed; bundled font check verified
  64 fonts, Monaco Codicons, CSS references and packaged licenses.
- Project CSS contract: passed before and after the rename, with the same
  nonblocking legacy warnings (11 `!important` uses and approximately six direct
  color values in legacy styles).
- All 96 original bitmap/font/icon assets are byte-identical after path mapping.
- Vendor source is byte-identical; LICENSE and third-party notice contents are
  preserved, allowing checkout line-ending normalization.
- Git object/connectivity checks and `git diff --check`: passed.

Windows Git initially checked out CRLF text, which failed the project's LF format
rules. Normalized working text to LF and configured this repository's local Git
checkout settings without changing global Git configuration.

## Unverified

Follow-up: the Windows toolchain is now installed, native compilation and NSIS
packaging succeeded, and the desktop startup was verified. See
[Windows native build](windows-native-build.md) for the current results; the
initial limitations below describe the first rename-only pass.

`npm run test:tauri`, Cargo Clippy and `npm run build` could not run successfully
because `cargo` is unavailable. Windows desktop startup, native menu/tray behavior,
real remote connections and signed updates need native build/runtime validation.
macOS and Linux native behavior was not tested on this Windows host.

The browser preview is available through
`npm run dev:renderer -w @transterm/tauri`; it is a renderer preview and does not
provide Tauri's SSH/SFTP or local system capabilities.
