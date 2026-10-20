import type { GridBlock, Sprint, TodoItem } from '@kkumikkumi/schema'
import checkUrl from '../icons/check.svg'
import { useBoard } from '../BoardContext'
import { addDays, localDate, monthDay } from '../calendar'
import { autoSprint, sprintBadge, sprintItems, sprintProgress } from '../sprint'
import { paletteVars } from '../style'

type SprintBlockT = Extract<GridBlock, { type: 'sprint' }>

/** 미리보기(데이터 없음)용 예시 스프린트 */
function sample(today: string): { sprint: Sprint; items: TodoItem[] } {
  const base = {
    listId: 'x',
    completedAt: null,
    dueDate: null,
    note: '',
    sprintId: 's',
    createdAt: 0,
    updatedAt: 0,
  }
  const titles = ['수학 오답 정리', '영단어 300개', '과학 요약 노트', '국어 기출 2회']
  return {
    sprint: {
      id: 's',
      name: '중간고사 대비',
      goal: '',
      startDate: addDays(today, -5),
      endDate: addDays(today, 9),
      color: '#d9a86c',
      createdAt: 0,
      updatedAt: 0,
    },
    items: titles.map((title, i) => ({ ...base, id: String(i), title, done: i === 3, order: i })),
  }
}

const range = (s: Sprint) => {
  const a = monthDay(s.startDate)
  const b = monthDay(s.endDate)
  return `${a.m}/${a.d} ~ ${b.m}/${b.d}`
}

/**
 * 스프린트: 이름, D-N, 진행률(끝낸 일/전체). M은 남은 할 일(체크 가능).
 * props.sprintId가 null이면 진행 중 중 먼저 끝나는 스프린트(없으면 가장 가까운 예정).
 */
export function SprintBlock({ block }: { block: SprintBlockT }) {
  const { theme, data, actions: all, mode, now } = useBoard()
  const actions = mode === 'use' ? all : undefined
  const p = theme.defaults.palette
  const today = localDate(now.getTime())
  const todos = data.todos
  const sprints = todos?.sprints ?? []
  const pinned = block.props.sprintId
  let sprint: Sprint | null
  let items: TodoItem[]
  // 예시는 위젯 갤러리(동작 없음)에서만. 실제 보드는 읽기 전이면 비워 둔다
  if (!todos) {
    if (all) return <div className={`ksp ksp--${block.size}`} style={{ color: p.text }} />
    ;({ sprint, items } = sample(today))
  } else {
    sprint = pinned ? (sprints.find((s) => s.id === pinned) ?? null) : autoSprint(sprints, today)
    items = sprint ? sprintItems(todos.items, sprint.id) : []
  }
  const big = block.size === 'M'
  const vars = { ...paletteVars(p), color: p.text }

  if (!sprint)
    return (
      <div className={`ksp ksp--${block.size}`} style={vars}>
        <p className="kb-empty">{pinned ? '지워진 스프린트예요' : '진행 중인 스프린트가 없어요'}</p>
      </div>
    )

  const pr = sprintProgress(items)
  const remaining = items.filter((i) => !i.done)
  return (
    <div className={`ksp ksp--${block.size}`} style={vars}>
      <div className="ksp-top">
        <span className="ksp-dot" style={{ background: sprint.color }} />
        <strong className="ksp-name">{sprint.name}</strong>
        <span className="ksp-badge">{sprintBadge(sprint, today)}</span>
      </div>
      {big && <p className="ksp-range">{range(sprint)}</p>}
      <div className="ksp-progress">
        <span className="ksp-track">
          <span style={{ width: `${pr.ratio * 100}%`, background: sprint.color }} />
        </span>
        <span className="ksp-count">
          {pr.done}/{pr.total}
        </span>
      </div>
      {big && (
        <ul className="ksp-list">
          {remaining.length === 0 && pr.total > 0 && <li className="ksp-done-all">다 끝냈어요!</li>}
          {remaining.map((i) => (
            <li key={i.id} className="ksp-item" data-no-open>
              <button
                type="button"
                className="kt-check"
                role="checkbox"
                aria-checked={false}
                aria-label={i.title}
                disabled={!actions}
                onClick={() => void actions?.todo.update(i.id, { done: true })}
              >
                <img src={checkUrl} alt="" draggable={false} className="ksp-check-hint" />
              </button>
              <span className="ksp-title">{i.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
