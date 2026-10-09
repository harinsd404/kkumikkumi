import { contextBridge } from 'electron'
import type { KkumiApi } from './api'

// renderer에 노출하는 최소 API. ipcRenderer 자체는 노출하지 않는다.
const api: KkumiApi = {
  platform: process.platform,
}

contextBridge.exposeInMainWorld('kkumi', api)
