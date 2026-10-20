import type { Db } from '../connection'
import { CalendarRepo } from './calendar'
import { MemoRepo } from './memos'
import { SettingsRepo } from './settings'
import { SprintRepo } from './sprints'
import { ThemeRuleRepo } from './themeRules'
import { TimerRepo } from './timer'
import { TimetableRepo } from './timetable'
import { TimerSessionRepo } from './timerSessions'
import { TodoRepo } from './todo'
import { WindowStateRepo } from './windowState'

export interface Repos {
  todo: TodoRepo
  sprints: SprintRepo
  calendar: CalendarRepo
  timer: TimerRepo
  timerSessions: TimerSessionRepo
  memos: MemoRepo
  timetable: TimetableRepo
  themeRules: ThemeRuleRepo
  settings: SettingsRepo
  windowState: WindowStateRepo
  miniWindowState: WindowStateRepo
}

export const createRepos = (db: Db): Repos => ({
  todo: new TodoRepo(db),
  sprints: new SprintRepo(db),
  calendar: new CalendarRepo(db),
  timer: new TimerRepo(db),
  timerSessions: new TimerSessionRepo(db),
  memos: new MemoRepo(db),
  timetable: new TimetableRepo(db),
  themeRules: new ThemeRuleRepo(db),
  settings: new SettingsRepo(db),
  windowState: new WindowStateRepo(db),
  miniWindowState: new WindowStateRepo(db, 'miniWindow'),
})

export { ConflictError, NotFoundError } from './rows'
export type { CalendarRange } from './calendar'
