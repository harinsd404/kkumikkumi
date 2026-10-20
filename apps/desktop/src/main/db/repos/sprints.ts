import { SprintSchema, type Sprint } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { NotFoundError, type Row } from './rows'

const toSprint = (r: Row): Sprint =>
  SprintSchema.parse({
    id: r['id'],
    name: r['name'],
    goal: r['goal'],
    startDate: r['start_date'],
    endDate: r['end_date'],
    color: r['color'],
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

/** 스프린트(기간 동안 끝낼 일 묶음). 시작 날짜 순. */
export class SprintRepo {
  constructor(private readonly db: Db) {}

  list(): Sprint[] {
    return (
      this.db.prepare('SELECT * FROM sprints ORDER BY start_date, created_at').all() as Row[]
    ).map(toSprint)
  }

  get(id: string): Sprint | null {
    const r = this.db.prepare('SELECT * FROM sprints WHERE id = ?').get(id) as Row | undefined
    return r ? toSprint(r) : null
  }

  count(): number {
    const r = this.db.prepare('SELECT count(*) AS n FROM sprints').get() as Row
    return Number(r['n'])
  }

  insert(sprint: Sprint): Sprint {
    const s = SprintSchema.parse(sprint)
    this.db
      .prepare(
        `INSERT INTO sprints (id, name, goal, start_date, end_date, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.id, s.name, s.goal, s.startDate, s.endDate, s.color, s.createdAt, s.updatedAt)
    return s
  }

  update(sprint: Sprint): Sprint {
    const s = SprintSchema.parse(sprint)
    const { changes } = this.db
      .prepare(
        `UPDATE sprints SET name = ?, goal = ?, start_date = ?, end_date = ?, color = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(s.name, s.goal, s.startDate, s.endDate, s.color, s.updatedAt, s.id)
    if (changes === 0) throw new NotFoundError('sprint')
    return s
  }

  /** 지우면 안의 할 일은 남고 sprint_id만 NULL이 된다(외래 키 ON DELETE SET NULL). */
  delete(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM sprints WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('sprint')
  }
}
