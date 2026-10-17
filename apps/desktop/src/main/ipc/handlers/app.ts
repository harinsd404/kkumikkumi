import { z } from 'zod'
import { NoInput } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

/** 설정 페이지 "정보": 앱 버전, 오류 기록/데이터 폴더 열기(정해진 두 폴더만, 경로는 main이 정한다) */
export function appHandlers(d: HandlerDeps): HandlersOf<'app'> {
  return {
    'app.info': async (i) => {
      NoInput.parse(i)
      return { version: d.app?.version ?? '0.0.0' }
    },
    'app.openFolder': async (i) => {
      const { folder } = z.strictObject({ folder: z.enum(['logs', 'userData']) }).parse(i)
      await d.app?.openFolder(folder)
      return null
    },
  }
}
