import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createSyncHttpServer } from './http'
import { SyncStore } from './store'

process.umask(0o077)
const dir = process.env['DATA_DIR'] ?? './data'
mkdirSync(dir, { recursive: true, mode: 0o700 })
const port = Number(process.env['PORT'] ?? '8787')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_port')
const store = new SyncStore(join(dir, 'sync.db'))
const server = createSyncHttpServer(store)
server.listen(port, process.env['HOST'] ?? '127.0.0.1', () =>
  console.log(`kkumikkumi sync listening on port ${port}`),
)
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    server.close(() => {
      store.close()
      process.exit(0)
    })
    server.closeIdleConnections()
    setTimeout(() => process.exit(1), 15000).unref()
  })
