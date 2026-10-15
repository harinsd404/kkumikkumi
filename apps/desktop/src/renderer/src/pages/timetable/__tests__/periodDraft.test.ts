import type { TimetableSlot } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import { badPeriodIndex, periodsChanged, removedCells, setPeriodTime } from '../periodDraft'

const P = [
  { start: '09:00', end: '09:50' },
  { start: '10:00', end: '10:50' },
  { start: '11:00', end: '11:50' },
]
const at = (slot: TimetableSlot) => ({ slot })

describe('교시 시각 편집 판정', () => {
  it('바뀌었는지', () => {
    expect(
      periodsChanged(
        P,
        P.map((p) => ({ ...p })),
      ),
    ).toBe(false)
    expect(periodsChanged(P.slice(0, 2), P)).toBe(true)
    expect(periodsChanged(setPeriodTime(P, 1, 'end', '10:45'), P)).toBe(true)
  })

  it('잘못된 첫 교시: 끝이 시작보다 뒤가 아니거나 앞 교시와 겹침', () => {
    expect(badPeriodIndex(P)).toBe(-1)
    expect(badPeriodIndex(setPeriodTime(P, 2, 'end', '11:00'))).toBe(2)
    expect(badPeriodIndex(setPeriodTime(P, 1, 'start', '09:40'))).toBe(1)
    // 앞 교시 끝과 바로 이어지는 건 괜찮다
    expect(badPeriodIndex(setPeriodTime(P, 1, 'start', '09:50'))).toBe(-1)
    // 여러 개면 첫 번째
    expect(
      badPeriodIndex(setPeriodTime(setPeriodTime(P, 2, 'end', '10:00'), 0, 'end', '08:00')),
    ).toBe(0)
  })

  it('교시를 줄이면 지워지는 칸(시간 항목은 세지 않는다)', () => {
    const entries = [
      at({ kind: 'period', day: 0, period: 1 }),
      at({ kind: 'period', day: 1, period: 3 }),
      at({ kind: 'period', day: 2, period: 3 }),
      at({ kind: 'time', day: 0, start: '20:00', end: '21:00' }),
    ]
    expect(removedCells(entries, 3)).toBe(0)
    expect(removedCells(entries, 2)).toBe(2)
    expect(removedCells(entries, 0)).toBe(3)
  })

  it('setPeriodTime은 원래 목록을 바꾸지 않는다', () => {
    const next = setPeriodTime(P, 0, 'start', '08:30')
    expect(next[0]).toEqual({ start: '08:30', end: '09:50' })
    expect(P[0]).toEqual({ start: '09:00', end: '09:50' })
    expect(next[1]).toBe(P[1])
  })
})
