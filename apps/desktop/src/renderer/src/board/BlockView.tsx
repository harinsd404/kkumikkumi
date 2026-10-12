import type { GridBlock } from '@kkumikkumi/schema'
import { useBoard } from './BoardContext'
import { CalendarBlock } from './blocks/CalendarBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { TimerBlock } from './blocks/TimerBlock'
import { TodoBlock } from './blocks/TodoBlock'
import type { Box } from './layout'
import { cardCss } from './style'

export function BlockView({ block, box }: { block: GridBlock; box: Box }) {
  const { theme } = useBoard()
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
    </section>
  )
}
