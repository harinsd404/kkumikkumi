import { readFile, stat } from 'node:fs/promises'
import { BrowserWindow, dialog } from 'electron'
import type { AssetPurpose } from '../../shared/api'
import { devPickedFile } from '../devCapture'
import { AssetError, DEFAULT_PIPELINE_OPTIONS } from './pipeline'

/** 파일 선택 → 바이트. 경로는 main 안에서만 다루고 renderer로 보내지 않는다. */
export async function pickImageFile(purpose: AssetPurpose): Promise<Uint8Array | null> {
  const dev = devPickedFile()
  if (dev) return new Uint8Array(await readFile(dev))
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      purpose === 'pet'
        ? { name: 'PNG', extensions: ['png'] }
        : { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
    ],
  }
  const res = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  const path = res.canceled ? undefined : res.filePaths[0]
  if (!path) return null
  const st = await stat(path)
  // 확장자 필터는 편의일 뿐이다. 실제 형식은 파이프라인이 내용으로 판별한다.
  if (!st.isFile()) throw new AssetError('unsupported_format')
  if (st.size > DEFAULT_PIPELINE_OPTIONS.maxInputBytes) throw new AssetError('too_large_input') // 읽기 전에 거부
  return new Uint8Array(await readFile(path))
}
