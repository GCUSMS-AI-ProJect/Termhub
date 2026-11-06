import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = join(root, 'scripts/verify-linux-icon-files.py')
const python = process.platform === 'win32' ? 'python' : 'python3'

test('Linux package verification checks installed launchers and portable AppImage entries', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'transterm-package-icons-'))
  const put = (path, contents) => {
    const target = join(fixture, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, contents)
  }
  const run = (...args) => {
    const result = spawnSync(python, [script, fixture, ...args], { encoding: 'utf8' })
    assert.ifError(result.error)
    return result
  }
  try {
    for (const [destination, source] of [
      ['usr/share/pixmaps/transterm.png', 'app/linux/128x128.png'],
      ['usr/share/pixmaps/com.transterm.desktop.png', 'app/linux/128x128.png'],
      ['usr/share/icons/hicolor/32x32/apps/transterm.png', 'app/linux/32x32.png'],
      ['usr/share/icons/hicolor/128x128/apps/transterm.png', 'app/linux/128x128.png'],
      ['usr/share/icons/hicolor/256x256@2/apps/transterm.png', 'app/linux/128x128@2x.png']
    ]) {
      put(destination, readFileSync(join(root, 'src-tauri/icons', source)))
    }
    for (const name of ['transterm.desktop', 'com.transterm.desktop.desktop']) {
      put(`usr/share/applications/${name}`, readFileSync(join(root, 'src-tauri/linux', name)))
    }
    assert.equal(run().status, 0)
    const icon = 'usr/share/pixmaps/transterm.png'
    const expected = readFileSync(join(fixture, icon))
    put(icon, Buffer.from('stale icon'))
    assert.match(run().stderr, /Stale or modified package icon/)
    put(icon, expected)
    const companion = 'usr/share/applications/com.transterm.desktop.desktop'
    const desktop = readFileSync(join(fixture, companion), 'utf8')
    put(companion, desktop.replace('Exec=/usr/bin/transterm %U', 'Exec=/usr/lib/transterm/runtime/transterm %U'))
    assert.match(run().stderr, /Incorrect Exec/)
    put(companion, desktop.replace('NoDisplay=true', 'NoDisplay=false'))
    assert.match(run().stderr, /Incorrect launcher visibility/)
    put(companion, desktop.replaceAll('\n', '\r\n'))
    assert.match(run().stderr, /must use LF line endings/)
    rmSync(join(fixture, companion))
    assert.notEqual(run().status, 0)

    put(companion, desktop)
    assert.match(run('--appimage').stderr, /Incorrect Exec/)
    const config = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.release.linux.conf.json'), 'utf8'))
    for (const name of ['transterm.desktop', 'com.transterm.desktop.desktop']) {
      const source = config.bundle.linux.appimage.files[`/usr/share/applications/${name}`]
      put(`usr/share/applications/${name}`, readFileSync(join(root, 'src-tauri', source)))
    }
    const appimageDesktop = readFileSync(join(fixture, 'usr/share/applications/transterm.desktop'))
    put('transterm.desktop', appimageDesktop)
    const rootIcon = readFileSync(join(root, 'src-tauri/icons/app/linux/128x128@2x.png'))
    put('transterm.png', rootIcon)
    put('.DirIcon', rootIcon)
    for (const executable of ['AppRun', 'AppRun.wrapped', 'usr/bin/transterm']) put(executable, 'fixture executable')
    assert.equal(run('--appimage').status, 0)

    put('com.transterm.desktop.desktop', desktop)
    assert.match(run('--appimage').stderr, /exactly one root desktop entry/)
    rmSync(join(fixture, 'com.transterm.desktop.desktop'))
    put('transterm.desktop', Buffer.concat([appimageDesktop, Buffer.from('# stale root entry\n')]))
    assert.match(run('--appimage').stderr, /root desktop entry differs/)
    put('transterm.desktop', appimageDesktop)
    put('transterm.png', expected)
    assert.match(run('--appimage').stderr, /bundled 256px icon/)
    put('transterm.png', rootIcon)
    rmSync(join(fixture, 'usr/bin/transterm'))
    assert.match(run('--appimage').stderr, /AppDir executable is missing/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
