import { spawnSync } from 'node:child_process'
const exe = process.argv[2]
if (!exe) throw new Error('pass the packaged executable path')
const result = spawnSync(exe, ['--mcp-stdio'], { encoding: 'utf8', timeout: 15000 })
// On a clean CI account the MCP server is off. The bridge must reach its own
// connection error handler, without creating a window or leaking output on stdout.
if (result.status !== 1 || !result.stderr.includes('꾸미꾸미 AI 연결') || result.stdout.trim()) {
  console.error({ status: result.status, error: result.error?.message, stderr: result.stderr })
  process.exit(1)
}
console.log('Packaged executable and stdio bridge started successfully')
