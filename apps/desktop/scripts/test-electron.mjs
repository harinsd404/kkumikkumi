import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const result = spawnSync(
  require('electron'),
  ['../../node_modules/vitest/vitest.mjs', 'run', 'src/main'],
  {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  },
)
process.exit(result.status ?? 1)
