import type { TimetableEntry, TimetableSettings } from '@kkumikkumi/schema'
import { useState } from 'react'
import { nextPeriodTime } from '../../board/timetable'
import { badPeriodIndex, periodsChanged, removedCells, setPeriodTime } from './periodDraft'

/** 교시 시각 편집. 교시를 줄이면 그 교시 칸들이 지워지므로 한 번 더 눌러 확인한다. */
export function PeriodTimes({
  settings: s,
  entries,
  onApply,
}: {
  settings: TimetableSettings
  entries: readonly TimetableEntry[]
  onApply(periods: TimetableSettings['periods']): Promise<boolean>
}) {
  const [draft, setDraft] = useState(s.periods)
  const [confirm, setConfirm] = useState(false)

  const dirty = periodsChanged(draft, s.periods)
  const removed = removedCells(entries, draft.length)
  const badIndex = badPeriodIndex(draft)
  const next = nextPeriodTime(draft)

  const set = (i: number, key: 'start' | 'end', v: string) => {
    if (!v) return
    setConfirm(false)
    setDraft(setPeriodTime(draft, i, key, v))
  }

  return (
    <div className="tt-periods">
      <h2 className="pg-chip">교시 시각</h2>
      <p className="pg-empty">칸을 누르면 과목을 적을 수 있어요.</p>
      <ol className="tt-period-list">
        {draft.map((p, i) => (
          <li key={i} className={i === badIndex ? 'is-bad' : ''}>
            <span className="tt-period-n">{i + 1}교시</span>
            <input
              className="pg-input"
              type="time"
              aria-label={`${i + 1}교시 시작`}
              value={p.start}
              onChange={(e) => set(i, 'start', e.target.value)}
            />
            <span aria-hidden>–</span>
            <input
              className="pg-input"
              type="time"
              aria-label={`${i + 1}교시 끝`}
              value={p.end}
              onChange={(e) => set(i, 'end', e.target.value)}
            />
          </li>
        ))}
      </ol>
      <div className="pg-quick">
        <button
          type="button"
          className="pg-pill"
          disabled={!next || draft.length >= 12}
          onClick={() => next && setDraft([...draft, next])}
        >
          + 교시
        </button>
        <button
          type="button"
          className="pg-pill"
          disabled={draft.length <= 1}
          onClick={() => {
            setConfirm(false)
            setDraft(draft.slice(0, -1))
          }}
        >
          − 마지막 교시
        </button>
      </div>
      {badIndex !== -1 && (
        <p className="tt-error" role="alert">
          {badIndex + 1}교시 시각을 확인해 주세요(끝이 시작보다 뒤, 앞 교시와 겹치지 않게)
        </p>
      )}
      {dirty && (
        <div className="pg-detail-actions">
          <button
            type="button"
            className={`pg-pill ${removed > 0 && confirm ? 'is-danger' : 'is-filled'}`}
            disabled={badIndex !== -1}
            onClick={async () => {
              if (removed > 0 && !confirm) return setConfirm(true)
              setConfirm(false)
              await onApply(draft)
            }}
          >
            {removed > 0 && confirm ? `${removed}칸이 지워져요 · 다시 눌러 적용` : '적용'}
          </button>
          <button
            type="button"
            className="pg-pill"
            onClick={() => {
              setConfirm(false)
              setDraft(s.periods)
            }}
          >
            되돌리기
          </button>
        </div>
      )}
    </div>
  )
}
