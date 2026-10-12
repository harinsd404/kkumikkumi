import type { GridBlock } from '@kkumikkumi/schema'
import { useBoard } from './BoardContext'
import { CalendarBlock } from './blocks/CalendarBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { TimerBlock } from './blocks/TimerBlock'
import { TodoBlock } from './blocks/TodoBlock'
import type { Box } from './layout'
import openUrl from './icons/open.svg'
import { cardCss, maskCss } from './style'

const PAGE_LABEL = { todo: '할 일', calendar: '캘린더', timer: '타이머' } as const

export function BlockView({ block, box }: { block: GridBlock; box: Box }) {
  const { theme, mode, actions } = useBoard()
  const openPage =
    mode === 'use' && block.type !== 'image' ? actions?.pages?.[block.type] : undefined
  return (
    <section
      className="kb-abs kb-card"
      data-type={block.type}
      data-size={block.size}
      style={{ ...box, ...cardCss(block.style, theme.defaults) }}
    >
      {block.type === 'calendar' && <CalendarBlock block={block} box={box} />}
      {block.type === 'todo' && <TodoBlock block={block} />}
      {block.type === 'timer' && <TimerBlock block={block} box={box} />}
      {block.type === 'image' && <ImageBlock block={block} />}
      {openPage && (
        <button
          type="button"
          className="kb-open"
          aria-label={`${PAGE_LABEL[block.type as keyof typeof PAGE_LABEL]} 크게 보기`}
          title="크게 보기"
          style={{ background: theme.defaults.palette.control }}
          onClick={openPage}
        >
          <span style={maskCss(openUrl, theme.defaults.palette.text)} />
        </button>
      )}
    </section>
  )
}
