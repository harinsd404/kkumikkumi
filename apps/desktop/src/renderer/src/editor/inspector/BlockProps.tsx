import type { GridBlock, Sprint } from '@kkumikkumi/schema'
import { sortSprints, sprintBadge } from '../../board/sprint'
import { localDate } from '../../board/calendar'
import { useMinuteClock } from '../../board/useMinuteClock'
import { Row, Section, Segmented } from '../fields'
import type { EditorApi } from '../useEditor'
import { ImageContentFields } from './decor'
import { groupOf } from './group'
import { ClockFields, ProgressFields } from './widgetFields'
import {
  DdayFields,
  MemoFields,
  PresetFields,
  TimetableFields,
  TodoListFields,
  type EventPickApi,
  type MemoPickApi,
  type TimetablePick,
  type TodoListsApi,
} from './pickers'

/** 블록 종류별 설정에 쓰는 통로 */
export interface BlockDataApis {
  /** 파일 선택 → 테마 에셋. 실패/취소면 null */
  pickImage(purpose: 'image'): Promise<{ hash: string } | null>
  /** 투두 목록 관리(사용자 데이터). 없으면 목록 선택을 숨긴다. */
  todoLists?: TodoListsApi | undefined
  /** 메모 고르기/새로 만들기(사용자 데이터). 없으면 메모 선택을 숨긴다. */
  memos?: MemoPickApi | undefined
  /** 시간표 목록(사용자 데이터). 없으면 시간표 선택을 숨긴다. */
  timetables?: TimetablePick | undefined
  /** 일정 조회(디데이 블록에서 일정 고르기). 없으면 일정 선택을 숨긴다. */
  events?: EventPickApi | undefined
  /** 스프린트 목록(스프린트 블록에서 고르기). 없으면 자동만 */
  sprints?: readonly Sprint[] | undefined
}

/** 블록 종류별 설정(props) */
export function BlockProps({
  ed,
  block,
  apis: { pickImage, todoLists, memos, timetables, events, sprints },
}: {
  ed: EditorApi
  block: GridBlock
  apis: BlockDataApis
}) {
  const set = (patch: Record<string, unknown>, key?: string) =>
    ed.dispatch({ type: 'block/props', id: block.id, patch }, groupOf(block.id, key))
  switch (block.type) {
    case 'calendar':
      return (
        <Section title="캘린더">
          <Segmented
            label="주 시작"
            value={block.props.weekStartsOn}
            options={[
              { value: 0, label: '일요일' },
              { value: 1, label: '월요일' },
            ]}
            onChange={(weekStartsOn) => set({ weekStartsOn })}
          />
          {block.size === 'L' && (
            <Segmented
              label="보기"
              value={block.props.view}
              options={[
                { value: 'month', label: '월' },
                { value: 'week', label: '주' },
              ]}
              onChange={(view) => set({ view })}
            />
          )}
        </Section>
      )
    case 'todo':
      return (
        <Section title="투두">
          {todoLists && (
            <TodoListFields
              lists={todoLists}
              listId={block.props.listId}
              onSelect={(listId) => set({ listId })}
            />
          )}
          <Row label="완료한 일 보기">
            <input
              type="checkbox"
              checked={block.props.showCompleted}
              onChange={(e) => set({ showCompleted: e.target.checked })}
            />
          </Row>
        </Section>
      )
    case 'timer':
      return (
        <Section title="타이머">
          <Segmented
            label="표시"
            value={block.props.display}
            options={[
              { value: 'digital', label: '숫자' },
              { value: 'ring', label: '링' },
            ]}
            onChange={(display) => set({ display })}
          />
          <PresetFields
            presets={block.props.presetsMin}
            onChange={(presetsMin) => set({ presetsMin })}
          />
        </Section>
      )
    case 'memo':
      return (
        <Section title="메모">
          {memos ? (
            <MemoFields
              api={memos}
              memoId={block.props.memoId}
              onSelect={(memoId) => set({ memoId })}
            />
          ) : (
            <p className="ki-note">메모를 불러오지 못했어요</p>
          )}
        </Section>
      )
    case 'timetable':
      return (
        <Section title="시간표">
          {timetables && (
            <TimetableFields
              pick={timetables}
              timetableId={block.props.timetableId}
              onSelect={(timetableId) => set({ timetableId })}
            />
          )}
          <p className="ki-note">
            과목과 교시 시각은 시간표 페이지에서 고쳐요. S·M은 오늘 수업, L은 한 주를 보여 줘요.
            따라가는 블록은 사용 모드에서 이름을 눌러 고른 시간표를 바꿀 수 있어요.
          </p>
        </Section>
      )
    case 'dday':
      return (
        <Section title="디데이">
          {events ? (
            <DdayFields
              api={events}
              eventId={block.props.eventId}
              onSelect={(eventId) => set({ eventId })}
            />
          ) : (
            <p className="ki-note">일정을 불러오지 못했어요</p>
          )}
          <p className="ki-note">
            자동은 오늘 이후 가장 가까운 일정을 보여 주고, 지나면 다음 일정으로 넘어가요. 고정한
            일정은 지난 뒤에도 D+로 계속 세요. 일정은 캘린더에서 만들어요.
          </p>
        </Section>
      )
    case 'sprint':
      return (
        <Section title="스프린트">
          <SprintPickFields
            sprints={sprints ?? []}
            sprintId={block.props.sprintId}
            onSelect={(sprintId) => set({ sprintId })}
          />
        </Section>
      )
    case 'studyStats':
      return (
        <Section title="공부 통계">
          <p className="ki-note">
            타이머의 집중 기록으로 오늘·이번 주 집중 시간과 연속 공부한 날을 보여 줘요. 누르면
            타이머 화면이 열려요.
          </p>
        </Section>
      )
    case 'progress':
      return (
        <Section title="진행률">
          <ProgressFields
            props={block.props}
            small={block.size === 'S'}
            onChange={(patch, key) => set(patch, key)}
          />
        </Section>
      )
    case 'clock':
      return (
        <Section title="시계">
          <ClockFields props={block.props} onChange={(patch) => set(patch)} />
        </Section>
      )
    case 'image':
      return (
        <Section title="이미지">
          <div className="ki-buttons">
            <button
              type="button"
              className={block.props.assetHash ? undefined : 'ki-primary'}
              onClick={async () => {
                const a = await pickImage('image')
                if (!a) return
                // 새 사진은 가운데에서 시작하고 바로 끌어서 위치를 잡게 한다
                set({ assetHash: a.hash, focus: { ...block.props.focus, x: 0.5, y: 0.5 } })
                ed.adjust({ kind: 'block', id: block.id })
              }}
            >
              {block.props.assetHash ? '이미지 바꾸기' : '+ 이미지 고르기'}
            </button>
            {block.props.assetHash && (
              <button type="button" onClick={() => set({ assetHash: null })}>
                비우기
              </button>
            )}
          </div>
          <ImageContentFields
            content={block.props}
            apply={(patch, key) => set(patch, key)}
            onAdjust={() => ed.adjust({ kind: 'block', id: block.id })}
          />
        </Section>
      )
  }
}

/** 스프린트 블록: 자동(진행 중 먼저 끝나는 것) 또는 특정 스프린트 */
function SprintPickFields({
  sprints,
  sprintId: id,
  onSelect,
}: {
  sprints: readonly Sprint[]
  sprintId: string | null
  onSelect(id: string | null): void
}) {
  const today = localDate(useMinuteClock().getTime())
  const list = sortSprints(sprints, today)
  const missing = id !== null && !list.some((s) => s.id === id)
  return (
    <>
      <Row label="보여 줄 스프린트">
        <select
          className="ki-select"
          value={missing ? '' : (id ?? '')}
          onChange={(e) => onSelect(e.target.value || null)}
        >
          <option value="">진행 중 · 먼저 끝나는 것 (자동)</option>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.name} · ${sprintBadge(s, today)}`}
            </option>
          ))}
        </select>
      </Row>
      {missing && <p className="ki-note">고정했던 스프린트가 지워졌어요.</p>}
      <p className="ki-note">스프린트는 할 일 화면의 "스프린트" 탭에서 만들어요.</p>
    </>
  )
}
