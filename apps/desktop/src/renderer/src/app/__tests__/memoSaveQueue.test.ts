import { describe, expect, it } from 'vitest'
import { flushMemoChanges } from '../memoSaveQueue'

describe('memo save barrier', () => {
  it('retains failed saves and retries after IPC failure', async () => {
    const pending = new Map([['memo', 'unsaved']])
    const saved: string[] = []
    const record = (_id: string, body: string) => saved.push(body)
    expect(await flushMemoChanges(pending, async () => ({ ok: false }), record)).toBe(false)
    expect(
      await flushMemoChanges(
        pending,
        async () => {
          throw new Error('offline')
        },
        record,
      ),
    ).toBe(false)
    expect(pending.get('memo')).toBe('unsaved')
    expect(
      await flushMemoChanges(pending, async (_id, body) => ({ ok: true, value: body }), record),
    ).toBe(true)
    expect(saved).toEqual(['unsaved'])
  })

  it('preserves newer input while an earlier save is in flight', async () => {
    const pending = new Map([['memo', 'first']])
    expect(
      await flushMemoChanges(
        pending,
        async () => {
          pending.set('memo', 'newer')
          return { ok: true, value: 'first' }
        },
        () => {},
      ),
    ).toBe(false)
    expect(pending.get('memo')).toBe('newer')
  })
})
