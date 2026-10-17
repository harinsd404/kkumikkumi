import type { TodoItem } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  filterTodos,
  isRealDate,
  localDateOf,
  localIso,
  memoTitle,
  parseLocalDateTime,
} from '../format'

const item = (over: Partial<TodoItem>): TodoItem => ({
  id: '00000000-0000-7000-8000-000000000001',
  listId: '00000000-0000-7000-8000-0000000000aa',
  title: '할 일',
  done: false,
  completedAt: null,
  dueDate: null,
  note: '',
  order: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

describe('날짜/시각 변환', () => {
  it('있는 날짜만 받는다', () => {
    expect(isRealDate('2026-02-28')).toBe(true)
    expect(isRealDate('2028-02-29')).toBe(true)
    expect(isRealDate('2026-02-29')).toBe(false)
    expect(isRealDate('2026-13-01')).toBe(false)
    expect(isRealDate('2026-1-01')).toBe(false)
  })

  it('로컬 벽시계 시각을 그대로 왕복한다(시간대 무관)', () => {
    const ms = parseLocalDateTime('2026-10-18T15:30')!
    expect(localIso(ms)).toMatch(/^2026-10-18T15:30[+-]\d{2}:\d{2}$/)
    expect(localDateOf(ms)).toBe('2026-10-18')
    expect(parseLocalDateTime('2026-10-18 15:30')).toBe(ms)
  })

  it('형식이 틀리거나 없는 날짜/시각은 null', () => {
    expect(parseLocalDateTime('2026-10-18')).toBeNull()
    expect(parseLocalDateTime('2026-10-18T24:00')).toBeNull()
    expect(parseLocalDateTime('2026-02-30T10:00')).toBeNull()
    expect(parseLocalDateTime('2026-10-18T15:30Z')).toBeNull()
  })

  it('달력 산술로 날을 더한다(월/연 넘김)', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('filterTodos', () => {
  const items = [
    item({ id: 'a', title: '장보기', dueDate: '2026-10-17' }),
    item({ id: 'b', title: '숙제', dueDate: '2026-10-20', note: '수학 문제집' }),
    item({ id: 'c', title: '청소', done: true, dueDate: '2026-10-10' }),
    item({ id: 'd', title: '책 읽기' }),
  ]
  const ids = (xs: TodoItem[]) => xs.map((x) => x.id)

  it('상태로 거른다', () => {
    expect(ids(filterTodos(items, { status: 'open' }))).toEqual(['a', 'b', 'd'])
    expect(ids(filterTodos(items, { status: 'done' }))).toEqual(['c'])
    expect(ids(filterTodos(items, { status: 'all' }))).toHaveLength(4)
  })

  it('마감 구간(포함)을 주면 마감 없는 항목은 빠진다', () => {
    expect(ids(filterTodos(items, { status: 'open', dueTo: '2026-10-17' }))).toEqual(['a'])
    expect(ids(filterTodos(items, { status: 'all', dueFrom: '2026-10-17' }))).toEqual(['a', 'b'])
  })

  it('제목/메모 검색(대소문자 무시)', () => {
    expect(ids(filterTodos(items, { status: 'all', query: '수학' }))).toEqual(['b'])
    expect(ids(filterTodos(items, { status: 'all', query: '  ' }))).toHaveLength(4)
  })
})

describe('memoTitle', () => {
  it('첫 줄에서 서식 기호를 뗀다', () => {
    expect(memoTitle('\n# 장보기 목록\n- 우유')).toBe('장보기 목록')
    expect(memoTitle('- [ ] 할 것')).toBe('할 것')
    expect(memoTitle('1. 첫째')).toBe('첫째')
    expect(memoTitle('')).toBe('')
  })
})
