import { describe, expect, it } from 'vitest'
import { keyToCommand, type KeyLike } from '../shortcuts'

const k = (key: string, o: Partial<KeyLike> = {}): KeyLike => ({
  key,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  inTextField: false,
  ...o,
})

describe('keyToCommand', () => {
  it('⌘Z / ⇧⌘Z / ⌘D / ⌘S', () => {
    expect(keyToCommand(k('z', { metaKey: true }))).toEqual({ cmd: 'undo' })
    expect(keyToCommand(k('Z', { metaKey: true, shiftKey: true }))).toEqual({ cmd: 'redo' })
    expect(keyToCommand(k('d', { metaKey: true }))).toEqual({ cmd: 'duplicate' })
    expect(keyToCommand(k('s', { metaKey: true }))).toEqual({ cmd: 'save' })
  })
  it('삭제, Esc, 방향키(Shift = 크게)', () => {
    expect(keyToCommand(k('Backspace'))).toEqual({ cmd: 'delete' })
    expect(keyToCommand(k('Delete'))).toEqual({ cmd: 'delete' })
    expect(keyToCommand(k('Escape'))).toEqual({ cmd: 'escape' })
    expect(keyToCommand(k('ArrowLeft', { shiftKey: true }))).toEqual({
      cmd: 'nudge',
      dx: -1,
      dy: 0,
      big: true,
    })
  })
  it('입력창에서는 ⌘S만 가로채고 나머지는 기본 동작', () => {
    expect(keyToCommand(k('z', { metaKey: true, inTextField: true }))).toBeNull()
    expect(keyToCommand(k('Backspace', { inTextField: true }))).toBeNull()
    expect(keyToCommand(k('ArrowLeft', { inTextField: true }))).toBeNull()
    expect(keyToCommand(k('s', { metaKey: true, inTextField: true }))).toEqual({ cmd: 'save' })
  })
  it('Ctrl/Alt 조합과 모르는 키는 무시', () => {
    expect(keyToCommand(k('z', { ctrlKey: true }))).toBeNull()
    expect(keyToCommand(k('a'))).toBeNull()
  })
})
