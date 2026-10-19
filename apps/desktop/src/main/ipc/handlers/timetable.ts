import {
  DEFAULT_TIMETABLE,
  TIMETABLE_MAX_COUNT,
  TimetableContentSchema,
  TimetableEntrySchema,
  TimetableSchema,
  TimetableSettingsSchema,
  TimetableSlotSchema,
  Uuid,
} from '@kkumikkumi/schema'
import { z } from 'zod'
import { transaction } from '../../db/connection'
import { ConflictError, NotFoundError } from '../../db/repos'
import { IdIn, mergePatch, NoInput } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

/** MCP와 IPC가 같은 입력 모양을 사용한다. 전체 설정의 교차 검증은 병합 후 수행한다. */
export const SetTimetableInput = z.strictObject({
  timetableId: Uuid.optional(),
  name: TimetableSchema.shape.name.optional(),
  settings: z.strictObject(TimetableSettingsSchema.shape).partial().optional(),
  entries: z
    .array(
      z.strictObject({
        slot: TimetableSlotSchema,
        subject: TimetableContentSchema.shape.subject,
        room: TimetableContentSchema.shape.room.default(''),
        tone: TimetableContentSchema.shape.tone.default(null),
      }),
    )
    .max(500),
})

/** 시간표 목록(timetables.*) + 칸/항목(timetable.*) */
export function timetableHandlers(d: HandlerDeps): HandlersOf<'timetable' | 'timetables'> {
  const { repos } = d

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

  return {
    'timetable.get': async (i) => {
      NoInput.parse(i)
      return timetableData()
    },
    'timetable.set': async (i) => {
      const input = SetTimetableInput.parse(i)
      const cur = input.timetableId ? repos.timetable.getTimetable(input.timetableId) : null
      if (input.timetableId && !cur) throw new NotFoundError('timetable')
      const name = TimetableSchema.shape.name.parse(input.name ?? cur?.name)
      const settings = mergePatch(
        TimetableSettingsSchema,
        cur?.settings ?? DEFAULT_TIMETABLE,
        input.settings,
      )
      const entries = z
        .array(SetTimetableInput.shape.entries.element)
        .refine(
          (items) =>
            items.every(
              (e) =>
                e.slot.kind === settings.mode &&
                (e.slot.kind !== 'period' || e.slot.period <= settings.periods.length),
            ),
          '항목의 방식과 교시 번호를 시간표 설정에 맞춰 주세요',
        )
        .parse(input.entries)
      const cells = new Set<string>()
      for (const e of entries) {
        if (e.slot.kind !== 'period') continue
        const key = `${e.slot.day}:${e.slot.period}`
        if (cells.has(key)) throw new ConflictError('timetable_cell')
        cells.add(key)
      }
      const now = d.now()
      const id = cur?.id ?? d.newId()
      transaction(d.db, () => {
        if (!cur && repos.timetable.countTimetables() >= TIMETABLE_MAX_COUNT)
          throw new ConflictError('timetable_limit')
        const t = { id, name, settings, createdAt: cur?.createdAt ?? now, updatedAt: now }
        if (cur) repos.timetable.updateTimetable(t)
        else repos.timetable.insertTimetable(t)
        repos.timetable.deleteAllOf(id)
        for (const e of entries)
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
      const settings = mergePatch(TimetableSettingsSchema, cur.settings, patch.settings)
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
  }
}
