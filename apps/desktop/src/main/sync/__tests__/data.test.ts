import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnv, type TestEnv } from '../../__tests__/helpers'
import { SyncData } from '../data'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('sync data barrier', () => {
  let env: TestEnv
  let data: SyncData
  beforeEach(async () => {
    env = await makeEnv()
    data = new SyncData(env.core, env.dir)
  })
  afterEach(async () => {
    vi.useRealTimers()
    await env.cleanup()
  })
  it('drains existing requests and reserves the snapshot before later IPC/MCP requests', async () => {
    const first = deferred(),
      snapshot = deferred(),
      entered = deferred()
    const order: string[] = []
    const oldRequest = data.guard(async () => {
      await first.promise
      order.push('old request')
    })
    const sync = data.withIdle(async () => {
      order.push('snapshot')
      data.read()
      entered.resolve()
      await snapshot.promise
      order.push('commit')
    })
    const newRequest = data.guard(async () => {
      order.push('new request')
    })
    await Promise.resolve()
    expect(order).toEqual([])
    first.resolve()
    await entered.promise
    expect(order).toEqual(['old request', 'snapshot'])
    snapshot.resolve()
    await Promise.all([oldRequest, sync, newRequest])
    expect(order).toEqual(['old request', 'snapshot', 'commit', 'new request'])
  })
  it('releases queued work even if snapshot/apply fails', async () => {
    const snapshot = deferred()
    const sync = data.withIdle(async () => {
      await snapshot.promise
      throw new Error('disk failure')
    })
    const rejected = expect(sync).rejects.toThrow('disk failure')
    const queued = data.guard(async () => 'saved')
    snapshot.resolve()
    await rejected
    expect(await queued).toBe('saved')
    expect(await data.withIdle(() => data.read())).toBeTruthy()
  })
  it('bounds stuck-operation waits without applying over a write or leaving IPC paused', async () => {
    vi.useFakeTimers()
    const stuck = deferred(),
      apply = vi.fn()
    const saving = data.guard(() => stuck.promise)
    const sync = data.withIdle(apply)
    const rejected = expect(sync).rejects.toThrow('sync_saving')
    const queued = data.guard(async () => 'available')
    await vi.advanceTimersByTimeAsync(10000)
    await rejected
    expect(apply).not.toHaveBeenCalled()
    expect(await queued).toBe('available')
    expect(() => data.read()).toThrow('sync_saving')
    stuck.resolve()
    await saving
    expect(await data.withIdle(() => data.read())).toBeTruthy()
  })
  it('a failed save releases the barrier but still reports the save failure to its caller', async () => {
    const saving = data.guard(async () => {
      throw new Error('save failed')
    })
    const rejected = expect(saving).rejects.toThrow('save failed')
    const sync = data.withIdle(() => data.read())
    await rejected
    expect(await sync).toBeTruthy()
  })
})
