import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  emptySyncDocument,
  mergeSyncDocuments,
  syncDiff,
  SyncDocumentSchema,
  SyncSnapshotSchema,
  SYNC_MAX_BYTES,
  SYNC_VERSION,
  type SyncDocument,
  type SyncSnapshot,
} from '@kkumikkumi/schema'
import { transaction, type Db } from '../db/connection'
import type { Repos } from '../db/repos'
import type { SyncStatus } from '../../shared/api'

export class SyncError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}
const StateSchema = z.strictObject({
  url: z.string(),
  token: z.string().nullable(),
  enabled: z.boolean(),
  serverId: z.string(),
  accountId: z.string(),
  revision: z.number().int().nonnegative(),
  base: SyncDocumentSchema,
  lastSyncedAt: z.number().nullable(),
})
type State = z.infer<typeof StateSchema>
export function normalizeSyncUrl(input: string): string {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    throw new SyncError('sync_url')
  }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    (u.protocol !== 'https:' && !(loopback && u.protocol === 'http:'))
  )
    throw new SyncError('sync_url')
  return u.toString().replace(/\/+$/, '')
}

interface Deps {
  flush?(): Promise<void>
  db: Db
  repos: Repos
  seal(token: string): string
  unseal(cipher: string): string
  backup(document: SyncDocument): Promise<void>
  changed(): void
  fetch?: typeof fetch
}

/** The last acknowledged server snapshot is durable in the same SQLite DB as edits.
 * Diffing it against current rows is a persistent change queue (including deletions),
 * also covering MCP, cascading deletes, reorder, offline edits and crash recovery.
 */
export class SyncService {
  private state: State | null
  private busy = false
  private stopped = false
  private conflicts = 0
  private error: string | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  constructor(private readonly d: Deps) {
    const row = d.db.prepare("SELECT value FROM settings WHERE key='sync.v1'").get()
    try {
      this.state = row ? StateSchema.parse(JSON.parse(String(row['value']))) : null
    } catch {
      this.state = null
      this.error = 'sync_storage'
    }
  }
  private save(state: State) {
    this.d.db
      .prepare(
        "INSERT INTO settings (key,value) VALUES ('sync.v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(state))
    this.state = state
  }
  private read(): SyncDocument {
    const lists = this.d.repos.todo.lists()
    return SyncDocumentSchema.parse({
      lists,
      todos: lists.flatMap((l) => this.d.repos.todo.items(l.id)),
      sprints: this.d.repos.sprints.list(),
      memos: this.d.repos.memos.list(),
    })
  }
  private apply(document: SyncDocument) {
    const { repos, db } = this.d
    // Parent/child changes are one transaction. Keep all unrelated tables and settings.
    db.exec(
      'DELETE FROM todo_items; DELETE FROM todo_lists; DELETE FROM sprints; DELETE FROM memos;',
    )
    for (const v of document.lists) repos.todo.insertList(v)
    for (const v of document.sprints) repos.sprints.insert(v)
    for (const v of document.todos) repos.todo.insertItem(v)
    for (const v of document.memos) repos.memos.insert(v)
  }
  status(): SyncStatus {
    return {
      url: this.state?.url ?? '',
      enabled: this.state?.enabled ?? false,
      busy: this.busy,
      pending: this.state && !this.stopped ? syncDiff(this.state.base, this.read()).length : 0,
      conflicts: this.conflicts,
      error: this.error,
      lastSyncedAt: this.state?.lastSyncedAt ?? null,
    }
  }
  private async request(
    url: string,
    token: string,
    body?: unknown,
  ): Promise<{ snapshot: SyncSnapshot; conflict: boolean }> {
    const encoded = body === undefined ? undefined : JSON.stringify(body)
    if (encoded && Buffer.byteLength(encoded) > SYNC_MAX_BYTES)
      throw new SyncError('sync_too_large')
    let response: Response
    try {
      response = await (this.d.fetch ?? fetch)(`${url}/v1/${body ? 'changes' : 'snapshot'}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(encoded === undefined ? {} : { body: encoded }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      })
    } catch {
      throw new SyncError('sync_network')
    }
    if (response.status === 401) throw new SyncError('sync_auth')
    if (response.status === 413) throw new SyncError('sync_too_large')
    if (response.status !== 200 && response.status !== 409) throw new SyncError('sync_server')
    const reader = response.body?.getReader()
    if (!reader) throw new SyncError('sync_protocol')
    let size = 0
    const chunks: Uint8Array[] = []
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > SYNC_MAX_BYTES + 4096) {
          await reader.cancel()
          throw new SyncError('sync_too_large')
        }
        chunks.push(value)
      }
      const snapshot = SyncSnapshotSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      return { snapshot, conflict: response.status === 409 }
    } catch (e) {
      if (e instanceof SyncError) throw e
      throw new SyncError('sync_protocol')
    } finally {
      reader.releaseLock()
    }
  }
  async connect(input: { url: string; token: string; importLocal: boolean }): Promise<SyncStatus> {
    if (this.busy) throw new SyncError('sync_busy')
    if (!input.importLocal) throw new SyncError('sync_consent')
    const url = normalizeSyncUrl(input.url)
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw new SyncError('sync_auth')
    this.busy = true
    try {
      const token = this.d.seal(input.token) // fail before sending if OS secure storage is unavailable
      const { snapshot } = await this.request(url, input.token)
      if (this.stopped) throw new SyncError('sync_stopped')
      const previous = this.state
      const same =
        previous &&
        previous.url === url &&
        previous.serverId === snapshot.serverId &&
        previous.accountId === snapshot.accountId &&
        snapshot.revision >= previous.revision
      await this.d.flush?.()
      if (this.stopped) throw new SyncError('sync_stopped')
      await this.d.backup(this.read())
      if (this.stopped) throw new SyncError('sync_stopped')
      this.save(
        same
          ? { ...previous, token, enabled: true }
          : {
              url,
              token,
              enabled: true,
              serverId: snapshot.serverId,
              accountId: snapshot.accountId,
              revision: 0,
              base: emptySyncDocument(),
              lastSyncedAt: null,
            },
      )
      this.conflicts = 0
      this.error = null
    } finally {
      this.busy = false
    }
    return this.run()
  }
  disconnect(): SyncStatus {
    if (this.busy) throw new SyncError('sync_busy')
    if (this.state) this.save({ ...this.state, enabled: false, token: null })
    this.conflicts = 0
    this.error = null
    return this.status()
  }
  async run(prefer?: 'local' | 'remote'): Promise<SyncStatus> {
    if (this.busy || this.stopped || !this.state?.enabled || !this.state.token) return this.status()
    this.busy = true
    const state = this.state
    try {
      const token = this.d.unseal(state.token!)
      // Retry a bounded number of revision races; never resend a stale full snapshot.
      for (let attempt = 0; attempt < 3; attempt++) {
        const { snapshot: remote } = await this.request(state.url, token)
        if (this.stopped) break
        if (remote.serverId !== state.serverId || remote.accountId !== state.accountId)
          throw new SyncError('sync_identity')
        if (remote.revision < state.revision) throw new SyncError('sync_rollback')
        await this.d.flush?.()
        if (this.stopped) break
        const local = this.read()
        const merged = mergeSyncDocuments(state.base, local, remote.document, prefer)
        this.conflicts = merged.conflicts.length
        if (this.conflicts && !prefer) {
          this.error = 'sync_conflict'
          break
        }
        if (this.conflicts) {
          await this.d.backup(local)
          await this.d.backup(remote.document)
          if (this.stopped) break
          // Edits can arrive while the backups are written. Re-read on the next pass.
          if (syncDiff(local, this.read()).length) continue
        }
        const changes = syncDiff(remote.document, merged.document)
        const result = changes.length
          ? await this.request(state.url, token, {
              protocol: SYNC_VERSION,
              mutationId: randomUUID(),
              revision: remote.revision,
              changes,
            })
          : { snapshot: remote, conflict: false }
        if (this.stopped) break
        if (result.conflict) continue
        const accepted = result.snapshot
        if (
          accepted.serverId !== state.serverId ||
          accepted.accountId !== state.accountId ||
          accepted.revision < remote.revision
        )
          throw new SyncError('sync_protocol')
        // Preserve edits made during the HTTP request. They become the next diff.
        await this.d.flush?.()
        if (this.stopped) break
        const latest = this.read()
        const next = mergeSyncDocuments(local, latest, accepted.document, 'local').document
        const changed = syncDiff(latest, next).length > 0
        transaction(this.d.db, () => {
          if (changed) this.apply(next)
          this.save({
            ...state,
            base: accepted.document,
            revision: accepted.revision,
            lastSyncedAt: Date.now(),
          })
        })
        this.conflicts = 0
        this.error = null
        if (changed) this.d.changed()
        break
      }
    } catch (e) {
      this.error = e instanceof SyncError ? e.code : 'sync_storage'
    } finally {
      this.busy = false
    }
    return this.status()
  }
  start() {
    if (this.interval) return
    this.interval = setInterval(() => {
      void this.run()
    }, 10000)
    this.interval.unref()
    void this.run()
  }
  stop() {
    this.stopped = true
    if (this.interval) clearInterval(this.interval)
    this.interval = null
  }
}
