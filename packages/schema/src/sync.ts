import { z } from 'zod'
import { Uuid } from './theme'
import { MemoSchema, SprintSchema, TodoItemSchema, TodoListSchema } from './userdata'

/** v1 deliberately syncs these four collections; other device data stays local. */
export const SYNC_VERSION = 1
export const SYNC_MAX_BYTES = 8 * 1024 * 1024
export const SYNC_COLLECTIONS = ['lists', 'sprints', 'todos', 'memos'] as const
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number]
const shapes = {
  lists: TodoListSchema,
  sprints: SprintSchema,
  todos: TodoItemSchema,
  memos: MemoSchema,
}

export const SyncDocumentSchema = z
  .strictObject({
    lists: z.array(TodoListSchema).max(2000),
    sprints: z.array(SprintSchema).max(2000),
    todos: z.array(TodoItemSchema).max(20000),
    memos: z.array(MemoSchema).max(5000),
  })
  .superRefine((d, ctx) => {
    for (const key of SYNC_COLLECTIONS) {
      if (new Set(d[key].map((v) => v.id)).size !== d[key].length)
        ctx.addIssue({ code: 'custom', message: 'duplicate_id', path: [key] })
    }
    const lists = new Set(d.lists.map((v) => v.id))
    const sprints = new Set(d.sprints.map((v) => v.id))
    if (d.todos.some((v) => !lists.has(v.listId) || (v.sprintId && !sprints.has(v.sprintId))))
      ctx.addIssue({ code: 'custom', message: 'missing_parent' })
  })
export type SyncDocument = z.infer<typeof SyncDocumentSchema>
export type SyncEntity = SyncDocument[SyncCollection][number]
export const emptySyncDocument = (): SyncDocument => ({
  lists: [],
  sprints: [],
  todos: [],
  memos: [],
})

export const SyncChangeSchema = z
  .strictObject({
    collection: z.enum(SYNC_COLLECTIONS),
    id: Uuid,
    value: z.union([TodoListSchema, SprintSchema, TodoItemSchema, MemoSchema]).nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.value && (c.value.id !== c.id || !shapes[c.collection].safeParse(c.value).success))
      ctx.addIssue({ code: 'custom', message: 'invalid_entity' })
  })
export const SyncPushSchema = z.strictObject({
  protocol: z.literal(SYNC_VERSION),
  mutationId: Uuid,
  revision: z.number().int().nonnegative().safe(),
  changes: z.array(SyncChangeSchema).min(1).max(30000),
})
export type SyncPush = z.infer<typeof SyncPushSchema>
export type SyncChange = z.infer<typeof SyncChangeSchema>
export const SyncSnapshotSchema = z.strictObject({
  protocol: z.literal(SYNC_VERSION),
  serverId: Uuid,
  accountId: Uuid,
  revision: z.number().int().nonnegative().safe(),
  document: SyncDocumentSchema,
})
export type SyncSnapshot = z.infer<typeof SyncSnapshotSchema>

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const index = (values: SyncEntity[]) => new Map(values.map((v) => [v.id, v]))

export function syncDiff(from: SyncDocument, to: SyncDocument): SyncChange[] {
  const changes: SyncChange[] = []
  for (const collection of SYNC_COLLECTIONS) {
    const a = index(from[collection]),
      b = index(to[collection])
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      if (!equal(a.get(id), b.get(id))) changes.push({ collection, id, value: b.get(id) ?? null })
    }
  }
  return changes
}

export function applySyncChanges(document: SyncDocument, changes: SyncChange[]): SyncDocument {
  const result: Record<SyncCollection, SyncEntity[]> = { ...document }
  for (const key of SYNC_COLLECTIONS) {
    const values = index(document[key])
    for (const c of changes.filter((v) => v.collection === key)) {
      if (c.value) values.set(c.id, c.value)
      else values.delete(c.id)
    }
    result[key] = [...values.values()].sort((a, b) => a.id.localeCompare(b.id))
  }
  return SyncDocumentSchema.parse(result)
}

/** Three-way merge: deletion is absence relative to the durable acknowledged base.
 * Never use device wall-clock times to choose a winner. A delete/edit race is a conflict too.
 */
export function mergeSyncDocuments(
  base: SyncDocument,
  local: SyncDocument,
  remote: SyncDocument,
  prefer?: 'local' | 'remote',
): { document: SyncDocument; conflicts: string[] } {
  const result: Record<SyncCollection, SyncEntity[]> = { ...emptySyncDocument() }
  const conflicts: string[] = []
  for (const key of SYNC_COLLECTIONS) {
    const b = index(base[key]),
      l = index(local[key]),
      r = index(remote[key])
    for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
      const before = b.get(id),
        mine = l.get(id),
        theirs = r.get(id)
      let next: SyncEntity | undefined
      if (equal(mine, theirs) || equal(theirs, before)) next = mine
      else if (equal(mine, before)) next = theirs
      else {
        conflicts.push(`${key}/${id}`)
        next = prefer === 'remote' ? theirs : mine
      }
      if (next) result[key].push(next)
    }
  }
  const parsed = SyncDocumentSchema.safeParse(result)
  // A parent deletion racing with a child edit needs a whole-document choice.
  // Keep both snapshots intact rather than cascading away unsent child edits.
  if (!parsed.success)
    return { document: prefer === 'remote' ? remote : local, conflicts: ['relationships'] }
  return { document: parsed.data, conflicts }
}
