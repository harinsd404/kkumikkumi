import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildSync } = createRequire(require.resolve('vite'))('esbuild')
const dir = mkdtempSync(join(tmpdir(), 'kkumi-editor-test-'))
const env = { ...process.env }
// On Windows, even an empty ELECTRON_RUN_AS_NODE can select Node mode.
// Remove the variable entirely so this test uses the real browser process.
for (const key of Object.keys(env))
  if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete env[key]
try {
  buildSync({
    entryPoints: ['scripts/fixtures/editor-main.ts'],
    outfile: join(dir, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'sharp'],
  })
  buildSync({
    entryPoints: ['scripts/fixtures/editor-renderer.tsx'],
    outfile: join(dir, 'renderer.js'),
    bundle: true,
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.woff2': 'file', '.md': 'file' },
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const result = spawnSync(require('electron'), [join(dir, 'main.cjs')], {
    stdio: 'inherit',
    timeout: 20000,
    env,
  })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
