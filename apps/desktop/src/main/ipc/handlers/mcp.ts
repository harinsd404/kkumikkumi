import { McpModeSchema } from '@kkumikkumi/schema'
import { z } from 'zod'
import type { McpStatus } from '../../../shared/api'
import { NoInput } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

/** 외부 AI 연결(MCP) 설정. 모드는 사용자 설정(settings 'mcp')에 저장하고 소켓을 그에 맞게 연다/닫는다. */
export function mcpHandlers(d: HandlerDeps): HandlersOf<'mcp'> {
  const offline = (): McpStatus => ({
    mode: d.repos.settings.mcp().mode,
    socketPath: '',
    listening: false,
    error: null,
  })
  return {
    'mcp.status': async (i) => {
      NoInput.parse(i)
      return d.mcp?.status() ?? offline()
    },
    'mcp.update': async (i) => {
      const { mode } = z.strictObject({ mode: McpModeSchema }).parse(i)
      d.repos.settings.saveMcp({ mode })
      return (await d.mcp?.apply(mode)) ?? offline()
    },
  }
}
