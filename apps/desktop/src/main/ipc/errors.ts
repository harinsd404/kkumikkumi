import { ZodError } from 'zod'
import { AssetError } from '../assets/pipeline'
import { FutureDbVersionError } from '../db/migrate'
import { NotFoundError } from '../db/repos'
import { ThemeStoreError } from '../themes/themeStore'

/**
 * 예외 → renderer에 보낼 오류 코드. 메시지/스택/입력값은 보내지 않는다(사용자 데이터 노출 방지).
 */
export function toErrorCode(err: unknown): string {
  if (err instanceof ZodError) return 'invalid_input'
  if (err instanceof ThemeStoreError) return err.code
  if (err instanceof AssetError) return err.code
  if (err instanceof NotFoundError) return 'not_found'
  if (err instanceof FutureDbVersionError) return 'future_db_version'
  return 'internal'
}
