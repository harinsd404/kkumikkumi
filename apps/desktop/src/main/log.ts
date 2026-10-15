import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

// 오류 기록(로그 폴더/main.log). 사용자 데이터(할 일 제목, 일정, 이미지 경로, 입력값)는 넣지 않는다:
// 부르는 쪽은 고정된 태그와 오류 종류(이름/코드)만 넘긴다. 개발 중에는 콘솔에도 찍는다.

const MAX_BYTES = 512 * 1024
let file: string | null = null

/** 로그 폴더를 정한다(앱 시작 시 한 번). 정하지 않으면 콘솔에만 찍는다. */
export function initLog(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
    file = join(dir, 'main.log')
  } catch {
    file = null
  }
}

/** 오류 객체에서 남길 것은 종류뿐(메시지에는 경로·입력값이 들어 있을 수 있다) */
export const errorKind = (err: unknown): string => (err instanceof Error ? err.name : typeof err)

export function logError(tag: string, detail = ''): void {
  const line = `${new Date().toISOString()} ${tag}${detail ? ` ${detail}` : ''}`
  console.error(line)
  if (!file) return
  try {
    // 너무 커지면 하나만 남기고 새로 시작한다
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES)
      renameSync(file, `${file}.old`)
    appendFileSync(file, `${line}\n`)
  } catch {
    // 로그를 못 써도 앱은 계속 돈다
  }
}
