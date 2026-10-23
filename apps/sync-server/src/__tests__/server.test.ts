import { afterEach, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SyncStore } from '../store'
import { createSyncHttpServer } from '../http'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})
const mutation = () => ({
  protocol: 2 as const,
  mutationId: randomUUID(),
  revision: 0,
  changes: [
    {
      collection: 'memos' as const,
      id: '00000000-0000-4000-8000-000000000001',
      value: {
        id: '00000000-0000-4000-8000-000000000001',
        body: 'memo',
        pinned: false,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ],
})
describe('self-hosted server', () => {
  it('persists accounts, state and idempotency across restarts, and rotates keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kkumi-server-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    let store = new SyncStore(join(dir, 'sync.db'))
    cleanup.push(() => store.close())
    const account = store.createAccount('test'),
      change = mutation()
    const serverId = store.serverId
    expect(store.push(account.accountId, change).status).toBe(200)
    store.close()
    store = new SyncStore(join(dir, 'sync.db'))
    expect(store.serverId).toBe(serverId)
    expect(store.authenticate(account.token)).toBe(account.accountId)
    expect(store.push(account.accountId, change).snapshot.revision).toBe(1)
    expect(store.push(account.accountId, { ...mutation(), revision: 0 }).status).toBe(409)
    const token = store.rotateKey(account.accountId)
    expect(store.authenticate(account.token)).toBeNull()
    expect(store.authenticate(token)).toBe(account.accountId)
  })
  it('requires authentication, isolates accounts and rejects malformed data', async () => {
    const store = new SyncStore(':memory:')
    cleanup.push(() => store.close())
    const a = store.createAccount('a'),
      b = store.createAccount('b')
    const server = createSyncHttpServer(store)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    cleanup.push(
      () =>
        new Promise<void>((r) => {
          server.close(() => r())
          server.closeAllConnections()
        }),
    )
    const address = server.address() as { port: number },
      url = `http://127.0.0.1:${address.port}`
    expect((await fetch(`${url}/v2/snapshot`)).status).toBe(401)
    const post = (body: unknown) =>
      fetch(`${url}/v2/changes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    expect((await post(mutation())).status).toBe(200)
    expect(store.snapshot(b.accountId).document.memos).toEqual([])
    expect((await post({ ...mutation(), protocol: 99 })).status).toBe(400)
    const bad = mutation()
    bad.changes[0]!.value.id = randomUUID()
    expect((await post(bad)).status).toBe(400)
    expect(store.snapshot(a.accountId).revision).toBe(1)
    const bytes = Buffer.from('blob test'),
      hash = createHash('sha256').update(bytes).digest('hex')
    const blobUrl = `${url}/v2/blobs/${hash}`
    expect(
      (
        await fetch(blobUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${a.token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: bytes,
        })
      ).status,
    ).toBe(200)
    expect((await fetch(blobUrl, { headers: { Authorization: `Bearer ${b.token}` } })).status).toBe(
      404,
    )
    expect(
      (await fetch(blobUrl, { method: 'HEAD', headers: { Authorization: `Bearer ${a.token}` } }))
        .status,
    ).toBe(200)
    expect(
      Buffer.from(
        await (
          await fetch(blobUrl, { headers: { Authorization: `Bearer ${a.token}` } })
        ).arrayBuffer(),
      ),
    ).toEqual(bytes)
    expect(
      (
        await fetch(blobUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${a.token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: 'wrong hash',
        })
      ).status,
    ).toBe(400)
    expect(() =>
      store.push(a.accountId, {
        protocol: 2,
        mutationId: randomUUID(),
        revision: 1,
        changes: [
          {
            collection: 'diary',
            id: '2026-10-23',
            value: {
              id: '2026-10-23',
              date: '2026-10-23',
              body: '',
              mood: null,
              photos: [{ hash: 'a'.repeat(64), mime: 'image/png' }],
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
      }),
    ).toThrow('missing_blob')
    expect(store.snapshot(a.accountId).revision).toBe(1)
  })
})
