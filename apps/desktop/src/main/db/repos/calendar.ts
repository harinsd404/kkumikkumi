import { CalendarEventSchema, type CalendarEvent } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { bool, int, NotFoundError, type Row } from './rows'

const toEvent = (r: Row): CalendarEvent => {
  const base = {
    id: r['id'],
    title: r['title'],
    color: r['color'],
    note: r['note'],
    recurrence: null,
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  }
  return CalendarEventSchema.parse(
    bool(r['all_day']!) === true
      ? { ...base, allDay: true, startDate: r['start_date'], endDate: r['end_date'] }
      : { ...base, allDay: false, startUtc: r['start_utc'], endUtc: r['end_utc'], tzid: r['tzid'] },
  )
}

const columns = (e: CalendarEvent) =>
  e.allDay
    ? { startUtc: null, endUtc: null, tzid: null, startDate: e.startDate, endDate: e.endDate }
    : { startUtc: e.startUtc, endUtc: e.endUtc, tzid: e.tzid, startDate: null, endDate: null }

export interface CalendarRange {
  /** 시각 일정: [fromUtc, toUtc) 와 겹치는 것 */
  fromUtc: number
  toUtc: number
  /** 종일 일정: [fromDate, toDate] (포함) 와 겹치는 것 */
  fromDate: string
  toDate: string
}

export class CalendarRepo {
  constructor(private readonly db: Db) {}

  inRange(r: CalendarRange): CalendarEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM calendar_events
         WHERE (all_day = 0 AND start_utc < :toUtc AND end_utc > :fromUtc)
            OR (all_day = 0 AND start_utc = end_utc AND start_utc >= :fromUtc AND start_utc < :toUtc)
            OR (all_day = 1 AND start_date <= :toDate AND end_date >= :fromDate)
         ORDER BY all_day DESC, coalesce(start_date, ''), coalesce(start_utc, 0)`,
      )
      .all({ fromUtc: r.fromUtc, toUtc: r.toUtc, fromDate: r.fromDate, toDate: r.toDate }) as Row[]
    return rows.map(toEvent)
  }

  /**
   * 다가오는(진행 중 포함) 일정: 시각 일정은 끝 >= fromUtc, 종일 일정은 끝 날짜 >= fromDate.
   * 종류마다 시작이 빠른 순으로 최대 limit개씩. 두 종류를 합친 정렬은 호출 측(지역 날짜 기준)이 한다.
   */
  upcoming(q: { fromUtc: number; fromDate: string; limit: number }): CalendarEvent[] {
    const timed = this.db
      .prepare(
        `SELECT * FROM calendar_events WHERE all_day = 0 AND end_utc >= ?
         ORDER BY start_utc, id LIMIT ?`,
      )
      .all(q.fromUtc, q.limit) as Row[]
    const allDay = this.db
      .prepare(
        `SELECT * FROM calendar_events WHERE all_day = 1 AND end_date >= ?
         ORDER BY start_date, id LIMIT ?`,
      )
      .all(q.fromDate, q.limit) as Row[]
    return [...timed, ...allDay].map(toEvent)
  }

  get(id: string): CalendarEvent | null {
    const r = this.db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as
      Row | undefined
    return r ? toEvent(r) : null
  }

  insert(event: CalendarEvent): CalendarEvent {
    const e = CalendarEventSchema.parse(event)
    const c = columns(e)
    this.db
      .prepare(
        `INSERT INTO calendar_events
         (id, title, color, note, all_day, start_utc, end_utc, tzid, start_date, end_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.id,
        e.title,
        e.color,
        e.note,
        int(e.allDay),
        c.startUtc,
        c.endUtc,
        c.tzid,
        c.startDate,
        c.endDate,
        e.createdAt,
        e.updatedAt,
      )
    return e
  }

  update(event: CalendarEvent): CalendarEvent {
    const e = CalendarEventSchema.parse(event)
    const c = columns(e)
    const { changes } = this.db
      .prepare(
        `UPDATE calendar_events SET title = ?, color = ?, note = ?, all_day = ?, start_utc = ?, end_utc = ?, tzid = ?,
           start_date = ?, end_date = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        e.title,
        e.color,
        e.note,
        int(e.allDay),
        c.startUtc,
        c.endUtc,
        c.tzid,
        c.startDate,
        c.endDate,
        e.updatedAt,
        e.id,
      )
    if (changes === 0) throw new NotFoundError('calendar_event')
    return e
  }

  delete(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('calendar_event')
  }
}
