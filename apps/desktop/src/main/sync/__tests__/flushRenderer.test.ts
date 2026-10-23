import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const contents = { send: vi.fn() },
    frame = {}
  return {
    listeners,
    contents,
    frame,
    window: { isDestroyed: () => false, webContents: contents },
    ipcMain: {
      on: (name: string, fn: (...args: unknown[]) => void) => listeners.set(name, fn),
      removeListener: (name: string) => listeners.delete(name),
    },
  }
})
vi.mock('electron', () => ({ ipcMain: h.ipcMain }))
vi.mock('../../window/boardWindow', () => ({ boardWindow: () => h.window }))
vi.mock('../../security', () => ({ isTrustedFrame: (frame: unknown) => frame === h.frame }))
import { flushSyncRenderer } from '../flushRenderer'

beforeEach(() => {
  vi.useFakeTimers()
  h.contents.send.mockClear()
  h.listeners.clear()
})
afterEach(() => {
  vi.useRealTimers()
})
const reply = (readiness: string, id = h.contents.send.mock.calls[0]![1], frame = h.frame) =>
  h.listeners.get('app:sync-ready')?.({ sender: h.contents, senderFrame: frame }, id, readiness)

describe('sync save handshake', () => {
  it.each([
    ['editing', 'sync_editing'],
    ['save_failed', 'sync_unsaved'],
    ['unknown', 'sync_protocol'],
  ])('classifies %s separately as %s', async (reason, code) => {
    const result = flushSyncRenderer()
    const assertion = expect(result).rejects.toMatchObject({ code })
    reply(reason!)
    await assertion
    expect(h.listeners.size).toBe(0)
  })
  it('allows a slow response and reports timeout as a waiting screen, not unsaved data', async () => {
    const result = flushSyncRenderer(),
      assertion = expect(result).rejects.toMatchObject({ code: 'sync_renderer_wait' })
    await vi.advanceTimersByTimeAsync(3000)
    expect(h.listeners.size).toBe(1)
    await vi.advanceTimersByTimeAsync(7000)
    await assertion
    expect(h.listeners.size).toBe(0)
  })
  it('accepts a successful response after the old timeout and ignores stale/untrusted acknowledgements', async () => {
    const result = flushSyncRenderer(true)
    expect(h.contents.send.mock.calls[0]![2]).toBe(true)
    reply('ready', 'older-request')
    reply('ready', undefined, {})
    expect(h.listeners.size).toBe(1)
    await vi.advanceTimersByTimeAsync(4000)
    reply('ready')
    await expect(result).resolves.toBeUndefined()
    expect(h.listeners.size).toBe(0)
  })
})
