import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SyncStore } from './store'
import { backup } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { SyncDocumentSchema, syncDiff, syncBlobRefs, SYNC_VERSION } from '@kkumikkumi/schema'

process.umask(0o077)
const dir = process.env['DATA_DIR'] ?? './data'
mkdirSync(dir, { recursive: true, mode: 0o700 })
const store = new SyncStore(join(dir, 'sync.db'))
try {
  const [command, value, file, blobs] = process.argv.slice(2)
  if (command === 'create-account' && value && value.length <= 80)
    console.log(JSON.stringify(store.createAccount(value)))
  else if (command === 'rotate-key' && value)
    console.log(JSON.stringify({ accountId: value, token: store.rotateKey(value) }))
  else if (command === 'backup' && value) {
    await backup(store.db, value)
    console.log('Backup saved')
  } else if (command === 'restore-account' && value && file) {
    const document = SyncDocumentSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    if (blobs)
      for (const ref of syncBlobRefs(document))
        if (!store.hasBlob(value, ref.hash))
          store.putBlob(value, ref.hash, readFileSync(join(blobs, ref.hash)))
    const current = store.snapshot(value)
    const changes = syncDiff(current.document, document)
    if (changes.length) {
      const result = store.push(value, {
        protocol: SYNC_VERSION,
        mutationId: randomUUID(),
        revision: current.revision,
        changes,
      })
      if (result.status !== 200) throw new Error('account_changed_retry_restore')
    }
    console.log('Account restored; clients will reconcile on their next sync')
  } else {
    console.error(
      'Usage: admin.js create-account <name> | rotate-key <account-id> | backup <path> | restore-account <account-id> <json-path> [blob-directory]',
    )
    process.exitCode = 1
  }
} finally {
  store.close()
}
