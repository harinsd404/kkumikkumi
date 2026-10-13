import { MemoSchema, type Memo } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { bool, int, NotFoundError, type Row } from './rows'

const toMemo = (r: Row): Memo =>
  MemoSchema.parse({
    id: r['id'],
    body: r['body'],
    pinned: bool(r['pinned']!),
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

export class MemoRepo {
  constructor(private readonly db: Db) {}

  /** 고정한 메모 먼저, 그다음 최근 수정 순 */
  list(): Memo[] {
    return (
      this.db
        .prepare('SELECT * FROM memos ORDER BY pinned DESC, updated_at DESC, created_at DESC')
        .all() as Row[]
    ).map(toMemo)
  }

  get(id: string): Memo | null {
    const r = this.db.prepare('SELECT * FROM memos WHERE id = ?').get(id) as Row | undefined
    return r ? toMemo(r) : null
  }

  insert(memo: Memo): Memo {
    const m = MemoSchema.parse(memo)
    this.db
      .prepare(
        'INSERT INTO memos (id, body, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(m.id, m.body, int(m.pinned), m.createdAt, m.updatedAt)
    return m
  }

  update(memo: Memo): Memo {
    const m = MemoSchema.parse(memo)
    const { changes } = this.db
      .prepare('UPDATE memos SET body = ?, pinned = ?, updated_at = ? WHERE id = ?')
      .run(m.body, int(m.pinned), m.updatedAt, m.id)
    if (changes === 0) throw new NotFoundError('memo')
    return m
  }

  delete(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM memos WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('memo')
  }
}
