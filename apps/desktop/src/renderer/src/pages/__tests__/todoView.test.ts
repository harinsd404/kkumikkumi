import { describe, expect, it } from 'vitest'
import { dueForView, matchesQuery, remainingByDay, viewItems, viewSections } from '../todoView'

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

describe('할 일 보기', () => {
  it('이 날(오늘): 오늘 마감과 지난 못 한 일, 안 끝난 것 먼저', () => {
    const withDone = [...items, item('doneToday', { dueDate: T, done: true, order: -1 })]
    expect(ids(viewItems(withDone, 'day', T, T))).toEqual(['today', 'late', 'doneToday', 'done2'])
  })
  it('이 날(다른 날): 그날 마감만', () => {
    expect(ids(viewItems(items, 'day', '2026-10-13', T))).toEqual(['tmr'])
    expect(ids(viewItems(items, 'day', '2026-10-01', T))).toEqual(['late'])
  })
  it('전체: 안 끝난 전부, 카테고리 안 순서', () => {
    expect(ids(viewItems(items, 'all', T, T))).toEqual(['none', 'today', 'next', 'late', 'tmr'])
  })
  it('완료: 최근에 끝낸 순', () => {
    expect(ids(viewItems(items, 'done', T, T))).toEqual(['done2', 'done1'])
  })
  it('카테고리별: 순서대로, 빈 카테고리도, 검색 중엔 빈 카테고리 빼기', () => {
    const lists = [
      { id: 'b', name: '학교', order: 1 },
      { id: 'a', name: '개인', order: 0 },
    ]
    const byList = { a: items, b: [] }
    expect(viewSections(lists, byList, 'all', T, T).map((s) => s.name)).toEqual(['개인', '학교'])
    expect(viewSections(lists, byList, 'all', T, T, 'tmr').map((s) => s.name)).toEqual(['개인'])
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
    expect(ids(viewItems(xs, 'all', T, T, '보고서'))).toEqual(['a'])
  })
})

it('날짜별 남은 할 일 수와 추가 시 마감일', () => {
  const counts = remainingByDay({ a: items, b: [item('x', { dueDate: T })] })
  expect(counts.get(T)).toBe(2)
  expect(counts.get('2026-10-01')).toBe(1)
  expect(counts.has('2026-10-05')).toBe(false) // 끝난 일은 세지 않는다
  expect(dueForView('day', '2026-10-20')).toBe('2026-10-20')
  expect(dueForView('all', T)).toBeNull()
})
