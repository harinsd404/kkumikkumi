import { chmod, lstat, mkdir, unlink, writeFile } from 'node:fs/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import { join } from 'node:path'
import type { McpMode } from '@kkumikkumi/schema'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { McpStatus } from '../../shared/api'
import { mcpBridgeKeyPath, mcpEndpoint } from './endpoint'

/**
 * 외부 AI 앱 연결(MCP). 앱이 Unix 소켓을 열고, AI 앱은 `nc -U <소켓>`을 stdio MCP 서버로 실행한다.
 * 데이터는 언제나 이 앱(main)만 읽고 쓴다(DB를 두 프로세스가 열지 않음).
 * - 소켓은 사용자만 들어갈 수 있는 폴더(0700) 안에 두고, 소켓 파일도 0600.
 * - 모드가 바뀌면 이미 연결된 것은 끊는다(연결마다 그때 모드로 도구를 만든다).
 */

/** macOS sockaddr_un.sun_path는 104바이트(끝 NUL 포함) */
const MAX_SOCKET_PATH_BYTES = 103
const MAX_CONNECTIONS = 4
/** 메시지 하나의 최대 크기(메모 본문 2만 자 + 여유) */
const MAX_MESSAGE_BYTES = 1024 * 1024

export const mcpSocketPath = mcpEndpoint

export interface McpControllerDeps {
  platform?: string
  bridgeCommand?: string
  userDataDir: string
  /** 연결마다 새 MCP 서버(그때 모드의 도구만) */
  makeServer(mode: Exclude<McpMode, 'off'>): McpServer
  onError(tag: string, err: unknown): void
}

export interface McpController {
  status(): McpStatus
  apply(mode: McpMode): Promise<McpStatus>
  dispose(): Promise<void>
}

export function createMcpController(d: McpControllerDeps): McpController {
  const windows = (d.platform ?? process.platform) === 'win32'
  const socketPath = mcpSocketPath(d.userDataDir, d.platform)
  let bridgeKey = ''
  let mode: McpMode = 'off'
  let server: Server | null = null
  let error: McpStatus['error'] = null
  const sockets = new Set<Socket>()
  /** apply가 겹치지 않게 차례로 */
  let chain: Promise<unknown> = Promise.resolve()

  const status = (): McpStatus => ({
    mode,
    socketPath,
    listening: server !== null,
    error,
    ...(windows && d.bridgeCommand ? { bridgeCommand: d.bridgeCommand } : {}),
  })

  const dropAll = () => {
    for (const s of sockets) s.destroy()
    sockets.clear()
  }

  const stop = async () => {
    dropAll()
    const s = server
    server = null
    if (!s) return
    await new Promise<void>((r) => s.close(() => r()))
    if (!windows) await unlink(socketPath).catch(() => {})
    else await unlink(mcpBridgeKeyPath(d.userDataDir)).catch(() => {})
  }

  const accept = (sock: Socket) => {
    if (mode === 'off') return sock.destroy()
    sockets.add(sock)
    const mcp = d.makeServer(mode)
    const transport = new StdioServerTransport(sock, sock, { maxBufferSize: MAX_MESSAGE_BYTES })
    sock.on('error', () => {}) // 상대가 끊은 경우 등(close에서 정리)
    sock.on('close', () => {
      sockets.delete(sock)
      void mcp.close().catch(() => {})
    })
    // 너무 큰 메시지 등 transport 오류면 연결을 끊는다
    transport.onerror = () => sock.destroy()
    mcp.connect(transport).catch((err) => {
      d.onError('[mcp] connect', err)
      sock.destroy()
    })
  }

  const onConnection = (sock: Socket) => {
    if (!windows) return accept(sock)
    // Windows named pipes do not inherit Unix 0600 permissions. Authenticate the
    // local bridge with a rotating secret held in the user's profile directory.
    sockets.add(sock)
    sock.on('close', () => sockets.delete(sock))
    sock.on('error', () => {})
    sock.setTimeout(3000, () => sock.destroy())
    let pending = Buffer.alloc(0)
    const handshake = (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk])
      const end = pending.indexOf(10)
      if (end < 0) {
        if (pending.length > 128) sock.destroy()
        return
      }
      const supplied = pending.subarray(0, end),
        expected = Buffer.from(bridgeKey)
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
        return void sock.destroy()
      sock.pause()
      sock.off('data', handshake)
      sock.setTimeout(0)
      const rest = pending.subarray(end + 1)
      if (rest.length) sock.unshift(rest)
      accept(sock)
      sock.resume()
    }
    sock.on('data', handshake)
  }

  const start = async () => {
    if (!windows && Buffer.byteLength(socketPath) > MAX_SOCKET_PATH_BYTES) {
      error = 'path_too_long'
      return
    }
    const dir = join(d.userDataDir, 'mcp')
    await mkdir(dir, { recursive: true, mode: 0o700 })
    if (!windows) await chmod(dir, 0o700)
    // 지난 실행이 남긴 소켓만 지운다(같은 이름의 다른 파일은 건드리지 않고 실패)
    if (!windows) {
      const old = await lstat(socketPath).catch(() => null)
      if (old?.isSocket()) await unlink(socketPath)
    } else {
      bridgeKey = randomBytes(32).toString('hex')
      await writeFile(mcpBridgeKeyPath(d.userDataDir), bridgeKey, { mode: 0o600 })
    }
    const s = createServer({ allowHalfOpen: false }, onConnection)
    s.maxConnections = MAX_CONNECTIONS
    await new Promise<void>((resolve, reject) => {
      s.once('error', reject)
      s.listen(socketPath, () => {
        s.off('error', reject)
        resolve()
      })
    })
    s.on('error', (err) => d.onError('[mcp] server', err))
    if (!windows) await chmod(socketPath, 0o600)
    server = s
  }

  const apply = (next: McpMode): Promise<McpStatus> => {
    const p = chain.then(async () => {
      const prev = mode
      mode = next
      error = null
      if (next === 'off') {
        await stop()
        return status()
      }
      // 모드가 바뀌면 기존 연결의 도구 목록이 맞지 않으므로 끊는다
      if (prev !== next) dropAll()
      if (!server) {
        try {
          await start()
        } catch (err) {
          d.onError('[mcp] listen', err)
          error = 'listen_failed'
          await stop()
        }
      }
      return status()
    })
    chain = p.catch(() => {})
    return p
  }

  return { status, apply, dispose: () => apply('off').then(() => {}) }
}
