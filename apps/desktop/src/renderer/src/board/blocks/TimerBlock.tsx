import type { GridBlock } from '@kkumikkumi/schema'
import { useBoard } from '../BoardContext'
import type { Box } from '../layout'

type TimerBlockT = Extract<GridBlock, { type: 'timer' }>

/** 타이머 플레이스홀더: 첫 프리셋 시간만 표시. 동작(endsAt 기반)은 M4. */
export function TimerBlock({ block, box }: { block: TimerBlockT; box: Box }) {
  const { theme } = useBoard()
  const p = theme.defaults.palette
  const minutes = block.props.presetsMin[0] ?? 25
  const label = `${String(minutes).padStart(2, '0')}:00`
  const ring = block.props.display === 'ring' && block.size === 'M'
  const r = Math.min(box.width, box.height) / 2 - 30

  return (
    <div className="ktm">
      {ring && (
        <svg className="ktm-ring" viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden>
          <circle
            cx={box.width / 2}
            cy={box.height / 2}
            r={r}
            fill="none"
            stroke={p.surface}
            strokeWidth={12}
          />
          <circle
            cx={box.width / 2}
            cy={box.height / 2}
            r={r}
            fill="none"
            stroke={p.accent}
            strokeWidth={12}
          />
        </svg>
      )}
      <span className="ktm-time" style={{ color: p.text, fontSize: block.size === 'S' ? 56 : 64 }}>
        {label}
      </span>
    </div>
  )
}
