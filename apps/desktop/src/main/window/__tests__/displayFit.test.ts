import { EventEmitter } from 'node:events'
import type { BrowserWindow, Screen } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adaptBoardToDisplays } from '../displayFit'

const hd = { x: 0, y: 24, width: 1920, height: 1056 }
const normal = { x: 100, y: 100, width: 1000, height: 700 }
function fixture() {
  vi.useFakeTimers()
  let areas = [hd]
  let bounds = { ...normal }
  let maximized = false
  let full = false
  let minimized = false
  const win = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isFullScreen: () => full,
    isMinimized: () => minimized,
    isMaximized: () => maximized,
    getBounds: () => bounds,
    getContentBounds: () => bounds,
    getNormalBounds: () => normal,
    setMinimumSize: vi.fn(),
    setBounds: vi.fn((b) => {
      bounds = b
    }),
    unmaximize: vi.fn(() => {
      maximized = false
      win.emit('unmaximize')
    }),
    maximize: vi.fn(() => {
      maximized = true
      bounds = areas[0]!
      win.emit('maximize')
    }),
  })
  const screen = Object.assign(new EventEmitter(), {
    getAllDisplays: () => areas.map((workArea) => ({ workArea })),
    getPrimaryDisplay: () => ({ workArea: areas[0]! }),
  })
  adaptBoardToDisplays(win as unknown as BrowserWindow, screen as unknown as Screen)
  return {
    win,
    screen,
    setAreas: (a: typeof areas) => {
      areas = a
    },
    setFull: (v: boolean) => {
      full = v
    },
    setMinimized: (v: boolean) => {
      minimized = v
    },
  }
}
afterEach(() => vi.useRealTimers())

describe('display changes', () => {
  it('모니터 제거 후 일반 창을 남은 화면 안으로 옮긴다', () => {
    const f = fixture()
    const remaining = { x: -1440, y: 0, width: 1440, height: 900 }
    f.setAreas([remaining])
    f.screen.emit('display-removed')
    vi.advanceTimersByTime(200)
    expect(f.win.getBounds()).toEqual({ x: -1220, y: 100, width: 1000, height: 700 })
  })
  it.each([640, 2560])('최대화된 창을 새 화면 폭 %i에 맞추고 일반 크기를 보존한다', (width) => {
    const f = fixture()
    f.win.maximize()
    const area = { x: 0, y: 0, width, height: 900 }
    f.setAreas([area])
    f.screen.emit('display-metrics-changed')
    vi.advanceTimersByTime(400)
    expect(f.win.isMaximized()).toBe(true)
    expect(f.win.getBounds()).toEqual(area)
    expect(f.win.setBounds).toHaveBeenCalledWith({
      ...normal,
      x: Math.min(100, width - Math.min(1000, width)),
      width: Math.min(1000, width),
    })
    expect(f.win.unmaximize).toHaveBeenCalledTimes(1)
  })
  it('이미 꽉 찬 최대화 창은 다시 최대화하지 않는다', () => {
    const f = fixture()
    f.win.maximize()
    f.screen.emit('display-added')
    vi.advanceTimersByTime(200)
    expect(f.win.unmaximize).not.toHaveBeenCalled()
  })
  it('전체 화면/최소화 중에는 건드리지 않고 복원할 때 보정한다', () => {
    const f = fixture()
    f.setFull(true)
    f.setAreas([{ x: 0, y: 0, width: 800, height: 600 }])
    f.screen.emit('display-metrics-changed')
    vi.advanceTimersByTime(200)
    expect(f.win.setBounds).not.toHaveBeenCalled()
    f.setFull(false)
    f.setMinimized(true)
    f.win.emit('leave-full-screen')
    vi.advanceTimersByTime(200)
    expect(f.win.setBounds).not.toHaveBeenCalled()
    f.setMinimized(false)
    f.win.emit('restore')
    vi.advanceTimersByTime(200)
    expect(f.win.getBounds()).toEqual({ x: 0, y: 0, width: 800, height: 600 })
  })
  it('창이 닫히면 전역 화면 이벤트와 보정 타이머를 해제한다', () => {
    const f = fixture()
    f.screen.emit('display-removed')
    f.win.emit('closed')
    expect(f.screen.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
