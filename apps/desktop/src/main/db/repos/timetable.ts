import {
  TimetableEntrySchema,
  TimetableSchema,
  type Timetable,
  type TimetableEntry,
} from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { ConflictError, NotFoundError, type Row } from './rows'

const toTimetable = (r: Row): Timetable =>
  TimetableSchema.parse({
    id: r['id'],
    name: r['name'],
    settings: JSON.parse(String(r['settings'])),
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

const toEntry = (r: Row): TimetableEntry =>
  TimetableEntrySchema.parse({
    id: r['id'],
    timetableId: r['timetable_id'],
    slot:
      r['kind'] === 'period'
        ? { kind: 'period', day: r['day'], period: r['period'] }
        : { kind: 'time', day: r['day'], start: r['start_time'], end: r['end_time'] },
    subject: r['subject'],
    room: r['room'],
    tone: r['tone'],
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

/** 슬롯 → 열 값 */
const cols = (e: TimetableEntry) =>
  e.slot.kind === 'period'
    ? { kind: 'period', day: e.slot.day, period: e.slot.period, start: null, end: null }
    : { kind: 'time', day: e.slot.day, period: null, start: e.slot.start, end: e.slot.end }

export class TimetableRepo {
  constructor(private readonly db: Db) {}

  /* ── 시간표 ── */

  /** 만든 순서 */
  listTimetables(): Timetable[] {
    return (this.db.prepare('SELECT * FROM timetables ORDER BY rowid').all() as Row[]).map(
      toTimetable,
    )
  }

  getTimetable(id: string): Timetable | null {
    const r = this.db.prepare('SELECT * FROM timetables WHERE id = ?').get(id) as Row | undefined
    return r ? toTimetable(r) : null
  }

  countTimetables(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM timetables').get() as Row
    return Number(r['n'])
  }

  insertTimetable(timetable: Timetable): Timetable {
    const t = TimetableSchema.parse(timetable)
    this.db
      .prepare(
        'INSERT INTO timetables (id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(t.id, t.name, JSON.stringify(t.settings), t.createdAt, t.updatedAt)
    return t
  }

  updateTimetable(timetable: Timetable): Timetable {
    const t = TimetableSchema.parse(timetable)
    const { changes } = this.db
      .prepare('UPDATE timetables SET name = ?, settings = ?, updated_at = ? WHERE id = ?')
      .run(t.name, JSON.stringify(t.settings), t.updatedAt, t.id)
    if (changes === 0) throw new NotFoundError('timetable')
    return t
  }

  /** 칸/항목도 함께 지워진다(ON DELETE CASCADE) */
  deleteTimetable(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM timetables WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('timetable')
  }

  /* ── 칸/항목 ── */

  /** 모든 시간표의 항목 */
  list(): TimetableEntry[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM timetable_entries ORDER BY day, kind, period, start_time, created_at',
        )
        .all() as Row[]
    ).map(toEntry)
  }

  listOf(timetableId: string): TimetableEntry[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM timetable_entries WHERE timetable_id = ? ORDER BY day, kind, period, start_time, created_at',
        )
        .all(timetableId) as Row[]
    ).map(toEntry)
  }

  get(id: string): TimetableEntry | null {
    const r = this.db.prepare('SELECT * FROM timetable_entries WHERE id = ?').get(id) as
      Row | undefined
    return r ? toEntry(r) : null
  }

  /** 교시 칸이 이미 다른 항목으로 채워져 있으면 ConflictError */
  private assertCellFree(e: TimetableEntry): void {
    if (e.slot.kind !== 'period') return
    const r = this.db
      .prepare(
        "SELECT id FROM timetable_entries WHERE timetable_id = ? AND kind = 'period' AND day = ? AND period = ? AND id != ?",
      )
      .get(e.timetableId, e.slot.day, e.slot.period, e.id)
    if (r) throw new ConflictError('timetable_cell')
  }

  insert(entry: TimetableEntry): TimetableEntry {
    const e = TimetableEntrySchema.parse(entry)
    this.assertCellFree(e)
    const c = cols(e)
    this.db
      .prepare(
        `INSERT INTO timetable_entries (id, timetable_id, kind, day, period, start_time, end_time, subject, room, tone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.id,
        e.timetableId,
        c.kind,
        c.day,
        c.period,
        c.start,
        c.end,
        e.subject,
        e.room,
        e.tone,
        e.createdAt,
        e.updatedAt,
      )
    return e
  }

  update(entry: TimetableEntry): TimetableEntry {
    const e = TimetableEntrySchema.parse(entry)
    this.assertCellFree(e)
    const c = cols(e)
    const { changes } = this.db
      .prepare(
        `UPDATE timetable_entries SET kind = ?, day = ?, period = ?, start_time = ?, end_time = ?, subject = ?, room = ?, tone = ?, updated_at = ?
         WHERE id = ? AND timetable_id = ?`,
      )
      .run(
        c.kind,
        c.day,
        c.period,
        c.start,
        c.end,
        e.subject,
        e.room,
        e.tone,
        e.updatedAt,
        e.id,
        e.timetableId,
      )
    if (changes === 0) throw new NotFoundError('timetable_entry')
    return e
  }

  delete(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM timetable_entries WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('timetable_entry')
  }

  /** 교시 수를 줄일 때: 그 시간표에서 maxPeriod보다 뒤 교시 칸을 지운다. 지운 개수. */
  deletePeriodsAfter(timetableId: string, maxPeriod: number): number {
    return Number(
      this.db
        .prepare(
          "DELETE FROM timetable_entries WHERE timetable_id = ? AND kind = 'period' AND period > ?",
        )
        .run(timetableId, maxPeriod).changes,
    )
  }
}
