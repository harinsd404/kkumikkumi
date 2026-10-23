import { describe, expect, it, vi } from 'vitest'
import { prepareRendererSync, type SyncFocus } from '../syncReadiness'

const prepare = (focus: SyncFocus, save = vi.fn(async () => true), draftOpen = false) => ({
  result: prepareRendererSync({ focus: () => focus, draftOpen: () => draftOpen, save }),
  save,
})

describe('sync readiness', () => {
  it.each(['password', 'url', 'text'])(
    'connects with the %s connection field still focused',
    async (type) => {
      const { result, save } = prepare({ kind: 'input', type, connectionControls: true })
      expect(await result).toBe('ready')
      expect(save).toHaveBeenCalledOnce()
    },
  )
  it.each(['checkbox', 'radio', 'range', 'color', 'submit'])(
    'does not mistake a %s for a draft',
    async (type) => {
      expect(await prepare({ kind: 'input', type }).result).toBe('ready')
    },
  )
  it.each<SyncFocus>([
    { kind: 'input', type: 'text' },
    { kind: 'input', type: 'time' },
    { kind: 'input', type: 'date' },
    { kind: 'textarea' },
    { kind: 'contenteditable' },
  ])('preserves the focused content editor: %j', async (focus) => {
    const { result, save } = prepare(focus)
    expect(await result).toBe('editing')
    expect(save).not.toHaveBeenCalled()
  })
  it('distinguishes an open editor from a failed save, and retries a failed save', async () => {
    expect(await prepare({ kind: 'other' }, undefined, true).result).toBe('editing')
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    expect(await prepare({ kind: 'other' }, save).result).toBe('save_failed')
    expect(await prepare({ kind: 'other' }, save).result).toBe('ready')
  })
  it('waits for pending saves and protects a draft opened while they finish', async () => {
    let focus: SyncFocus = { kind: 'other' },
      finish!: (ok: boolean) => void
    const result = prepareRendererSync({
      focus: () => focus,
      draftOpen: () => false,
      save: () =>
        new Promise<boolean>((r) => {
          finish = r
        }),
    })
    focus = { kind: 'textarea' }
    finish(true)
    expect(await result).toBe('editing')
  })
})
