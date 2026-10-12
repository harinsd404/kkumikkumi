import { TodoItemSchema, TodoListSchema, type TodoItem, type TodoList } from '@kkumikkumi/schema'
import { transaction, type Db } from '../connection'
import { bool, int, NotFoundError, type Row } from './rows'

const toList = (r: Row): TodoList =>
  TodoListSchema.parse({
    id: r['id'],
    name: r['name'],
    order: r['ord'],
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

const toItem = (r: Row): TodoItem =>
  TodoItemSchema.parse({
    id: r['id'],
    listId: r['list_id'],
    title: r['title'],
    done: bool(r['done']!),
    completedAt: r['completed_at'],
    dueDate: r['due_date'],
    order: r['ord'],
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

export class TodoRepo {
  constructor(private readonly db: Db) {}

  /* ── 목록 ── */

  lists(): TodoList[] {
    return (
      this.db.prepare('SELECT * FROM todo_lists ORDER BY ord, created_at').all() as Row[]
    ).map(toList)
  }

  getList(id: string): TodoList | null {
    const r = this.db.prepare('SELECT * FROM todo_lists WHERE id = ?').get(id) as Row | undefined
    return r ? toList(r) : null
  }

  /** 기본 목록 = 정렬상 첫 목록. todo 블록의 listId가 null이면 이것을 쓴다. */
  defaultList(): TodoList | null {
    const r = this.db.prepare('SELECT * FROM todo_lists ORDER BY ord, created_at LIMIT 1').get() as
      Row | undefined
    return r ? toList(r) : null
  }

  insertList(list: TodoList): TodoList {
    const l = TodoListSchema.parse(list)
    this.db
      .prepare(
        'INSERT INTO todo_lists (id, name, ord, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(l.id, l.name, l.order, l.createdAt, l.updatedAt)
    return l
  }

  updateList(list: TodoList): TodoList {
    const l = TodoListSchema.parse(list)
    const { changes } = this.db
      .prepare('UPDATE todo_lists SET name = ?, ord = ?, updated_at = ? WHERE id = ?')
      .run(l.name, l.order, l.updatedAt, l.id)
    if (changes === 0) throw new NotFoundError('todo_list')
    return l
  }

  /** 목록을 지우면 항목도 함께 지워진다(ON DELETE CASCADE). */
  deleteList(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM todo_lists WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('todo_list')
  }

  /* ── 항목 ── */

  items(listId: string): TodoItem[] {
    return (
      this.db
        .prepare('SELECT * FROM todo_items WHERE list_id = ? ORDER BY ord, created_at')
        .all(listId) as Row[]
    ).map(toItem)
  }

  /** 캘린더 표시용: 마감일이 [fromDate, toDate] 안에 있는 항목 */
  itemsDueBetween(fromDate: string, toDate: string): TodoItem[] {
    return (
      this.db
        .prepare('SELECT * FROM todo_items WHERE due_date BETWEEN ? AND ? ORDER BY due_date, ord')
        .all(fromDate, toDate) as Row[]
    ).map(toItem)
  }

  /** 목록 끝에 붙일 다음 ord 값 */
  nextItemOrder(listId: string): number {
    const r = this.db
      .prepare('SELECT max(ord) AS m FROM todo_items WHERE list_id = ?')
      .get(listId) as Row | undefined
    return typeof r?.['m'] === 'number' ? r['m'] + 1 : 0
  }

  nextListOrder(): number {
    const r = this.db.prepare('SELECT max(ord) AS m FROM todo_lists').get() as Row | undefined
    return typeof r?.['m'] === 'number' ? r['m'] + 1 : 0
  }

  getItem(id: string): TodoItem | null {
    const r = this.db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as Row | undefined
    return r ? toItem(r) : null
  }

  insertItem(item: TodoItem): TodoItem {
    const i = TodoItemSchema.parse(item)
    this.db
      .prepare(
        `INSERT INTO todo_items (id, list_id, title, done, completed_at, due_date, ord, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        i.id,
        i.listId,
        i.title,
        int(i.done),
        i.completedAt,
        i.dueDate,
        i.order,
        i.createdAt,
        i.updatedAt,
      )
    return i
  }

  updateItem(item: TodoItem): TodoItem {
    const i = TodoItemSchema.parse(item)
    const { changes } = this.db
      .prepare(
        `UPDATE todo_items SET list_id = ?, title = ?, done = ?, completed_at = ?, due_date = ?, ord = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(i.listId, i.title, int(i.done), i.completedAt, i.dueDate, i.order, i.updatedAt, i.id)
    if (changes === 0) throw new NotFoundError('todo_item')
    return i
  }

  deleteItem(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM todo_items WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('todo_item')
  }

  /** ids 순서대로 ord를 0..n-1로 다시 매긴다(드래그 정렬). 목록에 없는 id가 있으면 전체 취소. */
  reorderItems(listId: string, ids: readonly string[], now: number): void {
    transaction(this.db, () => {
      const stmt = this.db.prepare(
        'UPDATE todo_items SET ord = ?, updated_at = ? WHERE id = ? AND list_id = ?',
      )
      ids.forEach((id, ord) => {
        if (stmt.run(ord, now, id, listId).changes === 0) throw new NotFoundError('todo_item')
      })
    })
  }
}
