import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildSync } = createRequire(require.resolve('vite'))('esbuild')
const dir = mkdtempSync(join(tmpdir(), 'kkumi-image-test-'))
try {
  buildSync({
    entryPoints: ['scripts/fixtures/images-main.ts'],
    outfile: join(dir, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'sharp'],
  })
  buildSync({
    entryPoints: ['scripts/fixtures/images-renderer.tsx'],
    outfile: join(dir, 'renderer.js'),
    bundle: true,
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const result = spawnSync(require('electron'), [join(dir, 'main.cjs')], {
    stdio: 'inherit',
    timeout: 20000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
