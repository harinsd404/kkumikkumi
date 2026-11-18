import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildSync } = createRequire(require.resolve('vite'))('esbuild')
const dir = mkdtempSync(join(tmpdir(), 'kkumi-window-test-'))
const env = { ...process.env }
for (const key of Object.keys(env))
  if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key]
try {
  buildSync({
    entryPoints: ['scripts/fixtures/window-main.ts'],
    outfile: join(dir, 'main/index.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'sharp'],
  })
  buildSync({
    entryPoints: ['scripts/fixtures/window-renderer.tsx'],
    outfile: join(dir, 'renderer/index.js'),
    bundle: true,
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.woff2': 'file', '.md': 'file', '.svg': 'file' },
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const result = spawnSync(require('electron'), [join(dir, 'main/index.cjs')], {
    stdio: 'inherit',
    timeout: 30000,
    env,
  })
  if (result.error) console.error(result.error)
  process.exitCode = result.status === 0 && existsSync(join(dir, 'main/passed')) ? 0 : 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
