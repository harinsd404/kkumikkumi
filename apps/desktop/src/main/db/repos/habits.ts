import { HabitCheckSchema, HabitSchema, type Habit, type HabitCheck } from '@kkumikkumi/schema'
import { transaction, type Db } from '../connection'
import { NotFoundError, type Row } from './rows'

const toHabit = (r: Row): Habit =>
  HabitSchema.parse({
    id: r['id'],
    name: r['name'],
    color: r['color'],
    days: r['days'],
    order: r['ord'],
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

/** 습관과 날짜별 체크 */
export class HabitRepo {
  constructor(private readonly db: Db) {}

  list(): Habit[] {
    return (this.db.prepare('SELECT * FROM habits ORDER BY ord, created_at').all() as Row[]).map(
      toHabit,
    )
  }

  get(id: string): Habit | null {
    const r = this.db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as Row | undefined
    return r ? toHabit(r) : null
  }

  count(): number {
    return Number((this.db.prepare('SELECT count(*) AS n FROM habits').get() as Row)['n'])
  }

  nextOrder(): number {
    const r = this.db.prepare('SELECT max(ord) AS m FROM habits').get() as Row | undefined
    return typeof r?.['m'] === 'number' ? r['m'] + 1 : 0
  }

  insert(habit: Habit): Habit {
    const h = HabitSchema.parse(habit)
    this.db
      .prepare(
        'INSERT INTO habits (id, name, color, days, ord, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(h.id, h.name, h.color, h.days, h.order, h.createdAt, h.updatedAt)
    return h
  }

  update(habit: Habit): Habit {
    const h = HabitSchema.parse(habit)
    const { changes } = this.db
      .prepare(
        'UPDATE habits SET name = ?, color = ?, days = ?, ord = ?, updated_at = ? WHERE id = ?',
      )
      .run(h.name, h.color, h.days, h.order, h.updatedAt, h.id)
    if (changes === 0) throw new NotFoundError('habit')
    return h
  }

  /** 체크 기록도 함께 지워진다(ON DELETE CASCADE) */
  delete(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM habits WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('habit')
  }

  /** ids 순서대로 ord를 다시 매긴다. 없는 id가 있으면 전체 취소 */
  reorder(ids: readonly string[], now: number): void {
    transaction(this.db, () => {
      const stmt = this.db.prepare('UPDATE habits SET ord = ?, updated_at = ? WHERE id = ?')
      ids.forEach((id, i) => {
        if (stmt.run(i, now, id).changes === 0) throw new NotFoundError('habit')
      })
    })
  }

  /** [fromDate, toDate] 안의 체크 */
  checks(fromDate: string, toDate: string): HabitCheck[] {
    return (
      this.db
        .prepare(
          'SELECT habit_id, date FROM habit_checks WHERE date BETWEEN ? AND ? ORDER BY date, habit_id',
        )
        .all(fromDate, toDate) as Row[]
    ).map((r) => HabitCheckSchema.parse({ habitId: r['habit_id'], date: r['date'] }))
  }

  setCheck(habitId: string, date: string, done: boolean, now: number): void {
    if (done)
      this.db
        .prepare(
          'INSERT INTO habit_checks (habit_id, date, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
        )
        .run(habitId, date, now)
    else
      this.db.prepare('DELETE FROM habit_checks WHERE habit_id = ? AND date = ?').run(habitId, date)
  }
}
