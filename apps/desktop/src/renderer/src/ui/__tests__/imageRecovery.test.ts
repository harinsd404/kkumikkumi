import { afterEach, expect, it, vi } from 'vitest'
import { recoverImage } from '../imageRecovery'

function fixture(complete = true, naturalWidth = 0) {
  vi.useFakeTimers()
  const win = new EventTarget()
  const doc = Object.assign(new EventTarget(), { defaultView: win, visibilityState: 'visible' })
  let requests = 0
  const img = Object.assign(new EventTarget(), {
    complete,
    naturalWidth,
    alt: '',
    title: '',
    ownerDocument: doc,
  }) as unknown as HTMLImageElement
  Object.defineProperty(img, 'src', { set: () => requests++ })
  const dispose = recoverImage(img, 'kkumi-asset://diary/test.png')
  return { img, win, doc, dispose, requests: () => requests }
}
afterEach(() => vi.useRealTimers())

it('recovers failures that happened before mounting and stops after a successful load', () => {
  const f = fixture()
  vi.advanceTimersByTime(500)
  expect(f.requests()).toBe(1)
  f.img.dispatchEvent(new Event('load'))
  vi.advanceTimersByTime(60000)
  expect(f.requests()).toBe(1)
  expect(f.img.alt).toBe('')
  f.dispose()
})

it('bounds retries, reports failure and tries again when the user returns', () => {
  const f = fixture()
  for (const delay of [500, 1500, 4000]) {
    vi.advanceTimersByTime(delay)
    f.img.dispatchEvent(new Event('error'))
  }
  vi.advanceTimersByTime(60000)
  expect(f.requests()).toBe(3)
  expect(f.img.alt).toContain('불러오지 못했어요')
  f.doc.visibilityState = 'hidden'
  f.win.dispatchEvent(new Event('focus'))
  vi.advanceTimersByTime(1000)
  expect(f.requests()).toBe(3)
  f.doc.visibilityState = 'visible'
  f.doc.dispatchEvent(new Event('visibilitychange'))
  f.win.dispatchEvent(new Event('focus'))
  vi.advanceTimersByTime(500)
  expect(f.requests()).toBe(4)
  f.img.dispatchEvent(new Event('load'))
  expect(f.img.alt).toBe('')
  expect(f.img.title).toBe('')
  f.dispose()
})

it('recovers a stalled load without endlessly retrying', () => {
  const f = fixture(false)
  vi.advanceTimersByTime(60000)
  expect(f.requests()).toBe(3)
  expect(f.img.alt).toContain('불러오지 못했어요')
  f.dispose()
})

it('cancels all work on unmount or asset replacement', () => {
  const f = fixture()
  f.dispose()
  f.img.dispatchEvent(new Event('error'))
  f.win.dispatchEvent(new Event('focus'))
  vi.advanceTimersByTime(60000)
  expect(f.requests()).toBe(0)
})

it('does not reload successfully decoded images on focus', () => {
  const f = fixture(true, 736)
  f.win.dispatchEvent(new Event('focus'))
  vi.advanceTimersByTime(60000)
  expect(f.requests()).toBe(0)
  f.dispose()
})
