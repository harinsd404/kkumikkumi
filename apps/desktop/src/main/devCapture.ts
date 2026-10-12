import { writeFile } from 'node:fs/promises'
import { app, type BrowserWindow } from 'electron'

/**
 * 개발용(패키징된 앱에서는 무시): 화면 확인을 자동화하기 위한 훅.
 * - KKUMI_DEV_USER_DATA: userData 폴더를 바꾼다(실제 사용자 데이터를 건드리지 않고 실행)
 * - KKUMI_DEV_CAPTURE: 첫 로드 후 페이지를 PNG로 저장하고 종료한다
 */
export function applyDevUserData(): void {
  const dir = process.env['KKUMI_DEV_USER_DATA']
  if (!app.isPackaged && dir) app.setPath('userData', dir)
}

export function maybeCaptureAndQuit(win: BrowserWindow): void {
  const out = process.env['KKUMI_DEV_CAPTURE']
  if (app.isPackaged || !out) return
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      void win.webContents
        .capturePage()
        .then((img) => writeFile(out, img.toPNG()))
        .finally(() => app.quit())
    }, 2500)
  })
}
