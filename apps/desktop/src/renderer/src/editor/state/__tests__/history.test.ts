import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  HISTORY_LIMIT,
  MERGE_WINDOW_MS,
  redo,
  seal,
  undo,
} from '../history'

describe('history', () => {
  it('커밋 → 실행 취소 → 다시 실행', () => {
    let h = createHistory(0)
    h = commit(h, 1)
    h = commit(h, 2)
    expect(h.present).toBe(2)
    h = undo(h)
    expect(h.present).toBe(1)
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present).toBe(2)
    expect(canRedo(h)).toBe(false)
  })

  it('실행 취소 후 새 커밋이 오면 다시 실행 기록은 사라진다', () => {
    let h = commit(commit(createHistory(0), 1), 2)
    h = commit(undo(h), 9)
    expect(h.future).toEqual([])
    expect(undo(h).present).toBe(1)
  })

  it('드래그(continuous)는 시간이 지나도 한 기록, seal 후에는 새 기록', () => {
    let h = createHistory(0)
    h = commit(h, 1, { groupKey: 'drag:a', now: 0, continuous: true })
    h = commit(h, 2, { groupKey: 'drag:a', now: 5000, continuous: true })
    h = commit(h, 3, { groupKey: 'drag:a', now: 9000, continuous: true })
    h = seal(h)
    h = commit(h, 4, { groupKey: 'drag:a', now: 9001, continuous: true })
    expect(h.past).toEqual([0, 3])
    expect(undo(undo(h)).present).toBe(0)
  })

  it('같은 키는 병합 시간 안에서만 합친다(슬라이더)', () => {
    let h = createHistory(0)
    h = commit(h, 1, { groupKey: 'k', now: 0 })
    h = commit(h, 2, { groupKey: 'k', now: MERGE_WINDOW_MS })
    h = commit(h, 3, { groupKey: 'k', now: MERGE_WINDOW_MS * 3 })
    expect(h.past).toEqual([0, 2])
  })

  it('다른 키나 키 없음은 합치지 않는다', () => {
    let h = createHistory(0)
    h = commit(h, 1, { groupKey: 'a', now: 0 })
    h = commit(h, 2, { groupKey: 'b', now: 1 })
    h = commit(h, 3, { now: 2 })
    h = commit(h, 4, { now: 3 })
    expect(h.past).toEqual([0, 1, 2, 3])
  })

  it('같은 값 커밋은 무시', () => {
    const h = createHistory({ a: 1 })
    expect(commit(h, h.present)).toBe(h)
  })

  it(`기록은 최대 ${HISTORY_LIMIT}개`, () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = commit(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]).toBe(50)
    expect(canUndo(createHistory(0))).toBe(false)
  })
})
