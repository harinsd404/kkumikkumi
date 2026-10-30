import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { DEFAULT_TIMETABLE, syncDiff, type SyncDocument } from '@kkumikkumi/schema'
import { makeEnv } from '../../__tests__/helpers'
import { bootstrap } from '../../bootstrap'
import { SyncData } from '../data'
import { SyncService } from '../service'
import { SyncStore } from '../../../../../sync-server/src/store'
import { createSyncHttpServer } from '../../../../../sync-server/src/http'
import { createHandlers } from '../../ipc/handlers'
import { DEFAULT_TIMER } from '../../../shared/timer'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const c of cleanups.splice(0).reverse()) await c()
})
async function setup() {
  const store = new SyncStore(':memory:')
  cleanups.push(() => store.close())
  const account = store.createAccount('test')
  const server = createSyncHttpServer(store)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        server.close(() => r())
        server.closeAllConnections()
      }),
  )
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  async function client() {
    const env = await makeEnv()
    cleanups.push(() => env.cleanup())
    const data = new SyncData(env.core, env.dir),
      backups: SyncDocument[] = []
    const flush: (lock?: boolean) => Promise<void> = async () => {}
    const deps = {
      ...env.core,
      data,
      seal: (s: string) => s,
      unseal: (s: string) => s,
      backup: async (d: SyncDocument) => {
        backups.push(d)
      },
      changed() {},
      flush,
    }
    const service = new SyncService(deps)
    const app = { version: 'test', openFolder: async () => {} }
    const handlers = createHandlers({
      ...env.core,
      sync: service,
      syncData: data,
      now: () => env.clock.now,
      newId: env.newId,
      pickImageFile: async () => null,
      timer: {
        get: () => ({ ...DEFAULT_TIMER, updatedAt: env.clock.now }),
        command: () => ({ ...DEFAULT_TIMER, updatedAt: env.clock.now }),
        applySettings() {},
      },
      app,
    })
    return { env, data, service, deps, backups, handlers, app }
  }
  return {
    store,
    account,
    url,
    client,
    connect: (service: SyncService) =>
      service.connect({ url, token: account.token, importLocal: true }),
  }
}
async function fill(c: Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['client']>>) {
  const { repos: r, themes, diaryPhotos } = c.env.core
  const now = 1700000000000,
    id = randomUUID()
  r.timetable.insertTimetable({
    id,
    name: '2학년 2반',
    settings: DEFAULT_TIMETABLE,
    createdAt: now,
    updatedAt: now,
  })
  r.timetable.insert({
    id: randomUUID(),
    timetableId: id,
    slot: { kind: 'period', day: 1, period: 1 },
    subject: '네트워크',
    room: '',
    tone: null,
    createdAt: now,
    updatedAt: now,
  })
  r.settings.saveTimetablePrefs({ activeId: id })
  r.calendar.insert({
    id: randomUUID(),
    title: '시험',
    note: '',
    color: '#112233',
    allDay: true,
    startDate: '2026-11-29',
    endDate: '2026-11-29',
    recurrence: null,
    createdAt: now,
    updatedAt: now,
  })
  const habit = r.habits.insert({
    id: randomUUID(),
    name: '공부',
    color: '#112233',
    days: 127,
    order: 0,
    createdAt: now,
    updatedAt: now,
  })
  r.habits.setCheck(habit.id, '2026-10-23', true, now)
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#123456' } })
    .png()
    .toBuffer()
  const photo = {
    hash: createHash('sha256').update(bytes).digest('hex'),
    mime: 'image/png' as const,
  }
  await diaryPhotos.write(photo, bytes)
  r.diary.upsert({
    date: '2026-10-23',
    body: '일기',
    mood: 4,
    photos: [photo],
    createdAt: now,
    updatedAt: now,
  })
  const theme = await themes.read(r.settings.get()!.activeThemeId)
  const asset = { ...photo, width: 2, height: 2, bytes: bytes.length }
  await themes.writeAsset(theme.id, asset, bytes)
  await themes.save({
    ...theme,
    assets: [asset],
    background: { type: 'image', assetHash: photo.hash, fit: 'cover' },
  })
  r.timerSessions.insert({
    id: randomUUID(),
    kind: 'focus',
    pomodoro: false,
    startedAt: now,
    endedAt: now + 1000,
    plannedMs: 1000,
    actualMs: 1000,
    completed: true,
  })
  r.themeRules.insert({
    id: randomUUID(),
    themeId: theme.id,
    enabled: true,
    priority: 1,
    conditions: { timeRange: null, weekdays: [], mode: 'any', appearance: 'any' },
    createdAt: now,
    updatedAt: now,
  })
  r.settings.savePomodoro({ ...r.settings.pomodoro(), focusMin: 30 })
  r.settings.saveColorCombos([
    {
      id: randomUUID(),
      name: '색',
      createdAt: now,
      palette: theme.defaults.palette,
      background: { color: '#ffffff', pattern: null },
    },
  ])
  return { photo, bytes, timetableId: id, themeId: theme.id }
}

describe('full sync', () => {
  it('preserves custom image cells and photos across two clients and server', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    const data = await fill(a)
    const theme = await a.env.core.themes.read(data.themeId)
    const block = theme.blocks.find((x) => x.type === 'image')
    if (!block || block.type !== 'image') throw new Error('missing fixture image')
    block.span = { w: 3, h: 1 }
    block.props.assetHash = data.photo.hash
    block.style.bg = '#112233'
    await a.env.core.themes.save(theme)
    expect((await s.connect(a.service)).error).toBeNull()
    await s.connect(b.service)
    expect((await b.service.run('remote')).error).toBeNull()
    expect((await a.service.run()).error).toBeNull()
    const copy = await b.env.core.themes.read(data.themeId)
    expect(copy.blocks.find((x) => x.id === block.id)).toMatchObject({
      span: { w: 3, h: 1 },
      props: block.props,
      style: block.style,
    })
    const edited = copy.blocks.find((x) => x.id === block.id)!
    if (edited.type !== 'image') throw new Error('wrong fixture image')
    edited.span = { w: 1, h: 1 }
    await b.env.core.themes.save(copy)
    expect((await b.service.run()).error).toBeNull()
    expect((await a.service.run()).error).toBeNull()
    const back = await a.env.core.themes.read(data.themeId)
    expect(back.blocks.find((x) => x.id === block.id)).toMatchObject({
      span: { w: 1, h: 1 },
      props: block.props,
    })
  })
  it.each(['connect', 'run'] as const)(
    'finishes %s when a theme read overlaps the renderer flush',
    async (kind) => {
      const s = await setup(),
        a = await s.client()
      if (kind === 'run') await s.connect(a.service)
      const read = a.env.core.themes.read.bind(a.env.core.themes)
      let reading: Promise<unknown> | undefined
      a.deps.flush = async () => {
        vi.spyOn(a.env.core.themes, 'read').mockImplementationOnce(async (id) => {
          await new Promise((resolve) => setTimeout(resolve, 30))
          return read(id)
        })
        reading = a.handlers['themes.get']({ id: a.env.core.repos.settings.get()!.activeThemeId })
      }
      const result =
        kind === 'connect'
          ? await a.handlers['sync.connect']({
              url: s.url,
              token: s.account.token,
              importLocal: true,
            })
          : await a.handlers['sync.run']({})
      await reading
      expect(result.error).toBeNull()
      expect(result.lastSyncedAt).not.toBeNull()
    },
  )
  it('waits for a real theme save at final apply and preserves it for the next upload', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    await s.connect(a.service)
    await s.connect(b.service)
    expect((await b.handlers['sync.run']({ prefer: 'remote' })).error).toBeNull()
    expect((await a.handlers['sync.run']({})).error).toBeNull()
    const memo = await b.handlers['memos.create']({ body: 'remote edit' })
    expect((await b.handlers['sync.run']({})).error).toBeNull()
    const theme = await a.env.core.themes.read(a.env.core.repos.settings.get()!.activeThemeId)
    const save = a.env.core.themes.save.bind(a.env.core.themes)
    let saving: Promise<unknown> | undefined
    a.deps.flush = async (lock) => {
      if (!lock) return
      vi.spyOn(a.env.core.themes, 'save').mockImplementationOnce(async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return save(value)
      })
      saving = a.handlers['themes.save']({
        theme: { ...theme, background: { type: 'color', color: '#123456', pattern: null } },
      })
    }
    const result = await a.handlers['sync.run']({})
    await saving
    expect(result.error).toBeNull()
    expect(a.env.core.repos.memos.get(memo.id)?.body).toBe('remote edit')
    expect(result.pending).toBeGreaterThan(0)
    a.deps.flush = async () => {}
    expect((await a.handlers['sync.run']({})).error).toBeNull()
    expect(
      s.store.snapshot(s.account.accountId).document.themes.find((t) => t.id === theme.id)
        ?.background,
    ).toEqual({ type: 'color', color: '#123456', pattern: null })
  })
  it('does not treat waiting for the OS to open a folder as an unfinished save', async () => {
    const s = await setup(),
      a = await s.client()
    await s.connect(a.service)
    let release!: () => void
    a.app.openFolder = () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
    const opening = a.handlers['app.openFolder']({ folder: 'logs' })
    let result
    try {
      result = await a.handlers['sync.run']({})
    } finally {
      release()
      await opening
    }
    expect(result.error).toBeNull()
  })
  it('round-trips all content and images, propagates edits/deletes, leaves credentials and device settings local', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    const f = await fill(a)
    a.env.core.repos.settings.saveMcp({ mode: 'readwrite' })
    b.env.core.db.prepare("INSERT INTO settings VALUES ('window.test', ?)").run('{"x":42}')
    expect((await s.connect(a.service)).error).toBeNull()
    // Built-in theme edits on the first device are an explicit first-connection choice.
    await s.connect(b.service)
    expect((await b.service.run('remote')).error).toBeNull()
    expect((await a.service.run()).error).toBeNull()
    expect(syncDiff(a.data.read(), b.data.read())).toEqual([])
    expect(readFileSync(b.env.core.diaryPhotos.path(f.photo))).toEqual(f.bytes)
    expect(readFileSync(b.env.core.themes.assetPath(f.themeId, f.photo))).toEqual(f.bytes)
    expect(b.env.core.repos.settings.mcp().mode).toBe('off')
    expect(
      b.env.core.db.prepare("SELECT value FROM settings WHERE key='window.test'").get()!['value'],
    ).toBe('{"x":42}')
    expect(Number(s.store.db.prepare('SELECT count(*) AS n FROM blobs').get()!['n'])).toBe(1)
    const entry = b.env.core.repos.timetable.list()[0]!
    b.env.core.repos.timetable.update({ ...entry, subject: '운영체제' })
    b.env.core.repos.diary.delete('2026-10-23')
    expect((await b.service.run()).error).toBeNull()
    expect((await a.service.run()).error).toBeNull()
    expect(a.env.core.repos.timetable.list()[0]!.subject).toBe('운영체제')
    expect(a.env.core.repos.diary.get('2026-10-23')).toBeNull()
    expect(syncDiff(a.data.read(), b.data.read())).toEqual([])
  })
  it('keeps the v1 baseline/key and waits for explicit expanded-scope consent', async () => {
    const s = await setup(),
      a = await s.client()
    // An existing v1 state has no extended collections or scopeVersion.
    const local = a.data.read(),
      { lists, todos, sprints, memos } = local
    const base = { lists, todos, sprints, memos }
    s.store.db
      .prepare('UPDATE accounts SET revision=3,document=? WHERE id=?')
      .run(JSON.stringify(base), s.account.accountId)
    a.env.core.db.prepare("INSERT INTO settings VALUES ('sync.v1',?)").run(
      JSON.stringify({
        url: s.url,
        token: s.account.token,
        enabled: true,
        serverId: s.store.serverId,
        accountId: s.account.accountId,
        revision: 3,
        base,
        lastSyncedAt: 1,
      }),
    )
    const service = new SyncService(a.deps)
    expect((await service.run()).requiresUpgrade).toBe(true)
    expect(s.store.snapshot(s.account.accountId).revision).toBe(3)
    expect((await service.upgrade()).error).toBeNull()
    expect(service.status().requiresUpgrade).toBe(false)
    expect(s.store.snapshot(s.account.accountId).document.themes.length).toBeGreaterThan(0)
    expect(a.backups.length).toBe(1)
    expect(
      (
        await fetch(`${s.url}/v1/snapshot`, {
          headers: { Authorization: `Bearer ${s.account.token}` },
        })
      ).status,
    ).toBe(426)
  })
  it('replays a committed file transaction before bootstrap and blocks reads until repair', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    const f = await fill(a),
      d = a.data.read()
    await a.data.cacheLocal(d)
    // Feed verified source bytes through the same remote download boundary.
    await b.data.transfer(d, async () => new Response(new Uint8Array(f.bytes)), false)
    rmSync(join(b.env.dir, 'diary'), { recursive: true, force: true })
    writeFileSync(join(b.env.dir, 'diary'), 'blocks directory creation')
    expect(() => b.data.commit(d, () => {})).toThrow()
    expect(
      b.env.core.db.prepare("SELECT 1 FROM settings WHERE key='sync.files'").get(),
    ).toBeTruthy()
    await expect(b.data.guard(async () => 1)).rejects.toThrow()
    rmSync(join(b.env.dir, 'diary'))
    mkdirSync(join(b.env.dir, 'diary'))
    const recovered = await bootstrap({
      userDataDir: b.env.dir,
      now: Date.now,
      newId: randomUUID,
      defaultThemeName: '기본',
      defaultListName: '할 일',
    })
    expect(readFileSync(recovered.diaryPhotos.path(f.photo))).toEqual(f.bytes)
    expect(
      recovered.db.prepare("SELECT 1 FROM settings WHERE key='sync.files'").get(),
    ).toBeUndefined()
    expect(recovered.repos.timetable.list()[0]!.subject).toBe('네트워크')
    recovered.db.close()
  })
  it('rejects corrupt remote image bytes before changing any metadata', async () => {
    const s = await setup(),
      a = await s.client(),
      b = await s.client()
    const f = await fill(a),
      d = a.data.read(),
      before = b.data.read()
    await expect(
      b.data.transfer(d, async () => new Response('not an image'), false),
    ).rejects.toThrow()
    expect(syncDiff(before, b.data.read())).toEqual([])
    expect(existsSync(b.env.core.diaryPhotos.path(f.photo))).toBe(false)
  })
  it('does not replace files while an asynchronous IPC operation is in flight', async () => {
    const s = await setup(),
      a = await s.client()
    await s.connect(a.service)
    let release!: () => void
    const pending = a.data.guard(
      () =>
        new Promise<void>((r) => {
          release = r
        }),
    )
    setTimeout(release, 30)
    expect((await a.service.run()).error).toBeNull()
    await pending
  })
})
