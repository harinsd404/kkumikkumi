import { describe, expect, it } from 'vitest'
import {
  applySyncChanges,
  emptySyncDocument,
  mergeSyncDocuments,
  syncDiff,
  SyncDocumentSchema,
} from '../sync'

const id = '00000000-0000-4000-8000-000000000001'
const memo = (body: string) => ({ id, body, pinned: false, createdAt: 1, updatedAt: 1 })
const doc = (body: string) => ({ ...emptySyncDocument(), memos: [memo(body)] })
describe('sync protocol', () => {
  it('treats delete/edit as a conflict and preserves both choices', () => {
    const base = doc('old'),
      local = emptySyncDocument(),
      remote = doc('new')
    expect(mergeSyncDocuments(base, local, remote).conflicts).toEqual([`memos/${id}`])
    expect(mergeSyncDocuments(base, local, remote, 'remote').document).toEqual(remote)
    expect(mergeSyncDocuments(base, local, remote, 'local').document).toEqual(local)
  })
  it('merges disjoint edits and transmits deletes without using device clocks', () => {
    const base = doc('old')
    const local = doc('changed')
    const remote = {
      ...base,
      memos: [...base.memos, { ...memo('other'), id: id.replace(/1$/, '2') }],
    }
    const merged = mergeSyncDocuments(base, local, remote)
    expect(merged.conflicts).toEqual([])
    expect(merged.document.memos.map((m) => m.body)).toEqual(['changed', 'other'])
    expect(applySyncChanges(remote, syncDiff(remote, emptySyncDocument()))).toEqual(
      emptySyncDocument(),
    )
  })
  it('rejects duplicate IDs and dangling relationships', () => {
    expect(
      SyncDocumentSchema.safeParse({ ...doc('a'), memos: [memo('a'), memo('b')] }).success,
    ).toBe(false)
    expect(() =>
      applySyncChanges(emptySyncDocument(), [
        {
          collection: 'todos',
          id,
          value: {
            id,
            title: 'x',
            listId: id,
            sprintId: null,
            note: '',
            dueDate: null,
            done: false,
            completedAt: null,
            order: 0,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]),
    ).toThrow()
  })
})
