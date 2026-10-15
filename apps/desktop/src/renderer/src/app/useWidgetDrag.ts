import { blockCells, blockRect, CANVAS, canPlace } from '@kkumikkumi/schema'
import { useCallback, useRef, useState } from 'react'
import { usePointerTrack } from '../board/pointerTrack'
import type { ToCanvas } from '../editor/EditorOverlay'
import { dropCell } from '../editor/state/geometry'
import type { EditorApi } from '../editor/useEditor'
import type { WidgetKind } from '../editor/WidgetGallery'

/** 갤러리에서 끌어 오는 중인 위젯(커서 위치, 놓일 자리) */
export type IncomingWidget = {
  kind: WidgetKind
  client: { x: number; y: number }
  target: { rect: { col: number; row: number; w: number; h: number }; valid: boolean } | null
}

/** 갤러리 위젯 끌어 놓기. toCanvasRef는 편집 오버레이가 채운다(화면 좌표 → 캔버스 좌표). */
export function useWidgetDrag(
  ed: EditorApi,
  addBlock: (kind: WidgetKind, at?: { col: number; row: number }) => void,
) {
  const [incoming, setIncoming] = useState<IncomingWidget | null>(null)
  const toCanvasRef = useRef<ToCanvas | null>(null)
  const track = usePointerTrack()

  /** 갤러리 위젯: 그냥 떼면 빈 자리에, 끌어서 보드에 놓으면 그 칸에(겹치면 거부) */
  const pickWidget = useCallback(
    (kind: WidgetKind, start: { clientX: number; clientY: number } | null) => {
      const cells = blockCells(kind.type, kind.size)
      if (!start || !cells) return addBlock(kind)
      const items = ed.theme.blocks.flatMap((b) => {
        const r = blockRect(b)
        return r ? [{ id: b.id, ...r }] : []
      })
      const targetAt = (e: PointerEvent) => {
        const p = toCanvasRef.current?.(e)
        const cell = p ? dropCell(p, cells.w, cells.h) : null
        if (!cell) return null
        const rect = { ...cell, ...cells }
        return { rect, valid: canPlace(CANVAS, items, rect) }
      }
      let moved = false
      const onMove = (e: PointerEvent) => {
        if (!moved && Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < 4) return
        moved = true
        setIncoming({ kind, client: { x: e.clientX, y: e.clientY }, target: targetAt(e) })
      }
      const onUp = (e: PointerEvent) => {
        setIncoming(null)
        if (e.type === 'pointercancel') return
        if (!moved) return addBlock(kind)
        const target = targetAt(e)
        if (!target) return // 보드 밖에 놓으면 취소
        if (!target.valid) return ed.showNotice('다른 블록과 겹쳐서 놓을 수 없어요')
        addBlock(kind, { col: target.rect.col, row: target.rect.row })
      }
      track(onMove, onUp)
    },
    [ed, addBlock, track],
  )

  return { incoming, pickWidget, toCanvasRef }
}
