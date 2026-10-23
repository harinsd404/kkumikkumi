import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import {
  applySyncChanges,
  emptySyncDocument,
  SYNC_MAX_BYTES,
  SYNC_VERSION,
  SyncDocumentSchema,
  type SyncPush,
  type SyncSnapshot,
} from '@kkumikkumi/schema'

const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export class SyncStore {
  readonly db: DatabaseSync
  readonly serverId: string
  constructor(path: string) {
    this.db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5000 })
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0, document TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS mutations (account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        id TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(account_id,id)) STRICT;`)
    this.db.prepare("INSERT OR IGNORE INTO metadata VALUES ('server_id', ?)").run(randomUUID())
    this.serverId = String(
      this.db.prepare("SELECT value FROM metadata WHERE key='server_id'").get()!['value'],
    )
  }
  createAccount(name: string): { accountId: string; token: string } {
    const token = randomBytes(32).toString('base64url'),
      accountId = randomUUID()
    this.db
      .prepare('INSERT INTO accounts (id,name,token_hash,document) VALUES (?,?,?,?)')
      .run(accountId, name, hash(token), JSON.stringify(emptySyncDocument()))
    return { accountId, token }
  }
  rotateKey(accountId: string): string {
    const token = randomBytes(32).toString('base64url')
    if (
      !this.db.prepare('UPDATE accounts SET token_hash=? WHERE id=?').run(hash(token), accountId)
        .changes
    )
      throw new Error('account_not_found')
    return token
  }
  authenticate(token: string): string | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
    const r = this.db.prepare('SELECT id FROM accounts WHERE token_hash=?').get(hash(token))
    return r ? String(r['id']) : null
  }
  snapshot(accountId: string): SyncSnapshot {
    const r = this.db.prepare('SELECT revision,document FROM accounts WHERE id=?').get(accountId)
    if (!r) throw new Error('account_not_found')
    return {
      protocol: SYNC_VERSION,
      serverId: this.serverId,
      accountId,
      revision: Number(r['revision']),
      document: SyncDocumentSchema.parse(JSON.parse(String(r['document']))),
    }
  }
  push(accountId: string, input: SyncPush): { status: 200 | 409; snapshot: SyncSnapshot } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const current = this.snapshot(accountId),
        digest = hash(JSON.stringify(input))
      const seen = this.db
        .prepare('SELECT digest FROM mutations WHERE account_id=? AND id=?')
        .get(accountId, input.mutationId)
      if (seen && seen['digest'] !== digest) throw new Error('mutation_reused')
      if (seen || current.revision !== input.revision) {
        this.db.exec('COMMIT')
        return { status: seen ? 200 : 409, snapshot: current }
      }
      const document = applySyncChanges(current.document, input.changes)
      const serialized = JSON.stringify(document)
      if (Buffer.byteLength(serialized) > SYNC_MAX_BYTES) throw new Error('document_too_large')
      this.db
        .prepare('UPDATE accounts SET revision=revision+1,document=? WHERE id=?')
        .run(serialized, accountId)
      this.db
        .prepare('INSERT INTO mutations VALUES (?,?,?)')
        .run(accountId, input.mutationId, digest)
      const snapshot = this.snapshot(accountId)
      this.db.exec('COMMIT')
      return { status: 200, snapshot }
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
  close(): void {
    this.db.close()
  }
}
