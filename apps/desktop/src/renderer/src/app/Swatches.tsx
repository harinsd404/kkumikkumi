import type { SwatchGroup } from './colorGroups'

/** 색 고르기 팔레트(인스펙터, 일정 창 공용). 묶음마다 이름 한 줄 + 색 한 줄. */
export function Swatches({
  groups,
  value,
  onPick,
  size = 'small',
}: {
  groups: readonly SwatchGroup[]
  value: string | null
  onPick(color: string): void
  size?: 'small' | 'large'
}) {
  const v = value?.toLowerCase() ?? null
  return (
    <div className={`sw sw--${size}`}>
      {groups.map((g) => (
        <div key={g.label} className="sw-group" role="group" aria-label={g.label}>
          <span className="sw-label">{g.label}</span>
          <div className="sw-row">
            {g.colors.map((c) => (
              <button
                key={c}
                type="button"
                className="sw-swatch"
                style={{ background: c }}
                aria-label={`${g.label} ${c}`}
                aria-pressed={v === c}
                title={c}
                onClick={() => onPick(c)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
