import { DateStr, HabitSchema, MAX_HABITS, Uuid } from '@kkumikkumi/schema'
import { z } from 'zod'
import { ConflictError, NotFoundError } from '../../db/repos'
import { IdIn, NoInput } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

const H = HabitSchema.shape
const Fields = z.strictObject({ name: H.name, color: H.color.optional(), days: H.days.optional() })
const DEFAULT_COLOR = '#93c9a1'
const MAX_RANGE_DAYS = 400

/** 습관(매일 체크). 체크는 (습관, 날짜) 하나씩 켜고 끈다. */
export function habitHandlers(d: HandlerDeps): HandlersOf<'habits'> {
  const { repos } = d
  return {
    'habits.list': async (i) => {
      NoInput.parse(i)
      return repos.habits.list()
    },
    'habits.create': async (i) => {
      const f = Fields.parse(i)
      if (repos.habits.count() >= MAX_HABITS) throw new ConflictError('habit_limit')
      const now = d.now()
      return repos.habits.insert({
        id: d.newId(),
        name: f.name,
        color: f.color ?? DEFAULT_COLOR,
        days: f.days ?? 127,
        order: repos.habits.nextOrder(),
        createdAt: now,
        updatedAt: now,
      })
    },
    'habits.update': async (i) => {
      const { id, patch } = z.strictObject({ id: Uuid, patch: Fields.partial() }).parse(i)
      const cur = repos.habits.get(id)
      if (!cur) throw new NotFoundError('habit')
      return repos.habits.update({
        ...cur,
        name: patch.name ?? cur.name,
        color: patch.color ?? cur.color,
        days: patch.days ?? cur.days,
        updatedAt: d.now(),
      })
    },
    'habits.delete': async (i) => {
      repos.habits.delete(IdIn.parse(i).id)
      return null
    },
    'habits.reorder': async (i) => {
      const { ids } = z
        .strictObject({
          ids: z
            .array(Uuid)
            .max(MAX_HABITS)
            .refine((a) => new Set(a).size === a.length),
        })
        .parse(i)
      repos.habits.reorder(ids, d.now())
      return null
    },
    'habits.checks': async (i) => {
      const { fromDate, toDate } = z
        .strictObject({ fromDate: DateStr, toDate: DateStr })
        .refine((r) => r.fromDate <= r.toDate)
        .refine(
          (r) => (Date.parse(r.toDate) - Date.parse(r.fromDate)) / 86_400_000 <= MAX_RANGE_DAYS,
          'range_too_long',
        )
        .parse(i)
      return repos.habits.checks(fromDate, toDate)
    },
    'habits.check': async (i) => {
      const { habitId, date, done } = z
        .strictObject({ habitId: Uuid, date: DateStr, done: z.boolean() })
        .parse(i)
      if (!repos.habits.get(habitId)) throw new NotFoundError('habit')
      repos.habits.setCheck(habitId, date, done, d.now())
      return null
    },
  }
}
