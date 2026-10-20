import type { GridBlock } from '@kkumikkumi/schema'
import { useBoard } from '../BoardContext'
import { paletteVars } from '../style'

type ClockBlockT = Extract<GridBlock, { type: 'clock' }>

const WEEKDAY = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

/** "14:05" / "오후 2:05" */
export function clockText(now: Date, hour12: boolean): string {
  const h = now.getHours()
  const mm = String(now.getMinutes()).padStart(2, '0')
  if (!hour12) return `${String(h).padStart(2, '0')}:${mm}`
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${mm}`
}

/** 시계·날짜(꾸미기용). 보드의 분 단위 시계로 다시 그린다(초침 없음). */
export function ClockBlock({ block }: { block: ClockBlockT }) {
  const { theme, now } = useBoard()
  const p = theme.defaults.palette
  const { face, hour12, showDate } = block.props
  const date = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}`

  return (
    <div
      className={`kck kck--${block.size} kck--${face}`}
      style={{ ...paletteVars(p), color: p.text }}
    >
      {face === 'digital' ? (
        <time className="kck-time" dateTime={now.toISOString()}>
          {clockText(now, hour12)}
        </time>
      ) : (
        <AnalogFace now={now} hand={p.text} accent={p.accent} face={p.surface} />
      )}
      {showDate && <span className="kck-date">{date}</span>}
    </div>
  )
}

function AnalogFace({
  now,
  hand,
  accent,
  face,
}: {
  now: Date
  hand: string
  accent: string
  face: string
}) {
  const m = now.getMinutes()
  const hourDeg = ((now.getHours() % 12) + m / 60) * 30
  const minDeg = m * 6
  return (
    <svg className="kck-dial" viewBox="0 0 100 100" role="img" aria-label={clockText(now, false)}>
      <circle cx={50} cy={50} r={47} fill={face} stroke={accent} strokeWidth={3} />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1={50}
          y1={i % 3 === 0 ? 9 : 11}
          x2={50}
          y2={15}
          stroke={hand}
          strokeWidth={i % 3 === 0 ? 3 : 1.5}
          strokeLinecap="round"
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      <line
        x1={50}
        y1={50}
        x2={50}
        y2={27}
        stroke={hand}
        strokeWidth={5}
        strokeLinecap="round"
        transform={`rotate(${hourDeg} 50 50)`}
      />
      <line
        x1={50}
        y1={50}
        x2={50}
        y2={17}
        stroke={accent}
        strokeWidth={3}
        strokeLinecap="round"
        transform={`rotate(${minDeg} 50 50)`}
      />
      <circle cx={50} cy={50} r={4} fill={hand} />
    </svg>
  )
}
