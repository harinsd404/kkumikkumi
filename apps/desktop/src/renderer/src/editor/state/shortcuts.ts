/** 키 입력 → 에디터 명령(순수). macOS 관례: ⌘ = metaKey. */
export type Command =
  | { cmd: 'undo' }
  | { cmd: 'redo' }
  | { cmd: 'delete' }
  | { cmd: 'duplicate' }
  | { cmd: 'save' }
  | { cmd: 'escape' }
  | { cmd: 'nudge'; dx: number; dy: number; big: boolean }

export interface KeyLike {
  key: string
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  /** 입력창에 포커스가 있으면 편집 단축키를 가로채지 않는다 */
  inTextField: boolean
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function keyToCommand(e: KeyLike): Command | null {
  const k = e.key.toLowerCase()
  if (e.metaKey && !e.ctrlKey && !e.altKey) {
    if (k === 's') return { cmd: 'save' }
    if (e.inTextField) return null // 입력창의 ⌘Z 등은 기본 동작(텍스트 실행 취소)
    if (k === 'z') return e.shiftKey ? { cmd: 'redo' } : { cmd: 'undo' }
    if (k === 'd') return { cmd: 'duplicate' }
    return null
  }
  if (e.inTextField || e.ctrlKey || e.altKey || e.metaKey) return null
  if (e.key === 'Escape') return { cmd: 'escape' }
  if (e.key === 'Backspace' || e.key === 'Delete') return { cmd: 'delete' }
  const arrow = ARROWS[e.key]
  if (arrow) return { cmd: 'nudge', dx: arrow[0], dy: arrow[1], big: e.shiftKey }
  return null
}
