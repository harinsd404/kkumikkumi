import { EventEmitter } from 'node:events'
import type { TimerState } from '@kkumikkumi/schema'
import type { TimerDoneInfo } from '../shared/api'

// main 안의 이벤트 버스. 타이머/펫(M5)/테마 자동 전환(M6)이 서로를 직접 참조하지 않도록 한다.
export interface AppEvents {
  'timer:changed': [state: TimerState]
  /** 집중 모드(focus 모드로 실행 중) 여부가 바뀔 때만 */
  'focus:changed': [focusing: boolean]
  'timer:done': [info: TimerDoneInfo]
  /** 투두 완료(발행만, M5에서 펫이 구독할 수 있음) */
  'todo:completed': []
}

export const bus = new EventEmitter<AppEvents>()
