import type { Sprint } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import {
  autoSprint,
  sortSprints,
  sprintBadge,
  sprintItems,
  sprintProgress,
  sprintStatus,
  sprintsOn,
} from '../sprint'

const T = '2026-10-21'
const sp = (id: string, startDate: string, endDate: string): Sprint => ({
  id,
  name: id,
  goal: '',
  startDate,
  endDate,
  color: '#d9a86c',
  createdAt: 0,
  updatedAt: 0,
})

describe('스프린트', () => {
  it('상태와 짧은 표시(끝 날 포함)', () => {
    expect(sprintStatus(sp('a', '2026-10-20', '2026-11-02'), T)).toBe('active')
    expect(sprintBadge(sp('a', '2026-10-20', '2026-11-02'), T)).toBe('D-12')
    expect(sprintBadge(sp('a', '2026-10-01', T), T)).toBe('오늘 마감')
    expect(sprintBadge(sp('a', '2026-10-24', '2026-10-30'), T)).toBe('시작 전 · D-3')
    expect(sprintBadge(sp('a', '2026-10-01', '2026-10-20'), T)).toBe('끝남')
  })
  it('안의 할 일과 진행률(모든 카테고리)', () => {
    const items = {
      a: [
        { id: '1', done: true, sprintId: 's' },
        { id: '2', done: false, sprintId: null },
      ],
      b: [{ id: '3', done: false, sprintId: 's' }],
    }
    const mine = sprintItems(items, 's')
    expect(mine.map((i) => i.id)).toEqual(['1', '3'])
    expect(sprintProgress(mine)).toEqual({ done: 1, total: 2, ratio: 0.5 })
    expect(sprintProgress([])).toEqual({ done: 0, total: 0, ratio: 0 })
  })
  it('그날 걸친 스프린트, 정렬, 위젯 자동 선택', () => {
    const list = [
      sp('끝남', '2026-09-01', '2026-10-10'),
      sp('예정', '2026-11-01', '2026-11-10'),
      sp('길게', '2026-10-01', '2026-12-31'),
      sp('짧게', '2026-10-20', '2026-10-25'),
    ]
    expect(sprintsOn(list, T).map((s) => s.id)).toEqual(['길게', '짧게'])
    expect(sortSprints(list, T).map((s) => s.id)).toEqual(['짧게', '길게', '예정', '끝남'])
    expect(autoSprint(list, T)?.id).toBe('짧게')
    expect(autoSprint([sp('예정', '2026-11-01', '2026-11-10')], T)?.id).toBe('예정')
    expect(autoSprint([sp('끝남', '2026-09-01', '2026-10-10')], T)).toBeNull()
  })
})
