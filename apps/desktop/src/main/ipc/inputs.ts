import { Name, TimerStateSchema, Uuid } from '@kkumikkumi/schema'
import { z } from 'zod'
import type { AssetPurpose } from '../../shared/api'
import type { TimerCommand } from '../../shared/timer'

// 여러 핸들러가 함께 쓰는 입력 스키마. renderer 타입(shared/)과 어긋나지 않게 컴파일 타임에 맞춰 본다.

/** 두 타입이 같을 때만 true를 넣을 수 있다 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

export const NoInput = z.undefined()
export const IdIn = z.strictObject({ id: Uuid })
export const IdNameIn = z.strictObject({ id: Uuid, name: Name })

export const Purpose = z.enum(['image', 'pet'])
export const _purposeMatches: Same<z.infer<typeof Purpose>, AssetPurpose> = true

export const TimerCommandSchema = z.discriminatedUnion('cmd', [
  z.strictObject({
    cmd: z.literal('start'),
    durationMs: TimerStateSchema.shape.durationMs,
    mode: TimerStateSchema.shape.mode,
  }),
  z.strictObject({ cmd: z.literal('pause') }),
  z.strictObject({ cmd: z.literal('resume') }),
  z.strictObject({ cmd: z.literal('reset') }),
  z.strictObject({ cmd: z.literal('pomodoro.start') }),
  z.strictObject({ cmd: z.literal('pomodoro.skip') }),
  z.strictObject({ cmd: z.literal('pomodoro.stop') }),
])
export const _timerCommandMatches: Same<z.infer<typeof TimerCommandSchema>, TimerCommand> = true

/** 현재 값에 patch를 덮어쓴 뒤 다시 검증한다. 빠진 키는 zod가 결과에 넣지 않으므로 현재 값이 남는다. */
export const mergePatch = <T extends object>(
  schema: z.ZodType<T>,
  cur: T,
  patch: object | undefined,
): T => schema.parse({ ...cur, ...patch })
