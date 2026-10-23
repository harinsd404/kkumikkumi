import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { boardWindow } from '../window/boardWindow'
import { isTrustedFrame } from '../security'
import { SyncError } from './service'

/** Flush the editor's debounced input before reading/replacing local rows. */
export async function flushSyncRenderer(lock = false): Promise<void> {
  const win = boardWindow()
  if (!win || win.isDestroyed()) return
  const requestId = randomUUID()
  await new Promise<void>((resolve, reject) => {
    const finish = (error: string | null) => {
      clearTimeout(timeout)
      ipcMain.removeListener('app:sync-ready', ready)
      if (error) reject(new SyncError(error))
      else resolve()
    }
    const ready = (event: Electron.IpcMainEvent, id: unknown, readiness: unknown) => {
      if (event.sender === win.webContents && isTrustedFrame(event.senderFrame) && id === requestId)
        finish(
          readiness === 'ready'
            ? null
            : readiness === 'editing'
              ? 'sync_editing'
              : readiness === 'save_failed'
                ? 'sync_unsaved'
                : 'sync_protocol',
        )
    }
    const timeout = setTimeout(() => finish('sync_renderer_wait'), 10000)
    ipcMain.on('app:sync-ready', ready)
    win.webContents.send('app:before-sync', requestId, lock)
  })
}
