import { WindowStateSchema, type WindowState } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { kvSetting, type KvSetting } from './kv'

/** 창 크기/위치. settings 테이블의 별도 키에 JSON으로 저장. 손상되면 null(기본값 사용). */
export class WindowStateRepo {
  private readonly kv: KvSetting<WindowState>

  /** key: 'window'(보드 창) / 'miniWindow'(미니 타이머 창) */
  constructor(db: Db, key = 'window') {
    this.kv = kvSetting(db, key, WindowStateSchema)
  }

  get(): WindowState | null {
    return this.kv.readOr(null)
  }

  save(state: WindowState): void {
    this.kv.save(state)
  }
}
