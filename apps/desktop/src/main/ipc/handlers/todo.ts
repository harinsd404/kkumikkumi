import { DateStr, TodoItemSchema, TodoListSchema, Uuid, type TodoList } from '@kkumikkumi/schema'
import { z } from 'zod'
import { NotFoundError } from '../../db/repos'
import { IdIn, NoInput } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

export function todoHandlers(d: HandlerDeps): HandlersOf<'todo'> {
  const { repos } = d

  /** 스프린트 연결: null이면 연결 없음, 있으면 그 스프린트가 있어야 한다 */
  const checkSprint = (sprintId: string | null | undefined) => {
    if (sprintId && !repos.sprints.get(sprintId)) throw new NotFoundError('sprint')
  }

  const resolveList = (listId: string | null): TodoList => {
    if (listId !== null) {
      const l = repos.todo.getList(listId)
      if (!l) throw new NotFoundError('todo_list')
      return l
    }
    const def = repos.todo.defaultList()
    if (def) return def
    const now = d.now()
    return repos.todo.insertList({
      id: d.newId(),
      name: d.defaultListName ?? '할 일',
      order: 0,
      createdAt: now,
      updatedAt: now,
    })
  }

  return {
    'todo.lists.list': async (i) => {
      NoInput.parse(i)
      return repos.todo.lists()
    },
    'todo.lists.create': async (i) => {
      const { name } = z.strictObject({ name: TodoListSchema.shape.name }).parse(i)
      const now = d.now()
      return repos.todo.insertList({
        id: d.newId(),
        name,
        order: repos.todo.nextListOrder(),
        createdAt: now,
        updatedAt: now,
      })
    },
    'todo.lists.update': async (i) => {
      const { id, ...patch } = z
        .strictObject({
          id: Uuid,
          name: TodoListSchema.shape.name.optional(),
          order: TodoListSchema.shape.order.optional(),
        })
        .parse(i)
      const cur = repos.todo.getList(id)
      if (!cur) throw new NotFoundError('todo_list')
      return repos.todo.updateList({
        ...cur,
        name: patch.name ?? cur.name,
        order: patch.order ?? cur.order,
        updatedAt: d.now(),
      })
    },
    'todo.lists.delete': async (i) => {
      repos.todo.deleteList(IdIn.parse(i).id)
      return null
    },
    'todo.items.list': async (i) => {
      const { listId } = z.strictObject({ listId: Uuid.nullable() }).parse(i)
      const list = resolveList(listId)
      return { list, items: repos.todo.items(list.id) }
    },
    'todo.items.create': async (i) => {
      const { listId, title, dueDate, sprintId } = z
        .strictObject({
          listId: Uuid.nullable(),
          title: TodoItemSchema.shape.title,
          dueDate: DateStr.nullable().optional(),
          sprintId: Uuid.nullable().optional(),
        })
        .parse(i)
      checkSprint(sprintId)
      const list = resolveList(listId)
      const now = d.now()
      return repos.todo.insertItem({
        id: d.newId(),
        listId: list.id,
        title,
        done: false,
        completedAt: null,
        dueDate: dueDate ?? null,
        note: '',
        order: repos.todo.nextItemOrder(list.id),
        sprintId: sprintId ?? null,
        createdAt: now,
        updatedAt: now,
      })
    },
    'todo.items.update': async (i) => {
      const { id, patch } = z
        .strictObject({
          id: Uuid,
          patch: z.strictObject({
            title: TodoItemSchema.shape.title.optional(),
            done: z.boolean().optional(),
            dueDate: DateStr.nullable().optional(),
            note: TodoItemSchema.shape.note.optional(),
            listId: Uuid.optional(),
            sprintId: Uuid.nullable().optional(),
          }),
        })
        .parse(i)
      checkSprint(patch.sprintId)
      const cur = repos.todo.getItem(id)
      if (!cur) throw new NotFoundError('todo_item')
      const now = d.now()
      const done = patch.done ?? cur.done
      const movedList = patch.listId !== undefined && patch.listId !== cur.listId
      if (movedList && !repos.todo.getList(patch.listId!)) throw new NotFoundError('todo_list')
      const saved = repos.todo.updateItem({
        ...cur,
        title: patch.title ?? cur.title,
        dueDate: patch.dueDate === undefined ? cur.dueDate : patch.dueDate,
        note: patch.note ?? cur.note,
        listId: patch.listId ?? cur.listId,
        sprintId: patch.sprintId === undefined ? cur.sprintId : patch.sprintId,
        order: movedList ? repos.todo.nextItemOrder(patch.listId!) : cur.order,
        done,
        completedAt: done ? (cur.done ? cur.completedAt : now) : null,
        updatedAt: now,
      })
      // 저장이 끝난 뒤에만 완료 이벤트를 낸다
      if (done && !cur.done) d.onTodoCompleted?.()
      return saved
    },
    'todo.items.delete': async (i) => {
      repos.todo.deleteItem(IdIn.parse(i).id)
      return null
    },
    'todo.items.reorder': async (i) => {
      const { listId, ids } = z
        .strictObject({
          listId: Uuid,
          ids: z
            .array(Uuid)
            .max(10_000)
            .refine((a) => new Set(a).size === a.length),
        })
        .parse(i)
      repos.todo.reorderItems(listId, ids, d.now())
      return null
    },
    'todo.items.dueBetween': async (i) => {
      const { fromDate, toDate } = z.strictObject({ fromDate: DateStr, toDate: DateStr }).parse(i)
      return repos.todo.itemsDueBetween(fromDate, toDate)
    },
  }
}
