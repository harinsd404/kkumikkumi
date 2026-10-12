import { describe, expect, it } from 'vitest'
import { dueForFilter, filterTodos, matchesQuery, remainingCount } from '../todoView'

const T = '2026-10-12'
const item = (
  id: string,
  o: Partial<{
    title: string
    note: string
    done: boolean
    completedAt: number | null
    dueDate: string | null
    order: number
  }> = {},
) => ({
  id,
  title: id,
  note: '',
  done: false,
  completedAt: null,
  dueDate: null,
  order: 0,
  ...o,
})

const items = [
  item('none', { order: 0 }),
  item('late', { dueDate: '2026-10-01', order: 3 }),
  item('today', { dueDate: T, order: 1 }),
  item('next', { dueDate: '2026-10-20', order: 2 }),
  item('tmr', { dueDate: '2026-10-13', order: 5 }),
  item('done1', { done: true, completedAt: 10, order: 4 }),
  item('done2', { done: true, completedAt: 20, dueDate: T, order: 6 }),
]
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('할 일 필터', () => {
  it('오늘: 안 끝난 오늘·지난 마감, 목록 순서', () => {
    expect(ids(filterTodos(items, 'today', T))).toEqual(['today', 'late'])
  })
  it('예정: 내일 이후, 마감일 순', () => {
    expect(ids(filterTodos(items, 'upcoming', T))).toEqual(['tmr', 'next'])
  })
  it('전체: 안 끝난 전부, 목록 순서', () => {
    expect(ids(filterTodos(items, 'all', T))).toEqual(['none', 'today', 'next', 'late', 'tmr'])
  })
  it('완료됨: 최근에 끝낸 순', () => {
    expect(ids(filterTodos(items, 'done', T))).toEqual(['done2', 'done1'])
  })
})

describe('검색', () => {
  it('제목과 메모에서 대소문자 무시, 앞뒤 공백 무시', () => {
    expect(matchesQuery({ title: 'Buy Milk', note: '' }, '  milk ')).toBe(true)
    expect(matchesQuery({ title: '장보기', note: '우유 사기' }, '우유')).toBe(true)
    expect(matchesQuery({ title: '장보기', note: '' }, '운동')).toBe(false)
    expect(matchesQuery({ title: '장보기', note: '' }, '   ')).toBe(true)
  })
  it('필터와 함께 적용', () => {
    const xs = [item('a', { title: '보고서 쓰기' }), item('b', { title: '산책' })]
    expect(ids(filterTodos(xs, 'all', T, '보고서'))).toEqual(['a'])
  })
})

it('남은 개수와 추가 시 마감일', () => {
  expect(remainingCount(items)).toBe(5)
  expect(dueForFilter('today', T)).toBe(T)
  expect(dueForFilter('all', T)).toBeNull()
})
