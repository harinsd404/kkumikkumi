import { describe, expect, it } from 'vitest'
import { mcpSnippets } from '../settings/McpSection'

describe('mcpSnippets', () => {
  it('공백·따옴표가 있는 경로도 한 인자로 감싼다', () => {
    const path = '/Users/a b/Library/Application Support/kkumikkumi/mcp/kkumikkumi.sock'
    const [codex, codexCli, claude] = mcpSnippets(path)
    expect(codex!.text).toBe(
      `[mcp_servers.kkumikkumi]\ncommand = "/usr/bin/nc"\nargs = ["-U", "${path}"]`,
    )
    expect(codexCli!.text).toBe(`codex mcp add kkumikkumi -- /usr/bin/nc -U "${path}"`)
    expect(claude!.text).toBe(`claude mcp add kkumikkumi -- /usr/bin/nc -U "${path}"`)
    expect(mcpSnippets('/x/"q"')[0]!.text).toContain('"/x/\\"q\\""')
  })
})
