import { execFileSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMcpController, mcpSocketPath, type McpController } from '../controller'
import { mcpBridgeKeyPath, mcpEndpoint } from '../endpoint'
const windows = process.platform === 'win32'

// macOS 소켓 경로 길이 제한(104바이트) 때문에 짧은 /tmp 폴더를 쓴다
let dir: string
let ctl: McpController
let made: string[]

beforeEach(async () => {
  dir = await mkdtemp(windows ? join(tmpdir(), 'kkm-') : '/tmp/kkm-')
  made = []
  ctl = createMcpController({
    userDataDir: dir,
    makeServer: (mode) => {
      made.push(mode)
      return new McpServer({ name: 'test', version: '0' })
    },
    onError: () => {},
  })
})
afterEach(async () => {
  await ctl.dispose()
  await rm(dir, { recursive: true, force: true })
})

/** 줄 단위 JSON-RPC 클라이언트(nc -U와 같은 바이트) */
function open(path: string, key?: string) {
  const sock = connect(path)
  if (key) sock.write(`${key}\n`)
  let buf = ''
  const waiters: ((line: string) => void)[] = []
  sock.setEncoding('utf8')
  sock.on('data', (d: string) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      waiters.shift()?.(line)
    }
  })
  const closed = new Promise<void>((r) => sock.on('close', () => r()))
  sock.on('error', () => {})
  const request = (msg: object) =>
    new Promise<Record<string, unknown>>((resolve) => {
      waiters.push((l) => resolve(JSON.parse(l)))
      sock.write(JSON.stringify(msg) + '\n')
    })
  return { sock: sock as Socket, request, closed }
}
const client = async (path: string) =>
  open(path, windows ? await readFile(mcpBridgeKeyPath(dir), 'utf8') : undefined)

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 't', version: '0' },
  },
}

describe('MCP 소켓', () => {
  it('켜면 사용자 전용 폴더/소켓을 열고 MCP 초기화에 답한다', async () => {
    const s = await ctl.apply('read')
    expect(s).toMatchObject({ mode: 'read', listening: true, error: null })
    expect(s.socketPath).toBe(mcpSocketPath(dir))
    if (!windows) {
      expect((await stat(join(dir, 'mcp'))).mode & 0o777).toBe(0o700)
      expect((await lstat(s.socketPath)).mode & 0o777).toBe(0o600)
    }

    const c = await client(s.socketPath)
    const r = await c.request(initialize)
    expect(r['result']).toMatchObject({ serverInfo: { name: 'test' } })
    expect(made).toEqual(['read'])
    c.sock.destroy()
  })

  it('모드를 바꾸면 기존 연결을 끊고, 끄면 소켓을 지운다', async () => {
    const s = await ctl.apply('read')
    const c = await client(s.socketPath)
    await c.request(initialize)
    await ctl.apply('readwrite')
    await c.closed
    expect(ctl.status().listening).toBe(true)

    await ctl.apply('off')
    expect(ctl.status()).toMatchObject({ mode: 'off', listening: false })
    await expect(lstat(s.socketPath)).rejects.toThrow()
  })

  it.skipIf(windows)(
    '남은 소켓 파일은 지우고 다시 열지만, 소켓이 아닌 파일은 건드리지 않는다',
    async () => {
      await mkdir(join(dir, 'mcp'), { recursive: true })
      await writeFile(mcpSocketPath(dir), 'not a socket')
      const s = await ctl.apply('read')
      expect(s).toMatchObject({ listening: false, error: 'listen_failed' })
      expect((await lstat(mcpSocketPath(dir))).isFile()).toBe(true)
    },
  )

  it.skipIf(windows)('경로가 너무 길면 열지 않는다', async () => {
    const long = createMcpController({
      userDataDir: join(dir, 'x'.repeat(100)),
      makeServer: () => new McpServer({ name: 't', version: '0' }),
      onError: () => {},
    })
    expect(await long.apply('read')).toMatchObject({ listening: false, error: 'path_too_long' })
  })

  it.skipIf(windows)('지난 실행이 남긴 소켓 파일은 지우고 연다', async () => {
    // 강제 종료된 프로세스처럼 bind만 하고 끝나 소켓 파일만 남긴다
    await mkdir(join(dir, 'mcp'), { recursive: true })
    execFileSync('python3', [
      '-c',
      'import socket,sys; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1])',
      mcpSocketPath(dir),
    ])
    expect((await lstat(mcpSocketPath(dir))).isSocket()).toBe(true)
    const s = await ctl.apply('read')
    expect(s).toMatchObject({ listening: true, error: null })
    const c = await client(s.socketPath)
    expect((await c.request(initialize))['result']).toMatchObject({ serverInfo: { name: 'test' } })
    c.sock.destroy()
  })
  it.runIf(windows)('rejects an unauthenticated named-pipe client', async () => {
    const s = await ctl.apply('read')
    const c = open(s.socketPath, 'wrong-key')
    await c.closed
    expect(made).toEqual([])
    const valid = await client(s.socketPath)
    expect((await valid.request(initialize))['result']).toBeDefined()
    valid.sock.destroy()
  })
  it('uses a per-profile Windows pipe name, independent of path length', () => {
    const a = mcpEndpoint('C:\\Users\\Alice\\AppData\\Roaming\\kkumikkumi', 'win32')
    expect(a).toMatch(/^\\\\\.\\pipe\\kkumikkumi-[a-f0-9]{24}$/)
    expect(a).not.toBe(mcpEndpoint('C:\\Users\\Bob', 'win32'))
  })
})
