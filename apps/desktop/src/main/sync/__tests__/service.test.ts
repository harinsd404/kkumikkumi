import { afterEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeEnv, type TestEnv } from '../../__tests__/helpers'
import { SyncError, SyncService, normalizeSyncUrl } from '../service'
import { SyncStore } from '../../../../../sync-server/src/store'
import { createSyncHttpServer } from '../../../../../sync-server/src/http'
import type { SyncDocument } from '@kkumikkumi/schema'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})
async function setup() {
  const store = new SyncStore(':memory:')
  cleanups.push(() => store.close())
  const account = store.createAccount('test')
  const http = createSyncHttpServer(store)
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        http.close(() => r())
        http.closeAllConnections()
      }),
  )
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`
  let seq = 0
  const client = async () => {
    const env = await makeEnv(undefined, (seq += 1000))
    cleanups.push(() => env.cleanup())
    const backups: SyncDocument[] = []
    const deps = {
      ...env.core,
      seal: (s: string) => s,
      unseal: (s: string) => s,
      backup: async (d: SyncDocument) => {
        backups.push(d)
      },
      changed: () => {},
    }
    return { env, deps, backups, service: new SyncService(deps) }
  }
  return {
    store,
    account,
    client,
    connect: (s: SyncService) => s.connect({ url, token: account.token, importLocal: true }),
    url,
  }
}
const addMemo = (env: TestEnv, body: string) =>
  env.core.repos.memos.insert({ id: randomUUID(), body, pinned: false, createdAt: 1, updatedAt: 1 })

describe('two-device sync', () => {
  it('does not replace local rows if the renderer cannot save its draft', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    const memo = addMemo(a.env, 'base')
    await s.connect(a.service)
    await s.connect(b.service)
    a.env.core.repos.memos.update({ ...memo, body: 'remote edit' })
    await a.service.run()
    const blocked = new SyncService({
      ...b.deps,
      flush: async () => {
        throw new SyncError('sync_unsaved')
      },
    })
    expect((await blocked.run()).error).toBe('sync_unsaved')
    expect(b.env.core.repos.memos.get(memo.id)?.body).toBe('base')
    expect((await b.service.run()).error).toBeNull()
    expect(b.env.core.repos.memos.get(memo.id)?.body).toBe('remote edit')
  })
  it('reconciles offline edits, restart, pinned-only changes and deletions', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    const memo = addMemo(a.env, 'a')
    await s.connect(a.service)
    await s.connect(b.service)
    expect(b.env.core.repos.memos.get(memo.id)?.body).toBe('a')
    b.env.core.repos.memos.update({ ...memo, body: 'offline', pinned: true })
    const restarted = new SyncService(b.deps)
    expect(restarted.status().pending).toBeGreaterThan(0)
    await restarted.run()
    await a.service.run()
    expect(a.env.core.repos.memos.get(memo.id)?.pinned).toBe(true)
    a.env.core.repos.memos.delete(memo.id)
    await a.service.run()
    await restarted.run()
    expect(b.env.core.repos.memos.get(memo.id)).toBeNull()
  })
  it('preserves concurrent memo edits until an explicit choice and backs up both', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    const memo = addMemo(a.env, 'base')
    await s.connect(a.service)
    await s.connect(b.service)
    a.env.core.repos.memos.update({ ...memo, body: 'A' })
    b.env.core.repos.memos.update({ ...memo, body: 'B' })
    await a.service.run()
    expect((await b.service.run()).conflicts).toBe(1)
    expect(b.env.core.repos.memos.get(memo.id)?.body).toBe('B')
    expect((await b.service.run('remote')).conflicts).toBe(0)
    expect(b.env.core.repos.memos.get(memo.id)?.body).toBe('A')
    expect(b.backups.some((d) => d.memos.some((m) => m.body === 'B'))).toBe(true)
  })
  it('captures cascade deletes and leaves unrelated data local', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    const list = a.env.core.repos.todo.lists()[0]!
    const item = a.env.core.repos.todo.insertItem({
      id: randomUUID(),
      listId: list.id,
      title: 'todo',
      done: false,
      completedAt: null,
      dueDate: null,
      note: '',
      order: 0,
      sprintId: null,
      createdAt: 1,
      updatedAt: 1,
    })
    await s.connect(a.service)
    await s.connect(b.service)
    expect(b.env.core.repos.todo.getItem(item.id)).not.toBeNull()
    a.env.core.repos.todo.deleteList(list.id)
    await a.service.run()
    await b.service.run()
    expect(b.env.core.repos.todo.getItem(item.id)).toBeNull()
    expect(b.env.core.repos.settings.get()).not.toBeNull()
  })
  it('requires consent and never uploads to a different account automatically', async () => {
    const s = await setup(),
      a = await s.client()
    addMemo(a.env, 'private')
    await expect(
      a.service.connect({ url: s.url, token: s.account.token, importLocal: false }),
    ).rejects.toThrow('sync_consent')
    expect(s.store.snapshot(s.account.accountId).document.memos).toHaveLength(0)
    await s.connect(a.service)
    const other = s.store.createAccount('other')
    const impersonated = new SyncService({ ...a.deps, unseal: () => other.token })
    expect((await impersonated.run()).error).toBe('sync_identity')
    expect(s.store.snapshot(other.accountId).document.memos).toHaveLength(0)
  })
  it('retains edits made while the upload is in flight and retries lost acknowledgements', async () => {
    const s = await setup(),
      a = await s.client()
    const memo = addMemo(a.env, 'base')
    await s.connect(a.service)
    a.env.core.repos.memos.update({ ...memo, body: 'sent' })
    let first = true
    const delayed = new SyncService({
      ...a.deps,
      fetch: async (...args) => {
        const r = await fetch(...args)
        if (args[1]?.method === 'POST' && first) {
          first = false
          a.env.core.repos.memos.update({ ...memo, body: 'newer' })
        }
        return r
      },
    })
    await delayed.run()
    expect(a.env.core.repos.memos.get(memo.id)?.body).toBe('newer')
    expect(delayed.status().pending).toBe(1)
    await delayed.run()
    expect(s.store.snapshot(s.account.accountId).document.memos[0]?.body).toBe('newer')
    a.env.core.repos.memos.update({ ...memo, body: 'lost acknowledgement' })
    const lost = new SyncService({
      ...a.deps,
      fetch: async (...args) => {
        const r = await fetch(...args)
        if (args[1]?.method === 'POST') throw new Error('connection_lost')
        return r
      },
    })
    expect((await lost.run()).error).toBe('sync_network')
    expect((await new SyncService(a.deps).run()).pending).toBe(0)
  })
})

it('accepts HTTPS or loopback tunnels, refuses credentials and insecure remote endpoints', () => {
  expect(normalizeSyncUrl('https://example.com/')).toBe('https://example.com')
  expect(normalizeSyncUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
  for (const u of [
    'http://example.com',
    'https://user:password@example.com',
    'file:///tmp/test',
    'https://example.com/?token=x',
  ])
    expect(() => normalizeSyncUrl(u)).toThrow()
})
