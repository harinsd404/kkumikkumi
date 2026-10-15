import { describe, expect, it } from 'vitest'
import { groupOf } from '../group'

describe('groupOf', () => {
  it('key가 있으면 대상마다 따로 묶고, 없으면 묶지 않는다', () => {
    expect(groupOf('b1', 'bg')).toEqual({ groupKey: 'bg:b1' })
    expect(groupOf('b1')).toEqual({})
  })
})
