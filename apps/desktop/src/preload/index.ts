import { contextBridge, ipcRenderer } from 'electron'
import type { KkumiApi } from '../shared/api'
import { isChannel } from '../shared/channels'

// renderer에 노출하는 최소 API. ipcRenderer 자체는 노출하지 않고, 허용 목록에 있는 채널만 invoke한다.
const api: KkumiApi = {
  platform: process.platform,
  invoke: ((channel: unknown, input?: unknown) => {
    if (!isChannel(channel))
      return Promise.resolve({ ok: false, error: { code: 'unknown_channel' } })
    return ipcRenderer.invoke(channel, input)
  }) as KkumiApi['invoke'],
}

contextBridge.exposeInMainWorld('kkumi', api)
