import type { GridBlock, TodoItem } from '@kkumikkumi/schema'
import checkUrl from '../icons/check.svg'
import plusUrl from '../icons/plus.svg'
import { useBoard } from '../BoardContext'

type TodoBlockT = Extract<GridBlock, { type: 'todo' }>

/** 시안(Figma 15:2832)의 투두 카드. 읽기 전용(체크/추가는 M4). 섹션 분류(오늘/내일/보관함)도 M4. */
export function TodoBlock({ block }: { block: TodoBlockT }) {
  const { theme, data } = useBoard()
  const p = theme.defaults.palette
  const todo = data.todo
  const items: readonly TodoItem[] = (todo?.items ?? []).filter(
    (i) => block.props.showCompleted || !i.done,
  )

  return (
    <div className="kt">
      <section className="kt-section">
        <div className="kt-chip">
          <span style={{ color: p.subText }}>{todo?.list.name ?? '할 일'}</span>
          <img className="kt-plus" src={plusUrl} alt="" draggable={false} />
        </div>
        {items.length === 0 ? (
          <p className="kt-empty" style={{ color: p.subText }}>
            할 일이 없어요
          </p>
        ) : (
          <ul className="kt-list">
            {items.map((i) => (
              <li key={i.id} className="kt-item">
                <span
                  className={`kt-check ${i.done ? 'is-done' : ''}`}
                  style={i.done ? { background: p.check } : undefined}
                >
                  {i.done && <img src={checkUrl} alt="" draggable={false} />}
                </span>
                <span className="kt-title">{i.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
