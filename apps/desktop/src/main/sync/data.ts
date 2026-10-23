import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import {
  ASSET_EXT_BY_MIME,
  LIMITS,
  SYNC_BLOB_MAX_BYTES,
  SyncDocumentSchema,
  ThemeSchema,
  Uuid,
  syncBlobRefs,
  type SyncDocument,
} from '@kkumikkumi/schema'
import type { AppCore } from '../bootstrap'
import { transaction, type Db } from '../db/connection'
import { SyncError } from './service'

type Ref = ReturnType<typeof syncBlobRefs>[number]
const digest = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const filename = (r: Ref) => `${r.hash}.${ASSET_EXT_BY_MIME[r.mime]}`
function atomic(path: string, bytes: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.tmp-${randomUUID()}`
  const fd = openSync(tmp, 'wx', 0o600)
  try {
    writeFileSync(fd, bytes)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
  try {
    const dir = openSync(dirname(path), 'r')
    try {
      fsyncSync(dir)
    } finally {
      closeSync(dir)
    }
  } catch {
    /* Windows cannot fsync a directory. */
  }
}

/** A committed SQLite outbox makes multi-file replacement restartable. Files are
 * immutable in the blob cache before the transaction; replay runs before bootstrap
 * pruning and before every IPC/MCP operation. No operation observes a partial apply.
 */
export function recoverSyncFiles(db: Db, root: string) {
  const row = db.prepare("SELECT value FROM settings WHERE key='sync.files'").get()
  if (!row) return
  const d = SyncDocumentSchema.parse(JSON.parse(String(row['value'])))
  const themesRoot = join(root, 'themes')
  mkdirSync(themesRoot, { recursive: true, mode: 0o700 })
  const materialize = (path: string, ref: Ref) => {
    const bytes = readFileSync(join(root, 'sync-blobs', ref.hash))
    if (digest(bytes) !== ref.hash) throw new SyncError('sync_blob')
    if (!existsSync(path) || digest(readFileSync(path)) !== ref.hash) atomic(path, bytes)
  }
  for (const t of d.themes) {
    for (const a of t.assets) materialize(join(themesRoot, t.id, 'assets', filename(a)), a)
    atomic(join(themesRoot, t.id, 'theme.json'), JSON.stringify(t))
  }
  for (const e of d.diary)
    for (const p of e.photos) materialize(join(root, 'diary', filename(p)), p)
  const keep = new Set(d.themes.map((t) => t.id))
  for (const id of readdirSync(themesRoot)) {
    if (Uuid.safeParse(id).success && !keep.has(id)) {
      // Retain deleted themes as a local recovery copy, outside ThemeStore's listing.
      renameSync(join(themesRoot, id), join(themesRoot, `.sync-removed-${id}-${randomUUID()}`))
    }
  }
  db.prepare("DELETE FROM settings WHERE key='sync.files'").run()
}

export class SyncData {
  private operations = 0
  private validated = new Set<string>()
  constructor(
    private readonly core: AppCore,
    private readonly root: string,
  ) {}
  async guard<T>(operation: () => Promise<T>): Promise<T> {
    recoverSyncFiles(this.core.db, this.root)
    this.operations++
    try {
      return await operation()
    } finally {
      this.operations--
    }
  }
  private idle() {
    if (this.operations) throw new SyncError('sync_unsaved')
    recoverSyncFiles(this.core.db, this.root)
  }
  read(): SyncDocument {
    this.idle()
    const r = this.core.repos
    const lists = r.todo.lists()
    const themes = readdirSync(join(this.root, 'themes'))
      .filter((id) => Uuid.safeParse(id).success)
      .map((id) =>
        ThemeSchema.parse(
          JSON.parse(readFileSync(join(this.root, 'themes', id, 'theme.json'), 'utf8')),
        ),
      )
    return SyncDocumentSchema.parse({
      lists,
      todos: lists.flatMap((l) => r.todo.items(l.id)),
      sprints: r.sprints.list(),
      memos: r.memos.list(),
      calendarEvents: r.calendar.all(),
      timetables: r.timetable.listTimetables(),
      timetableEntries: r.timetable.list(),
      habits: r.habits.list(),
      habitChecks: r.habits
        .checks('0000-01-01', '9999-12-31')
        .map((c) => ({ ...c, id: `${c.habitId}/${c.date}` })),
      diary: r.diary.range('0000-01-01', '9999-12-31').map((e) => ({ ...e, id: e.date })),
      timerSessions: r.timerSessions.all(),
      themes,
      themeRules: r.themeRules.list(),
      colorCombos: r.settings.colorCombos(),
      preferences: [
        { id: 'app', value: r.settings.get() },
        { id: 'pomodoro', value: r.settings.pomodoro() },
        { id: 'miniTimer', value: r.settings.miniTimer() },
        { id: 'timetablePrefs', value: r.settings.timetablePrefs() },
      ],
    })
  }
  private cachePath(hash: string) {
    return join(this.root, 'sync-blobs', hash)
  }
  private async validate(bytes: Buffer, ref: Ref) {
    if (!bytes.length || bytes.length > SYNC_BLOB_MAX_BYTES || digest(bytes) !== ref.hash)
      throw new SyncError('sync_blob')
    const validationKey = JSON.stringify(ref)
    if (this.validated.has(validationKey)) return
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    if ((ref.mime === 'image/png' && !png) || (ref.mime === 'image/jpeg' && !jpeg))
      throw new SyncError('sync_blob')
    const decoder = sharp(bytes, { limitInputPixels: LIMITS.maxAssetPx ** 2, failOn: 'warning' })
    const m = await decoder.metadata()
    if (
      !m.width ||
      !m.height ||
      m.width > LIMITS.maxAssetPx ||
      m.height > LIMITS.maxAssetPx ||
      (m.pages ?? 1) !== 1
    )
      throw new SyncError('sync_blob')
    if (
      'bytes' in ref &&
      'width' in ref &&
      'height' in ref &&
      (ref.bytes !== bytes.length || ref.width !== m.width || ref.height !== m.height)
    )
      throw new SyncError('sync_blob')
    await decoder.raw().toBuffer() // Decode fully; a valid header alone is insufficient.
    this.validated.add(validationKey)
  }
  /** Cache local files before upload/backup; references never become visible before their bytes. */
  async cacheLocal(d: SyncDocument) {
    const sources = new Map<string, string>()
    for (const t of d.themes)
      for (const a of t.assets)
        sources.set(a.hash, join(this.root, 'themes', t.id, 'assets', filename(a)))
    for (const e of d.diary)
      for (const p of e.photos) sources.set(p.hash, join(this.root, 'diary', filename(p)))
    for (const ref of syncBlobRefs(d)) {
      const bytes = readFileSync(sources.get(ref.hash)!)
      await this.validate(bytes, ref)
      if (!existsSync(this.cachePath(ref.hash))) atomic(this.cachePath(ref.hash), bytes)
    }
  }
  async transfer(
    d: SyncDocument,
    request: (hash: string, method: 'GET' | 'HEAD' | 'PUT', bytes?: Buffer) => Promise<Response>,
    upload: boolean,
  ) {
    const seen = new Set<string>()
    for (const ref of syncBlobRefs(d)) {
      let bytes: Buffer
      const path = this.cachePath(ref.hash)
      if (existsSync(path)) bytes = readFileSync(path)
      else {
        const response = await request(ref.hash, 'GET')
        if (!response.ok || !response.body) throw new SyncError('sync_blob')
        const chunks: Uint8Array[] = []
        let size = 0
        const reader = response.body.getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.length
            if (size > SYNC_BLOB_MAX_BYTES) {
              await reader.cancel()
              throw new SyncError('sync_too_large')
            }
            chunks.push(value)
          }
        } finally {
          reader.releaseLock()
        }
        bytes = Buffer.concat(chunks)
      }
      await this.validate(bytes, ref)
      if (!existsSync(path)) atomic(path, bytes)
      if (upload && !seen.has(ref.hash)) {
        const response = await request(ref.hash, 'HEAD')
        if (response.status === 404) {
          if (!(await request(ref.hash, 'PUT', bytes)).ok) throw new SyncError('sync_blob')
        } else if (!response.ok) throw new SyncError('sync_blob')
      }
      seen.add(ref.hash)
    }
  }
  commit(d: SyncDocument, save: () => void) {
    d = SyncDocumentSchema.parse(d)
    this.idle()
    // Verify the complete file set before committing the durable replay intent.
    for (const ref of syncBlobRefs(d))
      if (digest(readFileSync(this.cachePath(ref.hash))) !== ref.hash)
        throw new SyncError('sync_blob')
    transaction(this.core.db, () => {
      const { db, repos: r } = this.core
      db.exec(
        'DELETE FROM todo_items; DELETE FROM todo_lists; DELETE FROM sprints; DELETE FROM memos; DELETE FROM calendar_events; DELETE FROM timetable_entries; DELETE FROM timetables; DELETE FROM habit_checks; DELETE FROM habits; DELETE FROM diary_entries; DELETE FROM timer_sessions; DELETE FROM theme_rules;',
      )
      for (const v of d.lists) r.todo.insertList(v)
      for (const v of d.sprints) r.sprints.insert(v)
      for (const v of d.todos) r.todo.insertItem(v)
      for (const v of d.memos) r.memos.insert(v)
      for (const v of d.calendarEvents) r.calendar.insert(v)
      for (const v of d.timetables) r.timetable.insertTimetable(v)
      for (const v of d.timetableEntries) r.timetable.insert(v)
      for (const v of d.habits) r.habits.insert(v)
      for (const v of d.habitChecks) r.habits.setCheck(v.habitId, v.date, true, Date.now())
      for (const v of d.diary) {
        const { id, ...entry } = v
        void id
        r.diary.upsert(entry)
      }
      for (const v of d.timerSessions) r.timerSessions.insert(v)
      for (const v of d.themeRules) r.themeRules.insert(v)
      r.settings.saveColorCombos(d.colorCombos)
      for (const p of d.preferences) {
        if (p.id === 'app') r.settings.save(p.value)
        if (p.id === 'pomodoro') r.settings.savePomodoro(p.value)
        if (p.id === 'miniTimer') r.settings.saveMiniTimer(p.value)
        if (p.id === 'timetablePrefs') r.settings.saveTimetablePrefs(p.value)
      }
      db.prepare(
        "INSERT INTO settings(key,value) VALUES ('sync.files',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(JSON.stringify(d))
      save()
    })
    recoverSyncFiles(this.core.db, this.root)
  }
}
