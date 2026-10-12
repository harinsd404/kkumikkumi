import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcResult } from '../../shared/api'
import { CHANNELS } from '../../shared/channels'
import { isAppUrl } from '../security'
import { toErrorCode } from './errors'
import type { Handlers } from './handlers'

/** 우리 앱 페이지(메인 프레임)에서 온 호출만 처리한다. */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  return frame !== null && frame.parent === null && isAppUrl(frame.url)
}

export function registerIpc(handlers: Handlers): void {
  for (const channel of CHANNELS) {
    ipcMain.handle(channel, async (event, input: unknown): Promise<IpcResult<unknown>> => {
      if (!isTrustedSender(event)) return { ok: false, error: { code: 'forbidden' } }
      try {
        return { ok: true, value: await handlers[channel](input) }
      } catch (err) {
        const code = toErrorCode(err)
        // 로그에는 채널과 코드만 남긴다(입력값/메시지에 사용자 데이터가 있을 수 있음).
        if (code === 'internal')
          console.error(`[ipc] ${channel} internal ${err instanceof Error ? err.name : typeof err}`)
        return { ok: false, error: { code } }
      }
    })
  }
}

export function unregisterIpc(): void {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
}
