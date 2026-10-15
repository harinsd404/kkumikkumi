import { CalendarEventSchema, DateStr, EpochMs, Uuid } from '@kkumikkumi/schema'
import { z } from 'zod'
import { NotFoundError } from '../../db/repos'
import { IdIn } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

export function calendarHandlers(d: HandlerDeps): HandlersOf<'calendar'> {
  const { repos } = d
  return {
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
    'calendar.get': async (i) => repos.calendar.get(IdIn.parse(i).id),
    'calendar.upcoming': async (i) =>
      repos.calendar.upcoming(
        z
          .strictObject({
            fromUtc: EpochMs,
            fromDate: DateStr,
            limit: z.number().int().min(1).max(50),
          })
          .parse(i),
      ),
    'calendar.delete': async (i) => {
      repos.calendar.delete(IdIn.parse(i).id)
      return null
    },
  }
}
