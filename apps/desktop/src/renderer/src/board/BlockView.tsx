import type { GridBlock } from '@kkumikkumi/schema'
import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { WIDGET_LABEL } from './blockLabels'
import { useBoard } from './BoardContext'
import { CalendarBlock } from './blocks/CalendarBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { DdayBlock } from './blocks/DdayBlock'
import { MemoBlock } from './blocks/MemoBlock'
import { TimerBlock } from './blocks/TimerBlock'
import { TimetableBlock } from './blocks/TimetableBlock'
import { TodoBlock } from './blocks/TodoBlock'
import type { Box } from './layout'
import { cardCss } from './style'

/** 블록 → 누르면 열 세부 페이지(디데이는 캘린더) */
const pageOf = (type: GridBlock['type']) =>
  type === 'image' ? null : type === 'dday' ? 'calendar' : type

/** 블록 안에서 자기 동작이 있는 요소(누르면 세부 페이지를 열지 않는다) */
const INTERACTIVE = 'button, input, select, textarea, a, label, [role="button"], [data-no-open]'

export function BlockView({ block, box }: { block: GridBlock; box: Box }) {
  const { theme, mode, actions } = useBoard()
  const page = pageOf(block.type)
  const opener = mode === 'use' && page ? actions?.pages?.[page] : undefined
  const openPage = opener && (() => opener(block))
  const down = useRef<{ x: number; y: number } | null>(null)

  // 사용 모드: 블록의 빈 곳을 누르면 세부 페이지. 끌다가 뗀 클릭은 무시한다.
  const link = openPage && {
    onPointerDownCapture: (e: PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY }
    },
    onClick: (e: MouseEvent) => {
      const d = down.current
      down.current = null
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return
      if ((e.target as Element).closest(INTERACTIVE)) return
      openPage()
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        openPage()
      }
    },
    tabIndex: 0,
    'aria-label': `${WIDGET_LABEL[page!]} — 눌러서 크게 보기`,
  }

  return (
    <section
      className={`kb-abs kb-card ${openPage ? 'is-link' : ''}`}
      data-type={block.type}
      data-size={block.size}
      style={{ ...box, ...cardCss(block.style, theme.defaults) }}
      {...link}
    >
      {block.type === 'calendar' && <CalendarBlock block={block} />}
      {block.type === 'todo' && <TodoBlock block={block} />}
      {block.type === 'timer' && <TimerBlock block={block} />}
      {block.type === 'image' && <ImageBlock block={block} />}
      {block.type === 'memo' && <MemoBlock block={block} />}
      {block.type === 'timetable' && <TimetableBlock block={block} />}
      {block.type === 'dday' && <DdayBlock block={block} />}
    </section>
  )
}
