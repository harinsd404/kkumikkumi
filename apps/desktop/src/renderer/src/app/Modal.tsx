import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

// 대화창 공용 틀: 바깥 누르기/Escape로 닫기. 여러 창이 겹치면 맨 위 창만 Escape에 반응한다.

const stack: object[] = []

/** 대화창이 하나라도 열려 있는지(열려 있으면 보드 편집 단축키를 막는다) */
export const isModalOpen = (): boolean => stack.length > 0

/**
 * 이 컴포넌트가 떠 있는 동안 대화창 스택에 올리고, 맨 위일 때만 Escape로 onClose를 부른다.
 * 안쪽 입력이 Escape를 먼저 처리했으면(stopPropagation/preventDefault) 닫지 않는다.
 */
export function useModal(onClose: () => void, busy = false): void {
  const latest = useRef({ onClose, busy })
  useLayoutEffect(() => {
    latest.current = { onClose, busy }
  })
  useEffect(() => {
    const token = {}
    stack.push(token)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || stack.at(-1) !== token) return
      e.preventDefault()
      if (!latest.current.busy) latest.current.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(token), 1)
    }
  }, [])
}

/** 반투명 배경 + useModal. 안쪽에 role="dialog" 요소를 넣는다. */
export function ModalBackdrop({
  onClose,
  busy = false,
  children,
}: {
  onClose(): void
  busy?: boolean
  children: ReactNode
}) {
  useModal(onClose, busy)
  return (
    <div
      className="dlg-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      {children}
    </div>
  )
}
