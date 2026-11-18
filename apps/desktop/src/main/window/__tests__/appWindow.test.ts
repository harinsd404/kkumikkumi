import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { persistBounds } from '../appWindow'

vi.mock('../../security', () => ({ devServerUrl: undefined, rendererIndexPath: '/fixture.html' }))
afterEach(() => vi.useRealTimers())

it('최대화 여부와 일반 창 경계를 저장하고, 복원 후 최대화 해제를 저장한다', () => {
  vi.useFakeTimers()
  let maximized = true
  const normal = { x: 100, y: 50, width: 1000, height: 700 }
  const win = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isMaximized: () => maximized,
    getNormalBounds: () => normal,
    getContentBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
  })
  const save = vi.fn()
  const flush = persistBounds(win as unknown as BrowserWindow, {
    resize: true,
    normalBounds: true,
    save,
  })
  win.emit('resize')
  vi.advanceTimersByTime(500)
  expect(save).toHaveBeenLastCalledWith({ ...normal, maximized: true })
  maximized = false
  win.emit('unmaximize')
  flush()
  expect(save).toHaveBeenLastCalledWith({ ...normal, maximized: false })
  win.emit('resize')
  win.emit('closed')
  expect(vi.getTimerCount()).toBe(0)
})
