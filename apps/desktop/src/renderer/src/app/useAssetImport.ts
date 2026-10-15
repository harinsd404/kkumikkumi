import { blockRect, type Asset, type Theme } from '@kkumikkumi/schema'
import { useCallback } from 'react'
import type { ImportedAsset } from '../../../shared/api'
import { blockBox } from '../board/layout'
import type { Point } from '../editor/state/geometry'
import type { EditorApi } from '../editor/useEditor'

const ASSET_ERRORS: Record<string, string> = {
  unsupported_format: 'PNG, JPG, WebP 이미지만 넣을 수 있어요',
  too_large_input: '파일이 너무 커요 (25MB까지)',
  too_many_pixels: '해상도가 너무 커요',
  decode_failed: '이미지를 읽을 수 없어요',
  too_large_output: '이미지가 너무 커서 줄여도 5MB를 넘어요',
  invalid_input: '파일이 너무 커요',
}

/** 이미지 가져오기(파일 고르기, 끌어 놓기). 가져온 에셋은 테마에 바로 추가한다. */
export function useAssetImport(
  ed: EditorApi,
  themeId: string,
  addDecor: (kind: 'image' | 'sticker', asset: Asset, at?: Point) => void,
) {
  const importAsset = useCallback(
    async (src: { dialog: true } | { bytes: Uint8Array }): Promise<ImportedAsset | null> => {
      const r =
        'dialog' in src
          ? await window.kkumi.invoke('assets.importFromDialog', {
              themeId,
              purpose: 'image',
            })
          : await window.kkumi.invoke('assets.importBytes', {
              themeId,
              purpose: 'image',
              bytes: src.bytes,
            })
      if (!r.ok) {
        ed.showNotice(ASSET_ERRORS[r.error.code] ?? `가져오지 못했어요 (${r.error.code})`)
        return null
      }
      if (!r.value) return null // 취소
      ed.dispatch({ type: 'asset/add', asset: r.value.asset })
      return r.value
    },
    [ed, themeId],
  )

  /** 보드에 파일을 끌어 놓았을 때 */
  const onDropFile = async (file: File, at: Point) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const r = await importAsset({ bytes })
    if (!r) return
    // 이미지 블록 위에 놓으면 그 블록의 이미지로(블록마다 따로)
    const target = imageBlockAt(ed.theme, at)
    if (target) {
      ed.dispatch({
        type: 'block/props',
        id: target.id,
        patch: { assetHash: r.asset.hash },
      })
      ed.select({ kind: 'block', id: target.id })
      return
    }
    // 투명 영역이 있으면 스티커(잘리지 않게), 아니면 이미지
    addDecor(r.hasTransparency ? 'sticker' : 'image', r.asset, at)
  }

  return { importAsset, onDropFile }
}

/** 캔버스 좌표 아래의 이미지 블록(없으면 null) */
function imageBlockAt(t: Theme, at: Point) {
  for (const b of t.blocks) {
    const r = b.type === 'image' ? blockRect(b) : null
    if (!r) continue
    const box = blockBox(r)
    if (
      at.x >= box.left &&
      at.x <= box.left + box.width &&
      at.y >= box.top &&
      at.y <= box.top + box.height
    )
      return b
  }
  return null
}
