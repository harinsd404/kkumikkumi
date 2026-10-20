import type { GridBlock, ProgressPeriod } from '@kkumikkumi/schema'
import { localDate } from '../../board/calendar'
import { Row, Segmented } from '../fields'

type ProgressProps = Extract<GridBlock, { type: 'progress' }>['props']
type ClockProps = Extract<GridBlock, { type: 'clock' }>['props']

const KIND_LABEL: Record<ProgressPeriod['kind'], string> = {
  day: '오늘',
  week: '이번 주',
  month: '이번 달',
  year: '올해',
  custom: '직접 지정',
}
const KINDS = Object.keys(KIND_LABEL) as ProgressPeriod['kind'][]

/** 기간 종류를 바꿀 때: 직접 지정이면 오늘부터 30일로 시작 */
function periodOfKind(kind: ProgressPeriod['kind']): ProgressPeriod {
  if (kind !== 'custom') return { kind }
  const today = localDate(Date.now())
  const end = new Date()
  end.setDate(end.getDate() + 30)
  return { kind, label: '내 기간', start: today, end: localDate(end.getTime()) }
}

/** 진행률 블록: 기간 1~3개(S 크기는 첫 기간만 보인다), 주 시작 요일 */
export function ProgressFields({
  props,
  small,
  onChange,
}: {
  props: ProgressProps
  small: boolean
  onChange(patch: Partial<ProgressProps>, groupKey?: string): void
}) {
  const set = (i: number, p: ProgressPeriod, key?: string) =>
    onChange({ periods: props.periods.map((x, j) => (j === i ? p : x)) }, key)
  return (
    <>
      {props.periods.map((p, i) => (
        <div key={i} className="ki-period">
          <Row label={small && i > 0 ? `기간 ${i + 1} (크게에서)` : `기간 ${i + 1}`}>
            <select
              className="ki-select"
              value={p.kind}
              onChange={(e) => set(i, periodOfKind(e.target.value as ProgressPeriod['kind']))}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            {props.periods.length > 1 && (
              <button
                type="button"
                className="ki-small"
                aria-label={`기간 ${i + 1} 빼기`}
                onClick={() => onChange({ periods: props.periods.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            )}
          </Row>
          {p.kind === 'custom' && (
            <>
              <Row label="이름">
                <input
                  className="ki-text"
                  value={p.label}
                  maxLength={20}
                  onChange={(e) =>
                    e.target.value.trim() && set(i, { ...p, label: e.target.value }, `plabel${i}`)
                  }
                />
              </Row>
              <Row label="시작 ~ 끝">
                <input
                  className="ki-text"
                  type="date"
                  value={p.start}
                  onChange={(e) => {
                    const start = e.target.value
                    if (start) set(i, { ...p, start, end: p.end < start ? start : p.end })
                  }}
                />
                <input
                  className="ki-text"
                  type="date"
                  value={p.end}
                  onChange={(e) => {
                    const end = e.target.value
                    if (end) set(i, { ...p, end, start: p.start > end ? end : p.start })
                  }}
                />
              </Row>
            </>
          )}
        </div>
      ))}
      {props.periods.length < 3 && (
        <div className="ki-buttons">
          <button
            type="button"
            onClick={() => onChange({ periods: [...props.periods, { kind: 'month' }] })}
          >
            + 기간 추가
          </button>
        </div>
      )}
      <Segmented
        label="주 시작"
        value={props.weekStartsOn}
        options={[
          { value: 1, label: '월요일' },
          { value: 0, label: '일요일' },
        ]}
        onChange={(weekStartsOn) => onChange({ weekStartsOn })}
      />
    </>
  )
}

/** 시계 블록: 디지털/아날로그, 12/24시간, 날짜 */
export function ClockFields({
  props,
  onChange,
}: {
  props: ClockProps
  onChange(patch: Partial<ClockProps>): void
}) {
  return (
    <>
      <Segmented
        label="모양"
        value={props.face}
        options={[
          { value: 'digital', label: '디지털' },
          { value: 'analog', label: '아날로그' },
        ]}
        onChange={(face) => onChange({ face })}
      />
      {props.face === 'digital' && (
        <Segmented
          label="시간"
          value={props.hour12 ? '12' : '24'}
          options={[
            { value: '24', label: '24시간' },
            { value: '12', label: '오전/오후' },
          ]}
          onChange={(v) => onChange({ hour12: v === '12' })}
        />
      )}
      <Segmented
        label="날짜"
        value={props.showDate ? 'on' : 'off'}
        options={[
          { value: 'on', label: '보이기' },
          { value: 'off', label: '숨기기' },
        ]}
        onChange={(v) => onChange({ showDate: v === 'on' })}
      />
    </>
  )
}
