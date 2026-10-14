import {
  CalendarEventSchema,
  DateStr,
  EpochMs,
  MemoSchema,
  Name,
  PomodoroSettingsSchema,
  SettingsSchema,
  ThemeRuleSchema,
  ThemeSchema,
  TimerStateSchema,
  Sha256,
  THEME_PRESET_IDS,
  DEFAULT_TIMETABLE,
  TIMETABLE_MAX_COUNT,
  TimetableContentSchema,
  TimetableEntrySchema,
  TimetableSchema,
  TimetableSettingsSchema,
  TimetableSlotSchema,
  TodoItemSchema,
  TodoListSchema,
  Uuid,
  MiniTimerPrefsSchema,
  type MiniTimerPrefs,
  type Settings,
  type TodoList,
} from '@kkumikkumi/schema'
import { z } from 'zod'
import type { IpcSpec, TimerDoneInfo } from '../../shared/api'
import type { Channel } from '../../shared/channels'
import { readFile } from 'node:fs/promises'
import { DEFAULT_PIPELINE_OPTIONS, processImage, type PipelineOptions } from '../assets/pipeline'
import { cutOutWhite, looksWhiteBackground } from '../assets/whiteBackground'
import { transaction, type Db } from '../db/connection'
import { ConflictError, NotFoundError, type Repos } from '../db/repos'
import type { ThemeStore } from '../themes/themeStore'
import type { TimerService } from '../timer/timerService'

export interface HandlerDeps {
  db: Db
  repos: Repos
  themes: ThemeStore
  now(): number
  newId(): string
  /** 파일 선택 대화상자 → 파일 바이트. 취소하면 null. (electron 의존이라 주입) */
  pickImageFile(purpose: 'image' | 'pet'): Promise<Uint8Array | null>
  pipeline?: PipelineOptions
  /** 고아 에셋 유예 시간 */
  pruneGraceMs?: number
  defaultListName?: string
  timer: Pick<TimerService, 'get' | 'command' | 'applySettings'>
  takeMissedTimerDone?(): TimerDoneInfo | null
  /** 투두 완료 이벤트 발행(이벤트 버스) */
  onTodoCompleted?(): void
  /** 미니 타이머 창 제어(electron 의존이라 주입) */
  miniTimer?: { open(): void; close(): void; apply(prefs: MiniTimerPrefs): void }
}

export type Handlers = { [C in Channel]: (input: unknown) => Promise<IpcSpec[C]['out']> }

const Purpose = z.enum(['image', 'pet'])
const IdIn = z.strictObject({ id: Uuid })
const NoInput = z.undefined()
const TimerCommandSchema = z.discriminatedUnion('cmd', [
  z.strictObject({
    cmd: z.literal('start'),
    durationMs: TimerStateSchema.shape.durationMs,
    mode: TimerStateSchema.shape.mode,
  }),
  z.strictObject({ cmd: z.literal('pause') }),
  z.strictObject({ cmd: z.literal('resume') }),
  z.strictObject({ cmd: z.literal('reset') }),
  z.strictObject({ cmd: z.literal('pomodoro.start') }),
  z.strictObject({ cmd: z.literal('pomodoro.skip') }),
  z.strictObject({ cmd: z.literal('pomodoro.stop') }),
])

/** 모든 핸들러는 입력을 zod로 재검증한다. renderer 타입은 신뢰하지 않는다. */
export function createHandlers(d: HandlerDeps): Handlers {
  const pipelineOpts = d.pipeline ?? DEFAULT_PIPELINE_OPTIONS
  const graceMs = d.pruneGraceMs ?? 10 * 60 * 1000
  const { repos, themes } = d

  /** 시간표 전체. 고른 시간표가 없거나 지워졌으면 첫 시간표. */
  const timetableData = () => {
    const timetables = repos.timetable.listTimetables()
    const saved = repos.settings.timetablePrefs().activeId
    const activeId = timetables.some((t) => t.id === saved) ? saved : (timetables[0]?.id ?? null)
    return { timetables, activeId, entries: repos.timetable.list() }
  }

  /** 없는 시간표 / 그 시간표의 교시 수를 넘는 칸이면 not_found */
  const assertSlot = (timetableId: string, slot: z.infer<typeof TimetableSlotSchema>) => {
    const t = repos.timetable.getTimetable(timetableId)
    if (!t) throw new NotFoundError('timetable')
    if (slot.kind === 'period' && slot.period > t.settings.periods.length)
      throw new NotFoundError('timetable_period')
  }

  const getSettings = (): Settings => {
    const s = repos.settings.get()
    if (!s) throw new NotFoundError('settings')
    return s
  }

  const assertTheme = async (id: string) => {
    await themes.read(id) // 없거나 손상이면 ThemeStoreError
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

  const importBytes = async (themeId: string, purpose: 'image' | 'pet', bytes: Uint8Array) => {
    await assertTheme(themeId)
    const { asset, data, hasTransparency } = await processImage(bytes, purpose, pipelineOpts)
    await themes.writeAsset(themeId, asset, data)
    const whiteBackground = purpose === 'image' && !hasTransparency && (await looksWhite(data))
    return { asset, hasTransparency, whiteBackground }
  }
  // 판별 실패는 "흰 배경 아님"으로(가져오기 자체는 이미 성공)
  const looksWhite = (data: Uint8Array) => looksWhiteBackground(data).catch(() => false)

  /** 테마 assets 폴더의 에셋 바이트(확장자는 저장 형식 둘 중 하나) */
  const readAsset = async (themeId: string, hash: string) => {
    for (const mime of ['image/png', 'image/jpeg'] as const) {
      try {
        return new Uint8Array(await readFile(themes.assetPath(themeId, { hash, mime })))
      } catch {
        // 다음 형식
      }
    }
    throw new NotFoundError('asset')
  }

  return {
    /* ── 테마 ── */
    'themes.list': async (i) => {
      NoInput.parse(i)
      return themes.list()
    },
    'themes.get': async (i) => themes.read(IdIn.parse(i).id),
    'themes.create': async (i) => {
      const { name, preset } = z
        .strictObject({ name: Name, preset: z.enum(THEME_PRESET_IDS).optional() })
        .parse(i)
      return themes.create(name, preset)
    },
    'themes.save': async (i) => {
      const { theme } = z.strictObject({ theme: ThemeSchema }).parse(i)
      return themes.save({ ...theme, updatedAt: d.now() })
    },
    'themes.duplicate': async (i) => {
      const { id, name } = z.strictObject({ id: Uuid, name: Name }).parse(i)
      return themes.duplicate(id, name)
    },
    'themes.rename': async (i) => {
      const { id, name } = z.strictObject({ id: Uuid, name: Name }).parse(i)
      return themes.rename(id, name)
    },
    'themes.delete': async (i) => {
      const { id } = IdIn.parse(i)
      await themes.delete(id) // 마지막 테마면 last_theme
      const remaining = (await themes.list()).filter((s) => s.ok)
      const s = getSettings()
      const next: Settings = {
        ...s,
        activeThemeId: s.activeThemeId === id ? remaining[0]!.id : s.activeThemeId,
        manualOverride: s.manualOverride?.themeId === id ? null : s.manualOverride,
      }
      transaction(d.db, () => {
        repos.themeRules.deleteByTheme(id)
        repos.settings.save(next)
      })
      return next
    },
    'themes.pruneAssets': async (i) => themes.pruneAssets(IdIn.parse(i).id, graceMs),

    /* ── 에셋 ── */
    'assets.importFromDialog': async (i) => {
      const { themeId, purpose } = z.strictObject({ themeId: Uuid, purpose: Purpose }).parse(i)
      await assertTheme(themeId)
      const bytes = await d.pickImageFile(purpose)
      return bytes ? importBytes(themeId, purpose, bytes) : null
    },
    'assets.importBytes': async (i) => {
      const { themeId, purpose, bytes } = z
        .strictObject({
          themeId: Uuid,
          purpose: Purpose,
          bytes: z
            .instanceof(Uint8Array)
            .refine((b) => b.byteLength <= pipelineOpts.maxInputBytes, 'too_large'),
        })
        .parse(i)
      return importBytes(themeId, purpose, bytes)
    },

    'assets.removeWhiteBackground': async (i) => {
      const { themeId, hash, strength } = z
        .strictObject({ themeId: Uuid, hash: Sha256, strength: z.number().int().min(0).max(100) })
        .parse(i)
      await assertTheme(themeId)
      const png = await cutOutWhite(await readAsset(themeId, hash), strength)
      const { asset, data, hasTransparency } = await processImage(png, 'image', pipelineOpts)
      await themes.writeAsset(themeId, asset, data)
      return { asset, hasTransparency, whiteBackground: false }
    },

    /* ── 설정 ── */
    'settings.get': async (i) => {
      NoInput.parse(i)
      return getSettings()
    },
    'settings.update': async (i) => {
      const { patch } = z
        .strictObject({
          patch: SettingsSchema.pick({
            activeThemeId: true,
            petEnabled: true,
            autoSwitchEnabled: true,
            manualOverride: true,
          }).partial(),
        })
        .parse(i)
      if (patch.activeThemeId) await assertTheme(patch.activeThemeId)
      if (patch.manualOverride) await assertTheme(patch.manualOverride.themeId)
      const next: Settings = { ...getSettings() }
      if (patch.activeThemeId !== undefined) next.activeThemeId = patch.activeThemeId
      if (patch.petEnabled !== undefined) next.petEnabled = patch.petEnabled
      if (patch.autoSwitchEnabled !== undefined) next.autoSwitchEnabled = patch.autoSwitchEnabled
      if (patch.manualOverride !== undefined) next.manualOverride = patch.manualOverride
      return repos.settings.save(next)
    },

    /* ── 투두 ── */
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
      const { listId, title, dueDate } = z
        .strictObject({
          listId: Uuid.nullable(),
          title: TodoItemSchema.shape.title,
          dueDate: DateStr.nullable().optional(),
        })
        .parse(i)
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
          }),
        })
        .parse(i)
      const cur = repos.todo.getItem(id)
      if (!cur) throw new NotFoundError('todo_item')
      const now = d.now()
      const done = patch.done ?? cur.done
      const movedList = patch.listId !== undefined && patch.listId !== cur.listId
      if (done && !cur.done) d.onTodoCompleted?.()
      return repos.todo.updateItem({
        ...cur,
        title: patch.title ?? cur.title,
        dueDate: patch.dueDate === undefined ? cur.dueDate : patch.dueDate,
        note: patch.note ?? cur.note,
        listId: patch.listId ?? cur.listId,
        order: movedList ? repos.todo.nextItemOrder(patch.listId!) : cur.order,
        done,
        completedAt: done ? (cur.done ? cur.completedAt : now) : null,
        updatedAt: now,
      })
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

    /* ── 캘린더 ── */
    'calendar.range': async (i) =>
      repos.calendar.inRange(
        z
          .strictObject({ fromUtc: EpochMs, toUtc: EpochMs, fromDate: DateStr, toDate: DateStr })
          .parse(i),
      ),
    'calendar.create': async (i) => {
      const { event } = z.strictObject({ event: z.record(z.string(), z.unknown()) }).parse(i)
      const now = d.now()
      // main이 정하는 필드를 마지막에 덮어써서 renderer 값이 이기지 못하게 한다
      const e = CalendarEventSchema.parse({
        ...event,
        id: d.newId(),
        recurrence: null,
        createdAt: now,
        updatedAt: now,
      })
      return repos.calendar.insert(e)
    },
    'calendar.update': async (i) => {
      const { event } = z.strictObject({ event: z.looseObject({ id: Uuid }) }).parse(i)
      const cur = repos.calendar.get(event.id)
      if (!cur) throw new NotFoundError('calendar_event')
      const e = CalendarEventSchema.parse({
        ...event,
        recurrence: null,
        createdAt: cur.createdAt,
        updatedAt: d.now(),
      })
      return repos.calendar.update(e)
    },
    'calendar.delete': async (i) => {
      repos.calendar.delete(IdIn.parse(i).id)
      return null
    },

    /* ── 타이머 ── */
    'timer.get': async (i) => {
      NoInput.parse(i)
      return d.timer.get()
    },
    'timer.command': async (i) => d.timer.command(TimerCommandSchema.parse(i)),
    'timer.takeMissedDone': async (i) => {
      NoInput.parse(i)
      return d.takeMissedTimerDone?.() ?? null
    },
    'timer.sessions': async (i) => {
      const { fromMs, toMs } = z.strictObject({ fromMs: EpochMs, toMs: EpochMs }).parse(i)
      return repos.timerSessions.endedBetween(fromMs, toMs)
    },
    'timer.pomodoro.get': async (i) => {
      NoInput.parse(i)
      return repos.settings.pomodoro()
    },
    'timer.pomodoro.update': async (i) => {
      const { patch } = z.strictObject({ patch: PomodoroSettingsSchema.partial() }).parse(i)
      // 빠진 키는 zod가 결과에 넣지 않으므로 현재 값이 남는다
      const saved = repos.settings.savePomodoro(
        PomodoroSettingsSchema.parse({ ...repos.settings.pomodoro(), ...patch }),
      )
      d.timer.applySettings()
      return saved
    },

    /* ── 미니 타이머 창 ── */
    'miniTimer.open': async (i) => {
      NoInput.parse(i)
      d.miniTimer?.open()
      return null
    },
    'miniTimer.close': async (i) => {
      NoInput.parse(i)
      d.miniTimer?.close()
      return null
    },
    'miniTimer.prefs': async (i) => {
      NoInput.parse(i)
      return repos.settings.miniTimer()
    },
    'miniTimer.update': async (i) => {
      const { patch } = z.strictObject({ patch: MiniTimerPrefsSchema.partial() }).parse(i)
      const saved = repos.settings.saveMiniTimer(
        MiniTimerPrefsSchema.parse({ ...repos.settings.miniTimer(), ...patch }),
      )
      d.miniTimer?.apply(saved)
      return saved
    },

    /* ── 메모 ── */
    'memos.list': async (i) => {
      NoInput.parse(i)
      return repos.memos.list()
    },
    'memos.create': async (i) => {
      const { body } = z.strictObject({ body: MemoSchema.shape.body.optional() }).parse(i)
      const now = d.now()
      return repos.memos.insert({
        id: d.newId(),
        body: body ?? '',
        pinned: false,
        createdAt: now,
        updatedAt: now,
      })
    },
    'memos.update': async (i) => {
      const { id, patch } = z
        .strictObject({
          id: Uuid,
          patch: MemoSchema.pick({ body: true, pinned: true }).partial(),
        })
        .parse(i)
      const cur = repos.memos.get(id)
      if (!cur) throw new NotFoundError('memo')
      const bodyChanged = patch.body !== undefined && patch.body !== cur.body
      return repos.memos.update({
        ...cur,
        body: patch.body ?? cur.body,
        pinned: patch.pinned ?? cur.pinned,
        updatedAt: bodyChanged ? d.now() : cur.updatedAt,
      })
    },
    'memos.delete': async (i) => {
      repos.memos.delete(IdIn.parse(i).id)
      return null
    },

    /* ── 시간표 ── */
    'timetable.get': async (i) => {
      NoInput.parse(i)
      return timetableData()
    },
    'timetables.create': async (i) => {
      const { name, copyFrom } = z
        .strictObject({ name: TimetableSchema.shape.name, copyFrom: Uuid.optional() })
        .parse(i)
      const src = copyFrom === undefined ? null : repos.timetable.getTimetable(copyFrom)
      if (copyFrom !== undefined && !src) throw new NotFoundError('timetable')
      const now = d.now()
      const id = d.newId()
      transaction(d.db, () => {
        if (repos.timetable.countTimetables() >= TIMETABLE_MAX_COUNT)
          throw new ConflictError('timetable_limit')
        repos.timetable.insertTimetable({
          id,
          name,
          settings: src?.settings ?? DEFAULT_TIMETABLE,
          createdAt: now,
          updatedAt: now,
        })
        if (src)
          for (const e of repos.timetable.listOf(src.id))
            repos.timetable.insert({
              ...e,
              id: d.newId(),
              timetableId: id,
              createdAt: now,
              updatedAt: now,
            })
        repos.settings.saveTimetablePrefs({ activeId: id })
      })
      return timetableData()
    },
    'timetables.update': async (i) => {
      const { id, patch } = z
        .strictObject({
          id: Uuid,
          patch: z.strictObject({
            name: TimetableSchema.shape.name.optional(),
            settings: z
              .strictObject({
                mode: z.enum(['period', 'time']),
                showSat: z.boolean(),
                showSun: z.boolean(),
                periods: z.array(z.unknown()),
              })
              .partial()
              .optional(),
          }),
        })
        .parse(i)
      const cur = repos.timetable.getTimetable(id)
      if (!cur) throw new NotFoundError('timetable')
      const settings = TimetableSettingsSchema.parse({ ...cur.settings, ...patch.settings })
      transaction(d.db, () => {
        repos.timetable.deletePeriodsAfter(id, settings.periods.length)
        repos.timetable.updateTimetable({
          ...cur,
          name: patch.name ?? cur.name,
          settings,
          updatedAt: d.now(),
        })
      })
      return timetableData()
    },
    'timetables.delete': async (i) => {
      repos.timetable.deleteTimetable(IdIn.parse(i).id)
      return timetableData()
    },
    'timetables.select': async (i) => {
      const { id } = IdIn.parse(i)
      if (!repos.timetable.getTimetable(id)) throw new NotFoundError('timetable')
      repos.settings.saveTimetablePrefs({ activeId: id })
      return null
    },
    'timetable.entries.create': async (i) => {
      const { timetableId, slot, content } = z
        .strictObject({
          timetableId: Uuid,
          slot: TimetableSlotSchema,
          content: TimetableContentSchema,
        })
        .parse(i)
      assertSlot(timetableId, slot)
      const now = d.now()
      return repos.timetable.insert({
        id: d.newId(),
        timetableId,
        slot,
        ...content,
        createdAt: now,
        updatedAt: now,
      })
    },
    'timetable.entries.update': async (i) => {
      const { id, slot, content } = z
        .strictObject({
          id: Uuid,
          slot: TimetableSlotSchema.optional(),
          content: TimetableContentSchema.partial().optional(),
        })
        .parse(i)
      const cur = repos.timetable.get(id)
      if (!cur) throw new NotFoundError('timetable_entry')
      if (slot) assertSlot(cur.timetableId, slot)
      // 빠진 키는 zod가 결과에 넣지 않으므로 현재 값이 남는다
      return repos.timetable.update(
        TimetableEntrySchema.parse({
          ...cur,
          ...content,
          slot: slot ?? cur.slot,
          updatedAt: d.now(),
        }),
      )
    },
    'timetable.entries.delete': async (i) => {
      repos.timetable.delete(IdIn.parse(i).id)
      return null
    },

    /* ── 테마 자동 전환 규칙 ── */
    'themeRules.list': async (i) => {
      NoInput.parse(i)
      return repos.themeRules.list()
    },
    'themeRules.create': async (i) => {
      const { rule } = z
        .strictObject({
          rule: ThemeRuleSchema.omit({ id: true, createdAt: true, updatedAt: true }),
        })
        .parse(i)
      await assertTheme(rule.themeId)
      const now = d.now()
      return repos.themeRules.insert({ ...rule, id: d.newId(), createdAt: now, updatedAt: now })
    },
    'themeRules.update': async (i) => {
      const { rule } = z
        .strictObject({ rule: ThemeRuleSchema.omit({ createdAt: true, updatedAt: true }) })
        .parse(i)
      await assertTheme(rule.themeId)
      const cur = repos.themeRules.list().find((r) => r.id === rule.id)
      if (!cur) throw new NotFoundError('theme_rule')
      return repos.themeRules.update({ ...rule, createdAt: cur.createdAt, updatedAt: d.now() })
    },
    'themeRules.delete': async (i) => {
      repos.themeRules.delete(IdIn.parse(i).id)
      return null
    },
  }
}
