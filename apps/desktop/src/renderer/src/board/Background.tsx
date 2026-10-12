import dotsFirstUrl from './icons/pattern-dots-first.svg'
import dotsUrl from './icons/pattern-dots.svg'
import starsUrl from './icons/pattern-stars.svg'
import { useBoard } from './BoardContext'
import { patternRows } from './pattern'
import { maskCss } from './style'

export function Background() {
  const { theme, assetUrl } = useBoard()
  const bg = theme.background

  if (bg.type === 'image') {
    const url = assetUrl(bg.assetHash)
    return (
      <div className="kb-bg">
        {url && (
          <img
            className="kb-fill"
            src={url}
            alt=""
            style={{ objectFit: bg.fit }}
            draggable={false}
          />
        )}
      </div>
    )
  }

  const rows = bg.pattern ? patternRows(bg.pattern.id) : []
  const rowUrl = (variant: 'first' | 'normal') =>
    bg.pattern?.id === 'stars' ? starsUrl : variant === 'first' ? dotsFirstUrl : dotsUrl

  return (
    <div className="kb-bg" style={{ background: bg.color }}>
      {bg.pattern &&
        rows.map((r, i) => (
          <div
            key={i}
            className="kb-abs"
            style={{
              left: r.x,
              top: r.y,
              width: r.width,
              height: r.height,
              ...maskCss(rowUrl(r.variant), bg.pattern!.color),
            }}
          />
        ))}
    </div>
  )
}
