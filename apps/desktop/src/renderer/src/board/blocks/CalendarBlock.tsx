import type { GridBlock, Palette } from '@kkumikkumi/schema'
import { useState } from 'react'
import chevronLeftUrl from '../icons/chevron-left.svg'
import chevronRightUrl from '../icons/chevron-right.svg'
import { useBoard } from '../BoardContext'
import { monthGrid, shiftMonth, weekdayLabels, type DayCell } from '../calendar'
import type { Box } from '../layout'
import { maskCss } from '../style'

type CalendarBlockT = Extract<GridBlock, { type: 'calendar' }>

/**
 * 시안의 월 캘린더. L은 Figma 6:2597(요일 + 칸), M은 Figma 3:2013(미니: 숫자 + 점).
 * 일정 표시는 M4. 달 이동은 보기 상태라 사용 모드에서도 허용.
 */
export function CalendarBlock({ block }: { block: CalendarBlockT; box: Box }) {
  const { theme, now } = useBoard()
  const p = theme.defaults.palette
  const { weekStartsOn } = block.props
  const [view, setView] = useState({ year: now.getFullYear(), month0: now.getMonth() })
  const mini = block.size === 'M'

  const rows: DayCell[][] = monthGrid(view.year, view.month0, weekStartsOn)
  const nav = (dir: -1 | 1) => setView((v) => shiftMonth(v.year, v.month0, dir))
  const gridRows = { gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }

  return (
    <div className={`kc ${mini ? 'kc--mini' : ''}`}>
      <header className="kc-head">
        <h2 className="kc-title" style={{ color: p.text }}>
          {view.year}년 {view.month0 + 1}월
        </h2>
        <div className="kc-navs">
          <NavButton dir={-1} palette={p} onClick={nav} />
          <NavButton dir={1} palette={p} onClick={nav} />
        </div>
      </header>
      {mini ? (
        <div className="kc-mini-grid" style={{ ...gridRows, color: p.subText }}>
          {rows.flat().map((c) => (
            <div key={c.date} className={`kc-mini-day ${c.inMonth ? '' : 'is-outside'}`}>
              <span>{c.day}</span>
              <i className="kc-dot" style={{ background: p.subText }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="kc-weekdays" style={{ color: p.subText }}>
            {weekdayLabels(weekStartsOn).map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <div className="kc-grid" style={gridRows}>
            {rows.flat().map((c) => (
              <div
                key={c.date}
                className="kc-cell"
                style={{ background: p.surface, color: p.subText }}
              >
                {c.day}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function NavButton({
  dir,
  palette,
  onClick,
}: {
  dir: -1 | 1
  palette: Palette
  onClick(dir: -1 | 1): void
}) {
  return (
    <button
      type="button"
      className="kc-nav"
      aria-label={dir < 0 ? '이전 달' : '다음 달'}
      style={{ background: palette.control }}
      onClick={() => onClick(dir)}
    >
      <span
        className="kc-chevron"
        style={maskCss(dir < 0 ? chevronLeftUrl : chevronRightUrl, palette.text)}
      />
    </button>
  )
}
