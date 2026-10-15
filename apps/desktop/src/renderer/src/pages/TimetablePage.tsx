import type { TimetableSettings } from '@kkumikkumi/schema'
import { useState } from 'react'
import './pages.css'
import { autoColors, minuteOfDay, pickTimetable, visibleDays, weekdayOf } from '../board/timetable'
import type { TimetableStore } from '../app/useTimetable'
import { NEW_NAME, type Sel } from './timetable/common'
import { EntryEditor } from './timetable/EntryEditor'
import { PeriodGrid } from './timetable/PeriodGrid'
import { PeriodTimes } from './timetable/PeriodTimes'
import { TimeGrid } from './timetable/TimeGrid'
import { TimetableList } from './timetable/TimetableList'

interface Props {
  store: TimetableStore
  now: Date
  /** 테마 색 톤(번호 → 색) */
  tones: readonly string[]
}

/** 시간표 세부 페이지: 교시 표 또는 요일×시각 표 / 오른쪽에서 칸 편집·표시 설정·시간표 목록 */
export function TimetablePage({ store, now, tones }: Props) {
  const [sel, setSel] = useState<Sel | null>(null)
  const [showList, setShowList] = useState(false)
  const data = store.data
  if (!data) return <div className="pg" />
  const view = pickTimetable(data)

  if (!view)
    return (
      <div className="pg pg-tt">
        <section className="pg-card tt-main tt-none" aria-label="시간표">
          <p className="pg-empty">시간표가 없어요</p>
          <button
            type="button"
            className="pg-pill is-filled"
            onClick={() => void store.createTimetable(NEW_NAME)}
          >
            시간표 만들기
          </button>
        </section>
      </div>
    )

  const { timetable: t, settings: s, entries } = view
  const days = visibleDays(s)
  const today = weekdayOf(now)
  const minute = minuteOfDay(now)
  // 자동 색은 방식마다 따로(교시 과목이 시간 방식 색 차례를 차지하지 않게)
  const auto = autoColors(entries.filter((e) => e.slot.kind === s.mode))
  const colors = { auto, tones }

  const update = (patch: Partial<TimetableSettings>) =>
    store.updateTimetable(t.id, { settings: patch })
  const setMode = (mode: TimetableSettings['mode']) => {
    setSel(null)
    void update({ mode })
  }
  const select = (id: string) => {
    setSel(null)
    if (id !== t.id) void store.select(id)
  }

  return (
    <div className="pg pg-tt">
      <section className="pg-card tt-main" aria-label="시간표">
        <header className="pg-head">
          <select
            className="tt-picker"
            aria-label="시간표 고르기"
            value={t.id}
            onChange={(e) => select(e.target.value)}
          >
            {data.timetables.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pg-pill tt-list-toggle"
            aria-pressed={showList}
            onClick={() => {
              setSel(null)
              setShowList(!showList)
            }}
          >
            목록
          </button>
          <span className="pg-spacer" />
          <div className="tt-seg" role="tablist" aria-label="보기 방식">
            {(
              [
                ['period', '교시'],
                ['time', '시간'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={s.mode === m}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
        {s.mode === 'period' ? (
          <PeriodGrid
            colors={colors}
            settings={s}
            entries={entries}
            days={days}
            today={today}
            minute={minute}
            sel={sel}
            onSelect={(x) => {
              setShowList(false)
              setSel(x)
            }}
          />
        ) : (
          <TimeGrid
            colors={colors}
            settings={s}
            entries={entries}
            days={days}
            today={today}
            minute={minute}
            sel={sel}
            onSelect={(x) => {
              setShowList(false)
              setSel(x)
            }}
          />
        )}
      </section>

      <aside className="pg-card tt-side" aria-label="편집">
        {sel ? (
          <EntryEditor
            key={`${t.id}:${JSON.stringify(sel)}`}
            store={store}
            timetableId={t.id}
            entries={entries}
            colors={colors}
            settings={s}
            sel={sel}
            days={days}
            onSelect={setSel}
          />
        ) : showList ? (
          <TimetableList
            store={store}
            timetables={data.timetables}
            entries={data.entries}
            activeId={t.id}
            onSelect={select}
            onClose={() => setShowList(false)}
          />
        ) : (
          <>
            <fieldset className="tt-show">
              <legend className="pg-chip">표시</legend>
              {(
                [
                  ['showSat', '토요일'],
                  ['showSun', '일요일'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="tt-check">
                  <input
                    type="checkbox"
                    checked={s[k]}
                    onChange={(e) => void update({ [k]: e.target.checked })}
                  />
                  <span className="tt-check-box" aria-hidden />
                  {label}도 보기
                </label>
              ))}
            </fieldset>
            {s.mode === 'period' ? (
              <PeriodTimes
                // 다른 시간표로 바꾸거나 저장된 교시가 바뀌면 고치던 내용을 새로 시작
                key={`${t.id}:${JSON.stringify(s.periods)}`}
                settings={s}
                entries={entries}
                onApply={(periods) => update({ periods })}
              />
            ) : (
              <div className="tt-help">
                <h2 className="pg-chip">시간 방식</h2>
                <p className="pg-empty">빈 곳을 두 번 누르면 그 시각에 수업을 추가해요.</p>
                <button
                  type="button"
                  className="pg-pill is-filled"
                  onClick={() =>
                    setSel({
                      kind: 'new',
                      slot: {
                        kind: 'time',
                        day: days.includes(today) ? today : 0,
                        start: '09:00',
                        end: '10:00',
                      },
                    })
                  }
                >
                  + 수업 추가
                </button>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
