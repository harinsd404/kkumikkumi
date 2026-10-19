import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosaver, type SaveStatus } from '../autosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(
  opts: { validate?: (v: number) => string | null; saveDelay?: number; fail?: boolean } = {},
) {
  const saved: number[] = []
  const statuses: SaveStatus['state'][] = []
  const a = createAutosaver<number>({
    delayMs: 800,
    validate: opts.validate ?? (() => null),
    save: (v) =>
      new Promise((res) =>
        setTimeout(() => {
          saved.push(v)
          res(opts.fail ? { ok: false, code: 'boom' } : { ok: true })
        }, opts.saveDelay ?? 10),
      ),
    onStatus: (s) => statuses.push(s.state),
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  })
  return { a, saved, statuses }
}

describe('autosave', () => {
  it('디바운스: 연속 변경은 마지막 값 한 번만 저장', async () => {
    const { a, saved, statuses } = setup()
    a.schedule(1)
    await vi.advanceTimersByTimeAsync(500)
    a.schedule(2)
    await vi.advanceTimersByTimeAsync(500)
    a.schedule(3)
    await vi.advanceTimersByTimeAsync(900)
    expect(saved).toEqual([3])
    expect(statuses.at(-1)).toBe('saved')
  })

  it('저장 중 들어온 변경은 끝난 뒤 최신 값만 저장(동시 저장 없음)', async () => {
    const { a, saved } = setup({ saveDelay: 1000 })
    a.schedule(1)
    await vi.advanceTimersByTimeAsync(850) // 저장 시작
    a.schedule(2)
    a.schedule(3)
    await vi.advanceTimersByTimeAsync(5000)
    expect(saved).toEqual([1, 3])
  })

  it('flush는 대기 없이 즉시 저장하고 완료를 기다린다', async () => {
    const { a, saved } = setup()
    a.schedule(7)
    const p = a.flush()
    await vi.advanceTimersByTimeAsync(20)
    expect(await p).toBe(true)
    expect(saved).toEqual([7])
  })

  it('dispose는 대기 중인 변경을 버리지 않고 바로 저장한다', async () => {
    const { a, saved } = setup()
    a.schedule(4)
    await vi.advanceTimersByTimeAsync(100)
    a.dispose()
    await vi.advanceTimersByTimeAsync(20) // 디바운스(800)를 기다리지 않는다
    expect(saved).toEqual([4])
    a.dispose()
    await vi.advanceTimersByTimeAsync(2000)
    expect(saved).toEqual([4])
  })

  it('검증 실패면 저장하지 않고 invalid', async () => {
    const { a, saved, statuses } = setup({ validate: (v) => (v < 0 ? '음수' : null) })
    a.schedule(-1)
    await vi.advanceTimersByTimeAsync(900)
    expect(saved).toEqual([])
    expect(statuses.at(-1)).toBe('invalid')
    expect(await a.flush()).toBe(false)
  })

  it('저장 실패는 error 상태', async () => {
    const { a, statuses } = setup({ fail: true })
    a.schedule(1)
    await vi.advanceTimersByTimeAsync(900)
    expect(statuses.at(-1)).toBe('error')
  })

  it('실패한 변경은 자동 재시도하지 않고 다음 flush에서 같은 값으로 재시도한다', async () => {
    const opts = { fail: true }
    const { a, saved, statuses } = setup(opts)
    a.schedule(7)
    const first = a.flush()
    await vi.advanceTimersByTimeAsync(20)
    expect(await first).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(saved).toEqual([7])

    opts.fail = false
    const retry = a.flush()
    await vi.advanceTimersByTimeAsync(20)
    expect(await retry).toBe(true)
    expect(saved).toEqual([7, 7])
    expect(statuses.at(-1)).toBe('saved')
    expect(await a.flush()).toBe(true)
    expect(saved).toEqual([7, 7])
  })

  it('실패 뒤 새 변경이 들어오면 오래된 실패 값을 다시 저장하지 않는다', async () => {
    const opts = { fail: true }
    const { a, saved } = setup(opts)
    a.schedule(1)
    await vi.advanceTimersByTimeAsync(900)
    opts.fail = false
    a.schedule(2)
    const p = a.flush()
    await vi.advanceTimersByTimeAsync(20)
    expect(await p).toBe(true)
    expect(saved).toEqual([1, 2])
  })

  it('저장 중 새 변경이 들어오면 flush는 새 변경의 성공까지 기다린다', async () => {
    const opts = { fail: true, saveDelay: 1000 }
    const { a, saved } = setup(opts)
    a.schedule(1)
    const p = a.flush()
    a.schedule(2)
    await vi.advanceTimersByTimeAsync(1000)
    opts.fail = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(await p).toBe(true)
    expect(saved).toEqual([1, 2])
  })

  it('저장 함수가 예외를 던져도 변경을 보존해 재시도한다', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue({ ok: true })
    const a = createAutosaver<number>({
      delayMs: 800,
      validate: () => null,
      save,
      onStatus: () => {},
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    })
    a.schedule(3)
    expect(await a.flush()).toBe(false)
    expect(await a.flush()).toBe(true)
    expect(save.mock.calls).toEqual([[3], [3]])
  })
})
