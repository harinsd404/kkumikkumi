import type { Db } from '../connection'
import { CalendarRepo } from './calendar'
import { SettingsRepo } from './settings'
import { ThemeRuleRepo } from './themeRules'
import { TimerRepo } from './timer'
import { TodoRepo } from './todo'

export interface Repos {
  todo: TodoRepo
  calendar: CalendarRepo
  timer: TimerRepo
  themeRules: ThemeRuleRepo
  settings: SettingsRepo
}

export const createRepos = (db: Db): Repos => ({
  todo: new TodoRepo(db),
  calendar: new CalendarRepo(db),
  timer: new TimerRepo(db),
  themeRules: new ThemeRuleRepo(db),
  settings: new SettingsRepo(db),
})

export { NotFoundError } from './rows'
export type { CalendarRange } from './calendar'
