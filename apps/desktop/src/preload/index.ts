import { contextBridge, ipcRenderer } from 'electron'
import type { DataDomain, KkumiApi } from '../shared/api'
import { isChannel } from '../shared/channels'

/** main → renderer 이벤트 구독(허용된 이벤트만, 마지막 등록만 유효) */
function subscribe<T>(
  event: 'timer:changed' | 'timer:done' | 'app:open-settings',
  cb: (v: T) => void,
) {
  ipcRenderer.removeAllListeners(event)
  ipcRenderer.on(event, (_e, v: T) => cb(v))
}

// renderer에 노출하는 최소 API. ipcRenderer 자체는 노출하지 않고, 허용 목록에 있는 채널만 invoke한다.
const api: KkumiApi = {
  platform: process.platform,
  invoke: ((channel: unknown, input?: unknown) => {
    if (!isChannel(channel))
      return Promise.resolve({ ok: false, error: { code: 'unknown_channel' } })
    return ipcRenderer.invoke(channel, input)
  }) as KkumiApi['invoke'],
  onBeforeSync: (cb) => {
    ipcRenderer.removeAllListeners('app:before-sync')
    ipcRenderer.on('app:before-sync', (_e, id: unknown) => {
      if (typeof id !== 'string') return
      void Promise.resolve()
        .then(cb)
        .then(
          (ok) => ipcRenderer.send('app:sync-ready', id, ok === true),
          () => ipcRenderer.send('app:sync-ready', id, false),
        )
    })
  },
  onBeforeClose: (cb) => {
    ipcRenderer.removeAllListeners('app:before-close')
    ipcRenderer.on('app:before-close', () => {
      void Promise.resolve()
        .then(cb)
        .catch(() => {})
        .finally(() => ipcRenderer.send('app:close-ready'))
    })
  },
  onTimerChanged: (cb) => subscribe('timer:changed', cb),
  onTimerDone: (cb) => subscribe('timer:done', cb),
  onDataChanged: (cb) => {
    // 투두/메모/시간표 훅이 각각 구독하므로 removeAllListeners를 쓰지 않고 해제 함수를 돌려준다
    const fn = (_e: unknown, d: DataDomain) => cb(d)
    ipcRenderer.on('data:changed', fn)
    return () => void ipcRenderer.removeListener('data:changed', fn)
  },
  onOpenSettings: (cb) => subscribe('app:open-settings', cb),
}

contextBridge.exposeInMainWorld('kkumi', api)
