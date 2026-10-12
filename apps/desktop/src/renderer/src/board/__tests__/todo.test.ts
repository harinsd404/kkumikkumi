import { describe, expect, it } from 'vitest'
import { dueForSection, groupTodos, isOverdue, reorderIds, sectionsForSize } from '../todo'

const T = '2026-10-12'
const item = (id: string, dueDate: string | null, order: number, done = false) => ({
  id,
  dueDate,
  order,
  done,
})

describe('투두 섹션', () => {
  const items = [
    item('late', '2026-10-01', 5),
    item('today', T, 1),
    item('tmr', '2026-10-13', 2),
    item('later', '2026-10-20', 3),
    item('none', null, 0),
    item('doneToday', T, 4, true),
  ]
  it('오늘(지난 것 포함) / 내일 / 보관함(마감 없음, 모레 이후)', () => {
    const g = groupTodos(items, T, true)
    expect(g.today.map((i) => i.id)).toEqual(['today', 'doneToday', 'late']) // order 순
    expect(g.tomorrow.map((i) => i.id)).toEqual(['tmr'])
    expect(g.inbox.map((i) => i.id)).toEqual(['none', 'later'])
  })
  it('완료 숨기기', () => {
    expect(groupTodos(items, T, false).today.map((i) => i.id)).toEqual(['today', 'late'])
  })
  it('월말 내일 계산', () => {
    expect(groupTodos([item('a', '2026-11-01', 0)], '2026-10-31', true).tomorrow).toHaveLength(1)
    expect(dueForSection('tomorrow', '2026-12-31')).toBe('2027-01-01')
    expect(dueForSection('today', T)).toBe(T)
    expect(dueForSection('inbox', T)).toBeNull()
  })
  it('지난 마감 표시는 미완료만', () => {
    expect(isOverdue(item('a', '2026-10-01', 0), T)).toBe(true)
    expect(isOverdue(item('a', '2026-10-01', 0, true), T)).toBe(false)
    expect(isOverdue(item('a', T, 0), T)).toBe(false)
  })
  it('크기별 섹션', () => {
    expect(sectionsForSize('S')).toEqual(['today'])
    expect(sectionsForSize('L')).toEqual(['today', 'tomorrow', 'inbox'])
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
