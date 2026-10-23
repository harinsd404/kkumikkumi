import { createHash } from 'node:crypto'
import { join } from 'node:path'

export function mcpEndpoint(userDataDir: string, platform: string = process.platform): string {
  if (platform === 'win32') {
    const id = createHash('sha256').update(userDataDir.toLowerCase()).digest('hex').slice(0, 24)
    return `\\\\.\\pipe\\kkumikkumi-${id}`
  }
  return join(userDataDir, 'mcp', 'kkumikkumi.sock')
}
export const mcpBridgeKeyPath = (dir: string) => join(dir, 'mcp', 'bridge.key')
