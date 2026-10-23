import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { boardWindow } from '../window/boardWindow'
import { isTrustedFrame } from '../security'
import { SyncError } from './service'

/** Flush the editor's debounced input before reading/replacing local rows. */
export async function flushSyncRenderer(): Promise<void> {
  const win = boardWindow()
  if (!win || win.isDestroyed()) return
  const requestId = randomUUID()
  await new Promise<void>((resolve, reject) => {
    const finish = (ok: boolean) => {
      clearTimeout(timeout)
      ipcMain.removeListener('app:sync-ready', ready)
      if (ok) resolve()
      else reject(new SyncError('sync_unsaved'))
    }
    const ready = (event: Electron.IpcMainEvent, id: unknown, ok: unknown) => {
      if (event.sender === win.webContents && isTrustedFrame(event.senderFrame) && id === requestId)
        finish(ok === true)
    }
    const timeout = setTimeout(() => finish(false), 3000)
    ipcMain.on('app:sync-ready', ready)
    win.webContents.send('app:before-sync', requestId)
  })
}
