import { describe, expect, it } from 'vitest'
import { clockText } from '../blocks/ClockBlock'

describe('clockText', () => {
  it('24시간 / 오전·오후 12시간', () => {
    expect(clockText(new Date(2026, 9, 20, 9, 5), false)).toBe('09:05')
    expect(clockText(new Date(2026, 9, 20, 14, 5), true)).toBe('오후 2:05')
    expect(clockText(new Date(2026, 9, 20, 0, 30), true)).toBe('오전 12:30')
    expect(clockText(new Date(2026, 9, 20, 12, 0), true)).toBe('오후 12:00')
  })
})
