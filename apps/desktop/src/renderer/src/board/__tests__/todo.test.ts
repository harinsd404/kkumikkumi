import { describe, expect, it } from 'vitest'
import { blockCategories, dueText, isOverdue, reorderIds } from '../todo'

const T = '2026-10-12'
const item = (id: string, dueDate: string | null, order: number, done = false) => ({
  id,
  dueDate,
  order,
  done,
})

describe('카테고리별 오늘의 할 일(보드 블록)', () => {
  const lists = [
    { id: 'b', name: '학교', order: 1 },
    { id: 'a', name: '개인', order: 0 },
    { id: 'c', name: '빈 카테고리', order: 2 },
  ]
  const items = {
    a: [
      item('a2', T, 2),
      item('a1', T, 1),
      item('aDone', T, 3, true),
      item('noDue', null, 0),
      item('tmr', '2026-10-13', 4),
    ],
    b: [item('late', '2026-10-01', 0), item('oldDone', '2026-10-01', 1, true)],
  }
  it('카테고리 순서대로 오늘 마감과 지난 못 한 일만, 안은 order 순, 빈 카테고리도', () => {
    const s = blockCategories(lists, items, null, T, true)
    expect(s.map((x) => x.name)).toEqual(['개인', '학교', '빈 카테고리'])
    expect(s[0]!.items.map((i) => i.id)).toEqual(['a1', 'a2', 'aDone'])
    expect(s[1]!.items.map((i) => i.id)).toEqual(['late'])
    expect(s[2]!.items).toEqual([])
  })
  it('완료 숨기기', () => {
    expect(blockCategories(lists, items, null, T, false)[0]!.items.map((i) => i.id)).toEqual([
      'a1',
      'a2',
    ])
  })
  it('고정한 카테고리만, 없는 카테고리면 전부', () => {
    expect(blockCategories(lists, items, 'b', T, true).map((x) => x.listId)).toEqual(['b'])
    expect(blockCategories(lists, items, 'zzz', T, true)).toHaveLength(3)
  })
  it('마감 표시와 지난 마감', () => {
    expect(dueText(T, T)).toBe('오늘')
    expect(dueText('2026-10-13', T)).toBe('내일')
    expect(dueText('2026-11-02', T)).toBe('11/2')
    expect(dueText('2026-11-01', '2026-10-31')).toBe('내일')
    expect(isOverdue(item('x', '2026-10-01', 0), T)).toBe(true)
    expect(isOverdue(item('x', '2026-10-01', 0, true), T)).toBe(false)
  })
})

describe('reorderIds', () => {
  const ids = ['a', 'b', 'c', 'd']
  it('앞/뒤로 옮기기', () => {
    expect(reorderIds(ids, 'd', { beforeId: 'b' })).toEqual(['a', 'd', 'b', 'c'])
    expect(reorderIds(ids, 'a', { afterId: 'c' })).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderIds(ids, 'a', { afterId: 'd' })).toEqual(['b', 'c', 'd', 'a'])
  })
  it('자기 자신/없는 id는 그대로', () => {
    expect(reorderIds(ids, 'a', { beforeId: 'a' })).toEqual(ids)
    expect(reorderIds(ids, 'x', { beforeId: 'a' })).toEqual(ids)
    expect(reorderIds(ids, 'a', { beforeId: 'x' })).toEqual(ids)
  })
})
