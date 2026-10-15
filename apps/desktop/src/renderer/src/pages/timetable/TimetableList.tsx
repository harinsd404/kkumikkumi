import { TIMETABLE_MAX_COUNT, type Timetable, type TimetableEntry } from '@kkumikkumi/schema'
import { useState } from 'react'
import { uniqueName } from '../../board/timetable'
import type { TimetableStore } from '../../app/useTimetable'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { InlineRename } from '../../ui/InlineRename'
import { NEW_NAME } from './common'

/** 시간표 목록: 고르기, 이름 바꾸기(두 번 누르기 또는 버튼), 복제, 삭제(한 번 더 눌러 확인), 새로 만들기 */
export function TimetableList({
  store,
  timetables,
  entries,
  activeId,
  onSelect,
  onClose,
}: {
  store: TimetableStore
  timetables: readonly Timetable[]
  entries: readonly TimetableEntry[]
  activeId: string
  onSelect(id: string): void
  onClose(): void
}) {
  // 'active' = 방금 만든(고른 상태가 된) 시간표 이름을 바로 고친다
  const [renaming, setRenaming] = useState<string | null>(null)
  const names = timetables.map((x) => x.name)
  const full = timetables.length >= TIMETABLE_MAX_COUNT
  const cur = timetables.find((x) => x.id === activeId)
  const renamingId = renaming === 'active' ? activeId : renaming
  const count = (id: string) => entries.filter((e) => e.timetableId === id).length

  const create = async (copy?: Timetable) => {
    const ok = await store.createTimetable(
      uniqueName(names, copy ? `${copy.name} 복사본` : NEW_NAME),
      copy?.id,
    )
    if (ok) setRenaming('active')
  }

  return (
    <div className="tt-tlist">
      <h2 className="pg-chip">시간표 목록</h2>
      <ul className="pg-lists">
        {timetables.map((x) => (
          <li key={x.id}>
            {renamingId === x.id ? (
              <InlineRename
                className="pg-input tt-rename"
                selectOnFocus
                name={x.name}
                label="시간표 이름"
                maxLength={30}
                onRename={(v) => void store.updateTimetable(x.id, { name: v })}
                onClose={() => setRenaming(null)}
              />
            ) : (
              <button
                type="button"
                className="pg-list-btn"
                aria-current={x.id === activeId}
                onClick={() => onSelect(x.id)}
                onDoubleClick={() => setRenaming(x.id)}
              >
                <span className="pg-list-name">{x.name}</span>
                <span className="pg-count">
                  {x.settings.mode === 'period' ? '교시' : '시간'} · {count(x.id)}칸
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="pg-quick">
        <button type="button" className="pg-pill" disabled={full} onClick={() => void create()}>
          + 새 시간표
        </button>
        {cur && (
          <button
            type="button"
            className="pg-pill"
            disabled={full}
            onClick={() => void create(cur)}
          >
            복제
          </button>
        )}
      </div>
      {full && <p className="pg-empty">시간표는 {TIMETABLE_MAX_COUNT}개까지 만들 수 있어요</p>}
      {cur && (
        <div className="pg-detail-actions">
          <button type="button" className="pg-pill" onClick={() => setRenaming(cur.id)}>
            이름 바꾸기
          </button>
          <ConfirmButton
            key={cur.id}
            label="삭제"
            confirmLabel={count(cur.id) > 0 ? `${count(cur.id)}칸까지 지울까요?` : '정말 삭제'}
            onConfirm={() => store.removeTimetable(cur.id)}
          />
          <span className="pg-spacer" />
          <button type="button" className="pg-pill" onClick={onClose}>
            닫기
          </button>
        </div>
      )}
    </div>
  )
}
