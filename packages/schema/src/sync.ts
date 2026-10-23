import { z } from 'zod'
import { ThemeSchema, Uuid } from './theme'
import {
  MemoSchema,
  SprintSchema,
  TodoItemSchema,
  TodoListSchema,
  CalendarEventSchema,
  TimetableSchema,
  TimetableEntrySchema,
  HabitSchema,
  HabitCheckSchema,
  DiaryEntrySchema,
  TimerSessionSchema,
  ThemeRuleSchema,
  ColorComboSchema,
  SettingsSchema,
  PomodoroSettingsSchema,
  MiniTimerPrefsSchema,
  TimetablePrefsSchema,
} from './userdata'

export const SYNC_VERSION = 2
export const SYNC_MAX_BYTES = 8 * 1024 * 1024
export const SYNC_BLOB_MAX_BYTES = 5 * 1024 * 1024
export const SYNC_BLOB_QUOTA_BYTES = 512 * 1024 * 1024
const DiarySync = DiaryEntrySchema.extend({ id: z.string() }).refine((v) => v.id === v.date)
const CheckSync = HabitCheckSchema.extend({ id: z.string() }).refine(
  (v) => v.id === `${v.habitId}/${v.date}`,
)
export const SyncPreferenceSchema = z.discriminatedUnion('id', [
  z.strictObject({ id: z.literal('app'), value: SettingsSchema }),
  z.strictObject({ id: z.literal('pomodoro'), value: PomodoroSettingsSchema }),
  z.strictObject({ id: z.literal('miniTimer'), value: MiniTimerPrefsSchema }),
  z.strictObject({ id: z.literal('timetablePrefs'), value: TimetablePrefsSchema }),
])
export const SYNC_COLLECTIONS = [
  'lists',
  'sprints',
  'todos',
  'memos',
  'calendarEvents',
  'timetables',
  'timetableEntries',
  'habits',
  'habitChecks',
  'diary',
  'timerSessions',
  'themes',
  'themeRules',
  'colorCombos',
  'preferences',
] as const
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number]
const shapes = {
  lists: TodoListSchema,
  sprints: SprintSchema,
  todos: TodoItemSchema,
  memos: MemoSchema,
  calendarEvents: CalendarEventSchema,
  timetables: TimetableSchema,
  timetableEntries: TimetableEntrySchema,
  habits: HabitSchema,
  habitChecks: CheckSync,
  diary: DiarySync,
  timerSessions: TimerSessionSchema,
  themes: ThemeSchema,
  themeRules: ThemeRuleSchema,
  colorCombos: ColorComboSchema,
  preferences: SyncPreferenceSchema,
}
// Defaults migrate v1 snapshots without discarding their acknowledged baseline.
export const SyncDocumentSchema = z
  .strictObject({
    lists: z.array(TodoListSchema).max(2000),
    sprints: z.array(SprintSchema).max(2000),
    todos: z.array(TodoItemSchema).max(20000),
    memos: z.array(MemoSchema).max(5000),
    calendarEvents: z.array(CalendarEventSchema).max(20000).default([]),
    timetables: z.array(TimetableSchema).max(1000).default([]),
    timetableEntries: z.array(TimetableEntrySchema).max(20000).default([]),
    habits: z.array(HabitSchema).max(2000).default([]),
    habitChecks: z.array(CheckSync).max(100000).default([]),
    diary: z.array(DiarySync).max(30000).default([]),
    timerSessions: z.array(TimerSessionSchema).max(100000).default([]),
    themes: z.array(ThemeSchema).max(1000).default([]),
    themeRules: z.array(ThemeRuleSchema).max(2000).default([]),
    colorCombos: z.array(ColorComboSchema).max(30).default([]),
    preferences: z.array(SyncPreferenceSchema).max(4).default([]),
  })
  .superRefine((d, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    for (const key of SYNC_COLLECTIONS) {
      if (new Set(d[key].map((v) => v.id)).size !== d[key].length) issue('duplicate_id')
    }
    const lists = new Set(d.lists.map((v) => v.id)),
      sprints = new Set(d.sprints.map((v) => v.id))
    if (d.todos.some((v) => !lists.has(v.listId) || (v.sprintId && !sprints.has(v.sprintId))))
      issue('missing_parent')
    const timetables = new Map(d.timetables.map((v) => [v.id, v])),
      slots = new Set<string>()
    for (const e of d.timetableEntries) {
      const t = timetables.get(e.timetableId)
      if (!t) issue('missing_timetable')
      if (e.slot.kind === 'period') {
        const slot = `${e.timetableId}/${e.slot.day}/${e.slot.period}`
        if (slots.has(slot) || (t && e.slot.period > t.settings.periods.length))
          issue('invalid_slot')
        slots.add(slot)
      }
    }
    const habits = new Set(d.habits.map((v) => v.id)),
      themes = new Set(d.themes.map((v) => v.id))
    if (d.habitChecks.some((v) => !habits.has(v.habitId))) issue('missing_habit')
    if (d.themeRules.some((v) => !themes.has(v.themeId))) issue('missing_theme')
    for (const p of d.preferences) {
      if (
        p.id === 'app' &&
        (!themes.has(p.value.activeThemeId) ||
          (p.value.manualOverride && !themes.has(p.value.manualOverride.themeId)))
      )
        issue('missing_theme')
      if (p.id === 'timetablePrefs' && p.value.activeId && !timetables.has(p.value.activeId))
        issue('missing_timetable')
    }
  })
export type SyncDocument = z.infer<typeof SyncDocumentSchema>
export type SyncEntity = SyncDocument[SyncCollection][number]
export const emptySyncDocument = (): SyncDocument =>
  SyncDocumentSchema.parse({ lists: [], sprints: [], todos: [], memos: [] })
export const SyncChangeSchema = z
  .strictObject({
    collection: z.enum(SYNC_COLLECTIONS),
    id: z.string().min(1).max(128),
    value: z
      .union([
        TodoListSchema,
        SprintSchema,
        TodoItemSchema,
        MemoSchema,
        CalendarEventSchema,
        TimetableSchema,
        TimetableEntrySchema,
        HabitSchema,
        CheckSync,
        DiarySync,
        TimerSessionSchema,
        ThemeSchema,
        ThemeRuleSchema,
        ColorComboSchema,
        SyncPreferenceSchema,
      ])
      .nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.value && (c.value.id !== c.id || !shapes[c.collection].safeParse(c.value).success))
      ctx.addIssue({ code: 'custom', message: 'invalid_entity' })
  })
/** Only validated image references are transported; no client-controlled paths. */
export function syncBlobRefs(d: SyncDocument) {
  return [...d.themes.flatMap((t) => t.assets), ...d.diary.flatMap((e) => e.photos)]
}
export const SyncPushSchema = z.strictObject({
  protocol: z.literal(SYNC_VERSION),
  mutationId: Uuid,
  revision: z.number().int().nonnegative().safe(),
  changes: z.array(SyncChangeSchema).min(1).max(200000),
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
