import { readFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { mcpBridgeKeyPath, mcpEndpoint } from './endpoint'

/** Runs before the single-instance lock. Only forwards stdio; never opens the DB or a window. */
export async function runMcpBridge(
  userDataDir: string,
  exit: (code: number) => void,
): Promise<void> {
  try {
    const key =
      process.platform === 'win32' ? await readFile(mcpBridgeKeyPath(userDataDir), 'utf8') : null
    const socket = connect(mcpEndpoint(userDataDir))
    socket.once('connect', () => {
      if (key) socket.write(`${key.trim()}\n`)
      process.stdin.pipe(socket)
      socket.pipe(process.stdout)
    })
    socket.once('error', () => {
      process.stderr.write('꾸미꾸미 AI 연결을 열 수 없습니다. 앱과 AI 연결 설정을 확인하세요.\n')
      exit(1)
    })
    socket.once('close', () => exit(0))
  } catch {
    process.stderr.write('꾸미꾸미 AI 연결 설정을 읽을 수 없습니다.\n')
    exit(1)
  }
}
