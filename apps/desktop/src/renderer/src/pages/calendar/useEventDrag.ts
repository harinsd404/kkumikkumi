import type { CalendarEvent } from '@kkumikkumi/schema'
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { BoardActions } from '../../board/BoardContext'
import type { EventInput } from '../../board/calendar'
import {
  dropResult,
  MINUTES_PER_DAY,
  SNAP_MIN,
  snapMinutes,
  type DropTarget,
} from '../calendarView'

// 끌어서 옮기기: 일정 요소에 포인터 핸들러를 붙이고, 놓을 자리(data-drop 칸)를 찾는다.

export interface Drag {
  event: CalendarEvent
  /** 끌기 시작한 칸의 날짜(여러 날 일정은 잡은 칸 기준으로 옮긴다) */
  originDate: string
  /** 시간 칸에서 잡은 위치와 일정 시작 사이의 분 */
  grabMin: number
  startX: number
  startY: number
  moved: boolean
  target: DropTarget | null
}

/** 화면 좌표 아래의 놓을 자리(data-drop 칸) */
function dropTargetAt(x: number, y: number, grabMin: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')
  const date = el?.dataset['date']
  if (!el || !date) return null
  if (el.dataset['drop'] === 'day') return { kind: 'day', date }
  const r = el.getBoundingClientRect()
  // 잡은 곳이 일정 시작보다 앞날이면(여러 날 일정의 둘째 날 부분) 시작이 전날로 갈 수 있다
  const minute = snapMinutes(((y - r.top) / r.height) * MINUTES_PER_DAY - grabMin)
  return { kind: 'time', date, minute: Math.min(MINUTES_PER_DAY - SNAP_MIN, minute) }
}

export function useEventDrag(
  actions: BoardActions,
  update: (id: string, e: EventInput) => Promise<boolean>,
) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const ref = useRef<Drag | null>(null)
  const set = (d: Drag | null) => {
    ref.current = d
    setDrag(d)
  }

  /** 일정 요소에 붙이는 포인터 핸들러. 움직이지 않고 떼면 고치기 창을 연다. */
  const bind = (event: CalendarEvent, originDate: string, grabMin = 0) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      // 칸 밖으로 끌어도 이 요소가 이벤트를 받게 한다(이미 끝난 포인터면 무시)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* 무시 */
      }
      set({
        event,
        originDate,
        grabMin,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        target: null,
      })
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const d = ref.current
      if (!d || d.event.id !== event.id) return
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4
      if (!moved) return
      set({ ...d, moved, target: dropTargetAt(e.clientX, e.clientY, d.grabMin) })
    },
    onPointerUp: () => {
      const d = ref.current
      set(null)
      if (!d || d.event.id !== event.id) return
      if (!d.moved) return actions.calendar.openEditor({ event })
      const next = dropResult(d)
      if (next) void update(event.id, next)
    },
    onPointerCancel: () => set(null),
    onDoubleClick: (e: ReactMouseEvent) => e.stopPropagation(),
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        actions.calendar.openEditor({ event })
      }
    },
  })

  return { drag: drag?.moved ? drag : null, bind }
}

export type Bind = ReturnType<typeof useEventDrag>['bind']
