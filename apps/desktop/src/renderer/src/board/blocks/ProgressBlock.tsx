import type { GridBlock } from '@kkumikkumi/schema'
import { useBoard } from '../BoardContext'
import { percent, periodProgress } from '../progress'
import { paletteVars } from '../style'

type ProgressBlockT = Extract<GridBlock, { type: 'progress' }>

/** 진행률: 기간이 얼마나 지났는지 막대로. S는 첫 기간 한 줄, M은 최대 세 기간. 분 단위로 갱신된다. */
export function ProgressBlock({ block }: { block: ProgressBlockT }) {
  const { theme, now } = useBoard()
  const p = theme.defaults.palette
  const periods = block.size === 'S' ? block.props.periods.slice(0, 1) : block.props.periods
  const rows = periods.map((x) => periodProgress(x, now, block.props.weekStartsOn))

  return (
    <div className={`kpr kpr--${block.size}`} style={{ ...paletteVars(p), color: p.text }}>
      {block.size === 'M' && <p className="kpr-head">진행률</p>}
      {rows.map((r, i) => (
        <div key={i} className="kpr-row">
          <div className="kpr-top">
            <span className="kpr-label">{r.label}</span>
            <strong className="kpr-pct">{percent(r.ratio)}%</strong>
          </div>
          <div
            className="kpr-track"
            role="progressbar"
            aria-label={r.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent(r.ratio)}
          >
            <span className="kpr-fill" style={{ width: `${r.ratio * 100}%` }} />
          </div>
          <span className="kpr-detail">{r.detail}</span>
        </div>
      ))}
    </div>
  )
}
