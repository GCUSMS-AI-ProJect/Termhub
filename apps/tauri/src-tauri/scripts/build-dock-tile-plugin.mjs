import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  process.exit(0)
}

const sourceDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDirectory = path.join(sourceDirectory, 'target/dock-tile-plugin/TranstermDockTile.docktileplugin')
const contentsDirectory = path.join(pluginDirectory, 'Contents')
const executableDirectory = path.join(contentsDirectory, 'MacOS')
const resourcesDirectory = path.join(contentsDirectory, 'Resources')
const executablePath = path.join(executableDirectory, 'TranstermDockTile')
const architecture = process.env.TAURI_ENV_ARCH ?? process.arch
const targetArchitecture =
  architecture === 'aarch64' || architecture === 'arm64'
    ? 'arm64'
    : architecture === 'x86_64' || architecture === 'x64'
      ? 'x86_64'
      : undefined

if (!targetArchitecture) {
  throw new Error(`Unsupported macOS Dock tile plug-in architecture: ${architecture}`)
}

const minimumVersion = targetArchitecture === 'arm64' ? '11.0' : '10.13'
fs.rmSync(pluginDirectory, { recursive: true, force: true })
fs.mkdirSync(executableDirectory, { recursive: true })
fs.mkdirSync(resourcesDirectory, { recursive: true })

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`)
}

run('xcrun', [
  '--sdk',
  'macosx',
  'clang',
  '-fobjc-arc',
  '-fmodules',
  '-bundle',
  '-arch',
  targetArchitecture,
  `-mmacosx-version-min=${minimumVersion}`,
  '-framework',
  'AppKit',
  '-framework',
  'Foundation',
  path.join(sourceDirectory, 'macos-dock-tile/TranstermDockTile.m'),
  '-o',
  executablePath
])

for (const variant of ['classic', 'material', 'clean']) {
  fs.copyFileSync(
    path.join(sourceDirectory, `../src/renderer/assets/app-icons/dock-${variant}.png`),
    path.join(resourcesDirectory, `dock-${variant}.png`)
  )
}

fs.writeFileSync(
  path.join(contentsDirectory, 'Info.plist'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>CFBundleExecutable</key><string>TranstermDockTile</string>',
    '  <key>CFBundleIdentifier</key><string>com.transterm.desktop.docktile</string>',
    '  <key>CFBundlePackageType</key><string>BNDL</string>',
    '  <key>CFBundleVersion</key><string>1</string>',
    '  <key>NSPrincipalClass</key><string>TranstermDockTilePlugin</string>',
    '</dict>',
    '</plist>',
    ''
  ].join('\n')
)

run('codesign', ['--force', '--sign', '-', '--options', 'runtime', '--timestamp=none', pluginDirectory])
