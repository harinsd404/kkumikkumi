import { TimetableEntrySchema, type TimetableEntry } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { ConflictError, NotFoundError, type Row } from './rows'

const toEntry = (r: Row): TimetableEntry =>
  TimetableEntrySchema.parse({
    id: r['id'],
    slot:
      r['kind'] === 'period'
        ? { kind: 'period', day: r['day'], period: r['period'] }
        : { kind: 'time', day: r['day'], start: r['start_time'], end: r['end_time'] },
    subject: r['subject'],
    room: r['room'],
    color: r['color'],
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

  list(): TimetableEntry[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM timetable_entries ORDER BY day, kind, period, start_time, created_at',
        )
        .all() as Row[]
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
        "SELECT id FROM timetable_entries WHERE kind = 'period' AND day = ? AND period = ? AND id != ?",
      )
      .get(e.slot.day, e.slot.period, e.id)
    if (r) throw new ConflictError('timetable_cell')
  }

  insert(entry: TimetableEntry): TimetableEntry {
    const e = TimetableEntrySchema.parse(entry)
    this.assertCellFree(e)
    const c = cols(e)
    this.db
      .prepare(
        `INSERT INTO timetable_entries (id, kind, day, period, start_time, end_time, subject, room, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.id,
        c.kind,
        c.day,
        c.period,
        c.start,
        c.end,
        e.subject,
        e.room,
        e.color,
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
        `UPDATE timetable_entries SET kind = ?, day = ?, period = ?, start_time = ?, end_time = ?, subject = ?, room = ?, color = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(c.kind, c.day, c.period, c.start, c.end, e.subject, e.room, e.color, e.updatedAt, e.id)
    if (changes === 0) throw new NotFoundError('timetable_entry')
    return e
  }

  delete(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM timetable_entries WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('timetable_entry')
  }

  /** 교시 수를 줄일 때: maxPeriod보다 뒤 교시 칸을 지운다. 지운 개수. */
  deletePeriodsAfter(maxPeriod: number): number {
    return Number(
      this.db
        .prepare("DELETE FROM timetable_entries WHERE kind = 'period' AND period > ?")
        .run(maxPeriod).changes,
    )
  }
}
