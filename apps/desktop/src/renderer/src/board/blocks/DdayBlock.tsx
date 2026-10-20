import type { CalendarEvent, GridBlock } from '@kkumikkumi/schema'
import { useBoard, type BoardActions } from '../BoardContext'
import { addDays, localDate } from '../calendar'
import { ddayDateLabel, ddayOf } from '../dday'
import { blockPalette, paletteVars } from '../style'
import { useKeyedAsync } from '../useKeyedAsync'

type DdayBlockT = Extract<GridBlock, { type: 'dday' }>

interface Loaded {
  /** 보여 줄 일정. null = 없음(자동: 다가오는 일정 없음 / 고정: 지워짐), undefined = 불러오지 못함 */
  main: CalendarEvent | null | undefined
  next: CalendarEvent[]
}

/** 미리보기(위젯 갤러리 등, 데이터 통로 없음)용 예시 일정 */
function sample(today: string): Loaded {
  const ev = (id: string, title: string, days: number, color: string): CalendarEvent => ({
    id,
    title,
    color,
    note: '',
    recurrence: null,
    createdAt: 0,
    updatedAt: 0,
    allDay: true,
    startDate: addDays(today, days),
    endDate: addDays(today, days),
  })
  return {
    main: ev('s1', '기말고사', 12, '#f4c2df'),
    next: [ev('s2', '수학여행', 30, '#c4e0f0'), ev('s3', '방학', 61, '#f6ebb5')],
  }
}

/** 고정 일정이면 그 일정, 아니면 가장 가까운 다가오는 일정. M은 다음 일정 2개도. */
async function loadDday(
  cal: BoardActions['calendar'],
  eventId: string | null,
  today: string,
): Promise<Loaded> {
  if (eventId) {
    const [main, list] = await Promise.all([cal.get(eventId), cal.upcoming(today, 3)])
    return { main, next: list.filter((e) => e.id !== eventId).slice(0, 2) }
  }
  const list = await cal.upcoming(today, 3)
  return { main: list[0] ?? null, next: list.slice(1, 3) }
}

/** 날짜가 바뀌거나(today) 사용자 데이터가 바뀌면(version) 다시 불러온다. 데이터 통로가 없으면 예시. */
function useDday(
  eventId: string | null,
  actions: BoardActions | undefined,
  version: number,
  today: string,
): Loaded | null {
  const loaded = useKeyedAsync(
    `${eventId ?? 'auto'}|${today}|${version}`,
    actions ? () => loadDday(actions.calendar, eventId, today) : null,
  )
  if (!actions) return sample(today)
  return loaded ?? null
}

/** 디데이: 일정까지 남은 날(D-N), 오늘(D-DAY), 지난 날(D+N). S는 한 줄, M은 크게 + 다음 일정 2개. */
export function DdayBlock({ block }: { block: DdayBlockT }) {
  const { theme, now, actions, data, mode } = useBoard()
  const p = blockPalette(theme, block)
  const today = localDate(now.getTime())
  const eventId = block.props.eventId
  const d = useDday(eventId, actions, data.version ?? 0, today)
  const vars = { ...paletteVars(p), color: p.text }
  const big = block.size === 'M'

  let empty: string | null = null
  if (d && d.main === null)
    empty = eventId
      ? '지워진 일정이에요'
      : mode === 'edit'
        ? '다가오는 일정이 없어요'
        : '다가오는 일정이 없어요. 캘린더에 일정을 넣어 보세요'
  else if (d && d.main === undefined) empty = '일정을 불러오지 못했어요'

  const main = d?.main ?? null
  const dd = main ? ddayOf(main, today) : null

  return (
    <div className={`kdd kdd--${block.size}`} style={vars}>
      {big && <p className="kdd-head">{eventId ? '디데이' : '다가오는 일정'}</p>}
      {empty !== null ? (
        <p className="kb-empty kb-empty--center">{empty}</p>
      ) : (
        main &&
        dd && (
          <div className="kdd-main">
            <strong className={`kdd-num ${dd.diff === 0 ? 'is-today' : ''}`}>{dd.label}</strong>
            <div className="kdd-info">
              <span className="kdd-title">
                <span className="kdd-dot" style={{ background: main.color }} />
                {main.title}
              </span>
              <span className="kdd-date">
                {dd.ongoing ? '진행 중 · ' : ''}
                {ddayDateLabel(main)}
              </span>
            </div>
          </div>
        )
      )}
      {big && d && d.next.length > 0 && (
        <ul className="kdd-next" aria-label="다음 일정">
          {d.next.map((e) => (
            <li key={e.id}>
              <span className="kdd-next-num">{ddayOf(e, today).label}</span>
              <span className="kdd-dot" style={{ background: e.color }} />
              <span className="kdd-next-title">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
