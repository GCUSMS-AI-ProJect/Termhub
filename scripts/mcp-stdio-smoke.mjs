import { spawn } from 'node:child_process'

const binary = process.argv[2] || process.env.TRANSTERM_MCP_BINARY
const REQUEST_TIMEOUT_MS = 10_000

if (!binary) {
  console.error('Usage: node scripts/mcp-stdio-smoke.mjs <transterm-binary>')
  process.exitCode = 2
} else {
  await runSmoke(binary)
}

async function runSmoke(binaryPath) {
  const child = spawn(binaryPath, ['mcp'], {
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let stdoutBuffer = ''
  let stderrBuffer = ''
  const pending = new Map()
  let nextRequestId = 1
  let closeResolve
  let closeReject
  const closePromise = new Promise((resolve, reject) => {
    closeResolve = resolve
    closeReject = reject
  })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk
    while (true) {
      const newline = stdoutBuffer.indexOf('\n')
      if (newline < 0) break
      const line = stdoutBuffer.slice(0, newline).trim()
      stdoutBuffer = stdoutBuffer.slice(newline + 1)
      if (!line) continue
      let message
      try {
        message = JSON.parse(line)
      } catch (error) {
        rejectPending(new Error(`MCP stdout is not JSON: ${line}`, { cause: error }))
        continue
      }
      if (message.id === undefined || message.id === null) continue
      const waiter = pending.get(String(message.id))
      if (!waiter) continue
      pending.delete(String(message.id))
      clearTimeout(waiter.timer)
      waiter.resolve(message)
    }
  })
  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk
    if (stderrBuffer.length > 4_000) stderrBuffer = stderrBuffer.slice(-4_000)
  })
  child.on('error', (error) => {
    rejectPending(error)
    closeReject(error)
  })
  child.on('close', (code, signal) => {
    if (code === 0) {
      closeResolve({ code, signal })
    } else {
      const detail = stderrBuffer.trim()
      closeReject(new Error(`MCP process exited with code=${code} signal=${signal}${detail ? `: ${detail}` : ''}`))
    }
    rejectPending(new Error('MCP process closed before returning a response'))
  })

  try {
    const initialize = await request(child, pending, nextRequestId++, {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'transterm-package-smoke', version: '1.0.0' }
      }
    })
    assert(initialize.result?.protocolVersion, 'initialize did not negotiate a protocol version')
    assert(initialize.result?.serverInfo?.name === 'transterm-mcp-server', 'unexpected MCP server name')

    const toolsList = await request(child, pending, nextRequestId++, {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {}
    })
    const tools = toolsList.result?.tools
    assert(Array.isArray(tools), 'tools/list did not return a tool array')
    const byName = new Map(tools.map((tool) => [tool.name, tool]))
    const requiredTools = [
      'transterm_list_connections',
      'transterm_open_connection',
      'transterm_activate_session',
      'transterm_execute_remote_command',
      'transterm_start_remote_command',
      'transterm_read_remote_command',
      'transterm_terminate_remote_command',
      'transterm_close_remote_command',
      'transterm_execute_visible_command'
    ]
    for (const name of requiredTools) {
      assert(byName.has(name), `tools/list is missing ${name}`)
    }

    const remoteProperties = byName.get('transterm_execute_remote_command').inputSchema?.properties ?? {}
    const backgroundStart = byName.get('transterm_start_remote_command')
    const backgroundRead = byName.get('transterm_read_remote_command')
    assert(
      backgroundStart.inputSchema?.properties?.timeout_ms?.maximum === 6 * 60 * 60 * 1000,
      'background start schema has an invalid timeout maximum'
    )
    assert(
      !Object.hasOwn(backgroundStart.inputSchema?.properties ?? {}, 'save_sudo_password'),
      'background start schema must not expose save_sudo_password'
    )
    assert(backgroundRead.annotations?.readOnlyHint === true, 'background read must be marked read-only')
    assert(
      backgroundRead.inputSchema?.properties?.wait_ms?.maximum === 30_000,
      'background read schema has an invalid wait maximum'
    )
    const openTool = byName.get('transterm_open_connection')
    assert(
      openTool.inputSchema?.required?.includes('execution_mode'),
      'open connection schema must require execution_mode'
    )
    assert(
      JSON.stringify(openTool.inputSchema?.properties?.execution_mode?.enum) ===
        JSON.stringify(['background', 'visible-terminal']),
      'open connection schema has invalid execution_mode choices'
    )
    assert(
      /non-active/i.test(openTool.description ?? ''),
      'open connection description does not describe the non-active session'
    )
    assert(remoteProperties.sudo_password, 'remote exec schema is missing sudo_password')
    assert(remoteProperties.su_password, 'remote exec schema is missing su_password')
    assert(
      remoteProperties.save_sudo_password?.type === 'boolean',
      'remote exec schema has an invalid save_sudo_password type'
    )
    assert(
      remoteProperties.save_su_password?.type === 'boolean',
      'remote exec schema has an invalid save_su_password type'
    )
    for (const forbidden of ['stdin', 'password', 'answers']) {
      assert(!Object.hasOwn(remoteProperties, forbidden), `remote exec exposes forbidden ${forbidden}`)
    }

    assert(
      /REMOTE_INTERACTIVE_INPUT_REQUIRED/i.test(byName.get('transterm_execute_remote_command').description ?? ''),
      'remote exec description does not describe the fail-closed interactive-input result'
    )
    assert(
      /NETWORK_DEVICE_REMOTE_EXEC_UNSUPPORTED/i.test(byName.get('transterm_execute_remote_command').description ?? ''),
      'remote exec description does not describe the network-device route boundary'
    )
    assert(
      /already-active visible SSH terminal/i.test(byName.get('transterm_execute_visible_command').description ?? ''),
      'visible exec description does not require an active terminal'
    )

    child.stdin.end()
    await closePromise
    console.log(`MCP stdio smoke passed: ${tools.length} tools, initialize/tools-list/schema checks`)
  } catch (error) {
    child.kill()
    process.exitCode = 1
    console.error(error instanceof Error ? error.message : error)
  }

  function rejectPending(error) {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    pending.clear()
  }
}

function request(child, pending, id, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(String(id))
      reject(new Error(`MCP request ${message.method} timed out after ${REQUEST_TIMEOUT_MS}ms`))
    }, REQUEST_TIMEOUT_MS)
    pending.set(String(id), { resolve, reject, timer })
    child.stdin.write(`${JSON.stringify({ ...message, id })}\n`)
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
