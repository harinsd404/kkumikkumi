import { MemoSchema, Uuid } from '@kkumikkumi/schema'
import { z } from 'zod'
import { NotFoundError } from '../../db/repos'
import { IdIn, NoInput } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

export function memoHandlers(d: HandlerDeps): HandlersOf<'memos'> {
  const { repos } = d
  return {
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
  }
}
