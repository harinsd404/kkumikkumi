import { MAX_SPRINTS, SprintSchema, Uuid } from '@kkumikkumi/schema'
import { z } from 'zod'
import { ConflictError, NotFoundError } from '../../db/repos'
import { IdIn, NoInput } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

const S = SprintSchema.shape
/** 이름·목표·기간·색. 시작~끝 순서는 저장할 때 SprintSchema가 다시 확인한다 */
const SprintFields = z.strictObject({
  name: S.name,
  goal: S.goal.optional(),
  startDate: S.startDate,
  endDate: S.endDate,
  color: S.color.optional(),
})

/** 새 스프린트 기본 색(테마와 무관하게 잘 보이는 차분한 색) */
const DEFAULT_COLOR = '#d9a86c'

/** 스프린트(기간 동안 끝낼 일 묶음). 지워도 안의 할 일은 남는다. */
export function sprintHandlers(d: HandlerDeps): HandlersOf<'sprints'> {
  const { repos } = d
  return {
    'sprints.list': async (i) => {
      NoInput.parse(i)
      return repos.sprints.list()
    },
    'sprints.create': async (i) => {
      const f = SprintFields.parse(i)
      if (repos.sprints.count() >= MAX_SPRINTS) throw new ConflictError('sprint_limit')
      const now = d.now()
      return repos.sprints.insert({
        id: d.newId(),
        name: f.name,
        goal: f.goal ?? '',
        startDate: f.startDate,
        endDate: f.endDate,
        color: f.color ?? DEFAULT_COLOR,
        createdAt: now,
        updatedAt: now,
      })
    },
    'sprints.update': async (i) => {
      const { id, patch } = z.strictObject({ id: Uuid, patch: SprintFields.partial() }).parse(i)
      const cur = repos.sprints.get(id)
      if (!cur) throw new NotFoundError('sprint')
      return repos.sprints.update({
        ...cur,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        updatedAt: d.now(),
      })
    },
    'sprints.delete': async (i) => {
      repos.sprints.delete(IdIn.parse(i).id)
      return null
    },
  }
}
