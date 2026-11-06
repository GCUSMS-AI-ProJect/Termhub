/* global window, document */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const duration = Number(process.env.TRANSTERM_SOAK_MS || 60000)
assert.ok(Number.isFinite(duration) && duration >= 1000)
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'transterm-workspace-soak-')))
const root = fileURLToPath(new URL('../../../../', import.meta.url)).replaceAll('\\', '/')
const hookPath = root + 'apps/tauri/src/renderer/hooks/use-workspace-ipc-sync.ts'
const baselineSource =
  process.env.TRANSTERM_PERF_BASELINE === '1'
    ? execFileSync(
        'git',
        [
          'show',
          `${process.env.TRANSTERM_PERF_BASELINE_REF || 'HEAD'}:apps/tauri/src/renderer/hooks/use-workspace-ipc-sync.ts`
        ],
        { cwd: root, encoding: 'utf8' }
      )
    : null
writeFileSync(join(directory, 'index.html'), '<div id="root"></div><script type="module" src="/fixture.tsx"></script>')
writeFileSync(
  join(directory, 'fixture.tsx'),
  `
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { Terminal } from '${root}node_modules/@xterm/xterm'
import { TerminalView } from '${root}apps/tauri/src/renderer/components/terminal-view'
import { TransferCenter } from '${root}apps/tauri/src/renderer/features/transfers/transfer-center'
import { useAppShellState } from '${root}apps/tauri/src/renderer/hooks/use-app-shell-state'
import monoRegular from '${root}apps/tauri/src/renderer/assets/fonts/text/jetbrains-mono/JetBrainsMono-400.ttf?url'
import monoBold from '${root}apps/tauri/src/renderer/assets/fonts/text/jetbrains-mono/JetBrainsMono-700.ttf?url'
import cjk from '${root}apps/tauri/src/renderer/assets/fonts/text/noto-sans-sc/NotoSansSC-Variable.ttf?url'
import { emptyState } from '${root}apps/tauri/src/renderer/app/app-data'
import { createTerminalOutputDelivery } from '${root}apps/tauri/src/bridge/events/terminal-output'
const noop = () => {}
const subscriptions = new Map()
const subscribe = (name, callback) => {
 let listeners = subscriptions.get(name)
 if (!listeners) subscriptions.set(name, listeners = new Set())
 listeners.add(callback)
 return () => listeners.delete(callback)
}
const emit = (name, value) => { for (const listener of subscriptions.get(name) || []) listener(value) }
const monitoring = {generation:1,revision:1,phase:'healthy',attempt:0,maxAttempts:5,intervalSeconds:1}
const metrics = {cpuPercent:8,memoryPercent:10,swapPercent:0,networkInterfaces:['all'],activeNetworkInterface:'all',networkSamples:[],fileSystemRows:[]}
const ids = Array.from({length:10},(_,index)=>'tab-'+index)
const snapshot = {...emptyState,activeTabId:ids[0],tabs:ids.map(id=>({id,profileId:id,title:id,sessionType:'ssh',status:'connected',layout:'terminal-file'})),sessions:Object.fromEntries(ids.map(id=>[id,{profileId:id,connected:true,remotePath:'/',remoteFiles:[],capabilities:{resourceMonitoring:true},monitoring,systemMetrics:metrics}]))}
window.transterm = new Proxy({
 platform:'win32',appVersion:'soak',getSnapshot:()=>new Promise(resolve=>{window.releaseSnapshot=()=>resolve(snapshot)}),
 getUiStateItem:async()=>null,setUiStateItem:async()=>{},setUiPreferences:async()=>{},
 getUiPreferences:async()=>({terminalZoomLocked:false}),getSecuritySettings:async()=>({lockEnabled:false,idleLockMinutes:0}),
 listImportedFonts:async()=>[],listLocalDirectory:async()=>({path:'/tmp',items:[]}),isCurrentWindowMaximized:async()=>false,
 resizeTerminal:async()=>{},writeTerminal:async()=>{},writeDiagnosticLog:async()=>{},
 onWorkspaceSnapshot:async callback=>subscribe('snapshot',callback),
 onTerminalData:callback=>subscribe('terminal',callback),
 onTransferUpdate:callback=>subscribe('transfer',callback),
 onSessionMetrics:callback=>subscribe('metrics',callback)
}, {get(target,key){if (key in target) return target[key];if(String(key).startsWith('on'))return callback=>subscribe(key,callback)}})
window.terminals = []
const open = Terminal.prototype.open
Terminal.prototype.open = function(...args) {
 window.terminals.push(new WeakRef(this))
 return open.apply(this,args)
}
const appRoot = createRoot(document.getElementById('root'))
window.mount = () => appRoot.render(<Fixture/>)
window.unmount = () => {appRoot.render(null);window.replaceTerminals=null;window.currentHistory=null}
function Fixture() {
 const shell=useAppShellState({searchParams:new URLSearchParams(),initialUiPreferences:{},desktopApi:window.transterm,isConnectionFormWindow:false,isMainWorkspaceWindow:true,isConnectionManagerWindow:false,rendererPlatform:'win32'})
 const [generation,setGeneration]=useState(0)
 window.replaceTerminals = () => setGeneration(n=>n+1)
 window.currentHistory = shell.workspace.transfers
 return <><input id="input"/><button id="button" onClick={()=>window.clicks++}>click</button><output id="history">{shell.workspace.transfers.length}</output><main style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)'}}>{ids.map((id,index)=><div key={generation+id} style={{height:160,minWidth:0}}><TerminalView profileId={id} tabId={id} sessionType="ssh" connected isActive={index<4} bootText="" onActivate={noop} onStatus={noop}/></div>)}</main><TransferCenter activeProfileId={ids[0]} activeTabId={ids[0]} activeTabStatus="connected" desktopApi={window.transterm} fullWidth isPending={false} onApplySnapshot={shell.applySnapshot} onError={noop} sessionTabs={snapshot.tabs} transfers={shell.workspace.transfers} visible/></>
}
window.clicks=0;window.sent=0;window.acked=0;window.maxPending=0;window.maxHistory=0
window.completeHydration = () => {
 for(let index=0;index<50000;index++)emit('transfer',{id:'active-'+(index%8),direction:'upload',name:'active',status:'running',resumable:true,progress:index%100,updatedAt:0})
 for(let index=0;index<500;index++)emit('transfer',{id:'bootstrap-'+index,direction:'upload',name:'done',status:'done',resumable:false,progress:100,updatedAt:0})
 window.releaseSnapshot();window.releaseSnapshot=null
}
window.mounted = () => subscriptions.get('terminal')?.size === 10 && subscriptions.get('metrics')?.size === 1
let sequence=0, stopped=true, timer
const delivery = createTerminalOutputDelivery(new Set([payload=>Promise.all([...subscriptions.get('terminal')||[]].map(listener=>listener(payload))).then(()=>{})]),async()=>{window.acked++},noop)
window.prefill = async () => {
 const data = 'info worker: ready 中文 123ms\\r\\n'.repeat(6200)
 for (const tabId of ids) {
  for (let offset=0;offset<data.length;offset+=16384) {
   while(window.sent-window.acked>=4)await new Promise(resolve=>setTimeout(resolve,0))
   const deliveryId=window.sent++
   delivery({tabId,deliveryId,chunk:data.slice(offset,offset+16384)})
  }
 }
 while(window.sent!==window.acked)await new Promise(resolve=>setTimeout(resolve,0))
}
window.start = () => {
 stopped=false
 const pump=()=>{
  if(stopped)return
  for(let count=0;count<4 && window.sent-window.acked<4;count++){
   const batch=window.sent++,index=batch%6
   const chunk=index<4?'\\x1b[H'+Array.from({length:6},(_,row)=>'\\x1b['+(row+1)+';1H\\x1b[38;2;'+(batch%255)+';180;120m▢ 中文 é ✻ ⚠️• '+batch+' '+('─'.repeat(40))+'\\x1b[0m').join(''):'info worker: ready 中文 '+batch+'\\r\\n'.repeat(1)
   delivery({tabId:ids[index],deliveryId:batch,chunk})
   window.maxPending=Math.max(window.maxPending,window.sent-window.acked)
  }
  if(sequence%10===0){
   for(let index=0;index<10;index++)emit('metrics',{tabId:ids[index],monitoring:{...monitoring,revision:sequence+2},mode:'append',systemMetrics:{...metrics,cpuPercent:sequence%100,networkSamples:[{rx:sequence,tx:sequence,sampledAt:sequence}]}})
  }
  // Accelerated completion stream plus eight concurrent transfer progress streams.
  if(sequence%2===0){
   for(let index=0;index<8;index++)emit('transfer',{id:'active-'+index,tabId:ids[index],profileId:ids[index],direction:'upload',name:'active',status:'running',resumable:true,progress:sequence%100,updatedAt:sequence})
   for(let index=0;index<10;index++)emit('transfer',{id:'done-'+sequence+'-'+index,tabId:ids[index],profileId:ids[index],direction:'upload',name:'done',status:index===0?'failed':'done',message:'synthetic transfer status',resumable:false,progress:100,updatedAt:sequence})
   window.maxHistory=Math.max(window.maxHistory,window.currentHistory.length)
  }
  sequence++;timer=setTimeout(pump,50)
 }
 pump()
}
window.stop = ()=>{stopped=true;clearTimeout(timer)}
window.sample = () => {
 const live=window.terminals.map(ref=>ref.deref()).filter(Boolean)
 return {sent:window.sent,acked:window.acked,maxPending:window.maxPending,history:window.currentHistory?.length,maxHistory:window.maxHistory,subscriptions:Object.fromEntries([...subscriptions].map(([name,listeners])=>[name,listeners.size])),liveTerminals:live.length,terminalElements:document.querySelectorAll('.xterm').length,markers:live.reduce((sum,t)=>sum+t.markers.length,0),pendingXterm:live.reduce((sum,t)=>sum+t._core._writeBuffer._pendingData,0),liveDomNodes:document.getElementsByTagName('*').length,clicks:window.clicks}
}
Promise.all([
 new FontFace('JetBrains Mono', 'url('+monoRegular+')',{weight:'400'}),
 new FontFace('JetBrains Mono', 'url('+monoBold+')',{weight:'700'}),
 new FontFace('Noto Sans SC', 'url('+cjk+')',{weight:'100 900'})
].map(async face=>{document.fonts.add(face);await face.load()})).then(()=>window.mount())
`
)
await build({
  configFile: false,
  root: directory,
  base: './',
  plugins: [
    {
      name: 'history-baseline',
      enforce: 'pre',
      transform(code, id) {
        if (baselineSource && id === hookPath) return { code: baselineSource, map: null }
      }
    },
    react()
  ],
  logLevel: 'error',
  resolve: {
    alias: [
      { find: /^react$/, replacement: require.resolve('react') },
      { find: /^react\/jsx-runtime$/, replacement: require.resolve('react/jsx-runtime') },
      { find: /^react-dom\/client$/, replacement: require.resolve('react-dom/client') }
    ]
  },
  build: { minify: false, outDir: join(directory, 'dist') }
})
const server = createServer((request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    const data = readFileSync(join(directory, 'dist', path === '/' ? 'index.html' : path))
    response.writeHead(200, {
      'Content-Type':
        {
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.html': 'text/html',
          '.ttf': 'font/ttf',
          '.svg': 'image/svg+xml'
        }[extname(path)] || (path === '/' ? 'text/html' : 'application/octet-stream')
    })
    response.end(data)
  } catch {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const isWebkit = process.env.PLAYWRIGHT_ENGINE === 'webkit'
const browser = await (isWebkit ? webkit : chromium).launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.error(error.message)
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.addStyleTag({
    content:
      '.terminal-view,.terminal-host,.terminal-inner{height:100%;min-height:0;position:relative}.terminal-view{overflow:hidden}.terminal-host{padding:0}body{margin:0}.vertical-scrollbar{display:none}'
  })
  await page.waitForFunction(() => window.mounted?.() && window.releaseSnapshot)
  await page.evaluate(() => window.completeHydration())
  await page.waitForFunction(() => window.currentHistory.length >= 200)
  assert.equal(
    await page.locator('#history').textContent(),
    '200',
    'slow hydration must coalesce task progress and bound history'
  )
  const cdp = isWebkit ? null : await page.context().newCDPSession(page)
  const sample = async () => {
    await cdp?.send('HeapProfiler.collectGarbage')
    const resource = await page.evaluate(() => window.sample())
    const memory = cdp ? await cdp.send('Runtime.getHeapUsage') : {}
    const dom = cdp ? await cdp.send('Memory.getDOMCounters') : {}
    return { ...resource, ...memory, ...dom }
  }
  console.log(JSON.stringify({ phase: 'mounted', ...(await sample()) }))
  await page.evaluate(() => window.prefill())
  console.log(JSON.stringify({ phase: 'prefilled', ...(await sample()) }))
  await page.evaluate(() => window.start())
  const samples = []
  const started = performance.now()
  let iteration = 0
  while (performance.now() - started < duration) {
    await page.waitForTimeout(Math.min(30000, duration - (performance.now() - started)))
    await page.locator('#input').fill('输入 ' + iteration)
    await page.locator('#button').click()
    const current = await sample()
    samples.push(current)
    console.log(JSON.stringify({ phase: 'load', elapsedMs: Math.round(performance.now() - started), ...current }))
    assert.equal(current.terminalElements, 10)
    assert.ok(current.history <= 200, 'completed transfer history must stay bounded')
    assert.ok(current.maxPending <= 4)
    assert.equal(current.subscriptions.terminal, 10)
    iteration++
  }
  await page.evaluate(() => window.stop())
  await page.waitForFunction(() => window.sent === window.acked)
  for (let cycle = 0; cycle < 10; cycle++) {
    await page.evaluate(() => window.replaceTerminals())
    await page.waitForFunction(() => window.mounted?.() && document.querySelectorAll('.xterm').length === 10)
    await page.waitForTimeout(50)
  }
  const replaced = await sample()
  console.log(JSON.stringify({ phase: 'replaced', ...replaced }))
  assert.equal(replaced.subscriptions.terminal, 10)
  assert.equal(replaced.subscriptions.metrics, 1)
  if (cdp) assert.equal(replaced.liveTerminals, 10, 'replaced terminals must be garbage collected')
  if (cdp)
    assert.ok(
      replaced.jsEventListeners <= samples[0].jsEventListeners + 4,
      'replacement must not accumulate DOM listeners'
    )
  await page.evaluate(() => window.unmount())
  await page.waitForFunction(() => document.querySelectorAll('.xterm').length === 0)
  await page.waitForTimeout(250)
  const disposed = await sample()
  console.log(JSON.stringify({ phase: 'disposed', ...disposed }))
  assert.equal(disposed.pendingXterm, 0)
  assert.equal(disposed.markers, 0)
  assert.ok(
    Object.values(disposed.subscriptions).every((count) => count === 0),
    'all native subscriptions must detach'
  )
  if (cdp) assert.equal(disposed.liveTerminals, 0, 'unmounted terminals must be garbage collected')
  assert.deepEqual(errors, [])
  assert.ok(samples.length > 0)
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
  rmSync(directory, { recursive: true, force: true })
}
