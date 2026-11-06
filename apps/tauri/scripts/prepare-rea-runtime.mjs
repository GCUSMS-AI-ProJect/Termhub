import { cp, copyFile, mkdir, readFile, access, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(app, 'rea-runtime')
const destination = join(app, 'src-tauri/resources/rea')
const [major, minor] = process.versions.node.split('.').map(Number)
if (!((major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26)) {
  throw new Error('Bundled REA requires Node.js 22.19+, 24.11+ or 26+')
}
const packageJson = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
const version = packageJson.dependencies['rea-agents']
const marker = join(destination, 'runtime.json')
const lock = createHash('sha256')
  .update(await readFile(join(source, 'package-lock.json')))
  .digest('hex')
const expected = { version, node: process.versions.node, platform: process.platform, arch: process.arch, lock }
try {
  const current = JSON.parse(await readFile(marker, 'utf8'))
  await access(join(destination, 'node_modules/rea-agents/dist/mcp/main.js'))
  await access(join(destination, process.platform === 'win32' ? 'node.exe' : 'node'))
  if (JSON.stringify(current) === JSON.stringify(expected)) process.exit(0)
} catch {
  // First build prepares an isolated runtime. No global npm install or agent setup.
}
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
await access(npmCli)
const install = spawnSync(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: source,
  stdio: 'inherit',
  windowsHide: true
})
if (install.status !== 0) throw new Error('Failed to install the locked REA runtime')
await mkdir(destination, { recursive: true })
await cp(join(source, 'node_modules'), join(destination, 'node_modules'), {
  recursive: true,
  filter: (path) => !path.split(/[\\/]/).includes('.bin')
})
await copyFile(process.execPath, join(destination, process.platform === 'win32' ? 'node.exe' : 'node'))
// Redistribute the runtime license alongside the executable.
try {
  await copyFile(join(dirname(process.execPath), 'LICENSE'), join(destination, 'NODE-LICENSE.txt'))
} catch {
  const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`)
  if (!response.ok) throw new Error(`Unable to obtain Node.js license: HTTP ${response.status}`)
  const license = await response.text()
  if (!license.includes('Node.js is licensed')) throw new Error('Unexpected Node.js license content')
  await writeFile(join(destination, 'NODE-LICENSE.txt'), license)
}
await writeFile(marker, `${JSON.stringify(expected, null, 2)}\n`)
console.log(`Prepared REA ${version} with Node.js ${process.versions.node} (${process.platform}/${process.arch})`)
