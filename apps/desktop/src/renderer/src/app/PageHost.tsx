import type { Theme } from '@kkumikkumi/schema'
import { themeTones } from '../board/timetable'
import { MemoPage } from '../pages/MemoPage'
import { SettingsPage } from '../pages/SettingsPage'
import { TimerPage } from '../pages/TimerPage'
import { TimetablePage } from '../pages/TimetablePage'
import { TodoPage } from '../pages/TodoPage'
import { HabitPage } from '../pages/HabitPage'
import type { HabitStore } from './useHabits'
import { themeVars } from './themeVars'
import type { SettingsSection } from '../../../shared/api'
import type { AppPage, ThemeMenu } from './TitleBar'
import type { BoardData } from '../board/BoardContext'
import type { MemoStore } from './useMemos'
import type { TimetableStore } from './useTimetable'
import type { UserData } from './useUserData'

interface Props {
  page: AppPage
  theme: Theme
  user: UserData
  memos: MemoStore
  /** 메모 블록에서 들어오면 그 메모를 연다 */
  memoOpen: string | null
  timetable: TimetableStore
  habits: HabitStore
  now: Date
  /** 할 일 화면에서 달력을 크게 보는 중 */
  todoBig: boolean
  onTodoBig(big: boolean): void
  themeMenu: ThemeMenu | undefined
  /** 보드와 같은 데이터(설정 페이지 테마 미리보기) */
  boardData: BoardData
  /** 설정 페이지에서 바로 보여 줄 구역(앱 메뉴 "AI 연결…") */
  settingsSection: SettingsSection | null
  showNotice(text: string): void
}

/** 보드 창 안 세부 페이지(보드면 아무것도 그리지 않는다). 테마 팔레트·글꼴을 쓴다. */
export function PageHost(props: Props) {
  const content = pageContent(props)
  if (!content) return null
  // 페이지마다 따로 만든다(페이지를 바꾸면 감싸는 칸도 새로)
  return (
    <div key={props.page} className="app-page" style={themeVars(props.theme)}>
      {content}
    </div>
  )
}

function pageContent({
  page,
  theme,
  user,
  memos,
  memoOpen,
  timetable,
  habits,
  now,
  todoBig,
  onTodoBig,
  themeMenu,
  boardData,
  settingsSection,
  showNotice,
}: Props) {
  switch (page) {
    case 'board':
      return null
    case 'settings':
      return (
        <SettingsPage
          themeMenu={themeMenu}
          theme={theme}
          data={boardData}
          now={now}
          pomodoro={user.data.pomodoro}
          updatePomodoro={user.timer.updatePomodoro}
          section={settingsSection}
          showNotice={showNotice}
        />
      )
    case 'todo':
      return (
        <TodoPage
          todos={user.data.todos}
          actions={user.actions}
          lists={user.lists}
          sprintApi={user.sprints}
          palette={theme.defaults.palette}
          now={now}
          version={user.data.version ?? 0}
          weekStartsOn={weekStartsOf(theme)}
          updateEvent={user.events.update}
          big={todoBig}
          onBig={onTodoBig}
        />
      )
    case 'habits':
      return <HabitPage store={habits} now={now} />
    case 'timer':
      return (
        <TimerPage
          timer={user.data.timer}
          pomodoro={user.data.pomodoro}
          command={user.actions.timer.command}
          sessions={user.timer.sessions}
          updatePomodoro={user.timer.updatePomodoro}
          now={now}
          weekStartsOn={weekStartsOf(theme)}
          openMini={() => void window.kkumi.invoke('miniTimer.open')}
        />
      )
    case 'memo':
      return <MemoPage store={memos} initialId={memoOpen} now={now} />
    case 'timetable':
      return (
        <TimetablePage store={timetable} now={now} tones={themeTones(theme.defaults.palette)} />
      )
  }
}

/** 페이지의 주 시작 요일: 보드의 첫 캘린더 블록 설정을 따른다(없으면 일요일) */
function weekStartsOf(t: Theme): 0 | 1 {
  for (const b of t.blocks) if (b.type === 'calendar') return b.props.weekStartsOn
  return 0
}
