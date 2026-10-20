import { appHandlers } from './handlers/app'
import { assetHandlers } from './handlers/assets'
import { calendarHandlers } from './handlers/calendar'
import { colorComboHandlers } from './handlers/colorCombos'
import { diaryHandlers } from './handlers/diary'
import type { HandlerDeps, Handlers } from './handlers/deps'
import { mcpHandlers } from './handlers/mcp'
import { memoHandlers } from './handlers/memos'
import { settingsHandlers } from './handlers/settings'
import { sprintHandlers } from './handlers/sprints'
import { themeRuleHandlers } from './handlers/themeRules'
import { themeHandlers } from './handlers/themes'
import { timerHandlers } from './handlers/timer'
import { timetableHandlers } from './handlers/timetable'
import { todoHandlers } from './handlers/todo'

export type { HandlerDeps, Handlers } from './handlers/deps'

/** 모든 핸들러는 입력을 zod로 재검증한다(입력 스키마는 각 handlers/<영역>.ts). renderer 타입은 신뢰하지 않는다. */
export function createHandlers(d: HandlerDeps): Handlers {
  return {
    ...themeHandlers(d),
    ...assetHandlers(d),
    ...settingsHandlers(d),
    ...todoHandlers(d),
    ...sprintHandlers(d),
    ...calendarHandlers(d),
    ...timerHandlers(d),
    ...memoHandlers(d),
    ...timetableHandlers(d),
    ...themeRuleHandlers(d),
    ...colorComboHandlers(d),
    ...diaryHandlers(d),
    ...mcpHandlers(d),
    ...appHandlers(d),
  }
}
