import {
  blockRect,
  CANVAS,
  canPlace,
  rectsOverlap,
  type FreeItem,
  type GridBlock,
  type GridRect,
} from '@kkumikkumi/schema'
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { blockBox, freeLayers, gridItems, type Box } from '../board/layout'
import { usePointerTrack } from '../board/pointerTrack'
import {
  panFocus,
  resizeFromCorner,
  rotationFromPointer,
  snapToCell,
  toLocalDelta,
  type Corner,
  type Point,
} from './state/geometry'
import type { AdjustTarget, EditorApi } from './useEditor'

/** 화면 좌표 → 캔버스 좌표(갤러리에서 끌어 올 때 부모가 쓴다) */
export type ToCanvas = (client: { clientX: number; clientY: number }) => Point

interface Props {
  ed: EditorApi
  scale: number
  onDropFile(file: File, at: Point): void
  /** 갤러리에서 끌어 오는 중인 블록이 놓일 자리 */
  incoming?: { rect: GridRect; valid: boolean } | null | undefined
  /** 이 레이어의 좌표 변환을 부모에게 알려 준다 */
  toCanvasRef?: RefObject<ToCanvas | null> | undefined
}

const DRAG_THRESHOLD = 3
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

/** 화면 좌표 → 레이어(el) 안의 캔버스 좌표 */
function clientToCanvas(el: HTMLElement, scale: number, c: { clientX: number; clientY: number }) {
  const r = el.getBoundingClientRect()
  return { x: (c.clientX - r.left) / scale, y: (c.clientY - r.top) / scale }
}

/** 편집 모드 레이어: 그리드 안내선, 선택/드래그/핸들, 파일 드롭. 캔버스 좌표계 안에서 그려진다. */
export function EditorOverlay({ ed, scale, onDropFile, incoming, toCanvasRef }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const track = usePointerTrack()
  const [ghost, setGhost] = useState<{ rect: GridRect; from: Box; at: Box; valid: boolean } | null>(
    null,
  )
  const t = ed.theme
  const px = (n: number) => n / Math.max(scale, 0.01) // 화면 px → 캔버스 px (핸들 크기 고정용)

  const toCanvas: ToCanvas = (c) => clientToCanvas(root.current!, scale, c)

  useLayoutEffect(() => {
    if (!toCanvasRef) return
    toCanvasRef.current = (c) => clientToCanvas(root.current!, scale, c)
    return () => {
      toCanvasRef.current = null
    }
  }, [toCanvasRef, scale])

  const items = gridItems(t.blocks)

  /** 사진 위치 조정 대상: 칸(캔버스 px), 회전, 지금 이미지 설정, 원본 크기. 사진이 없으면 null */
  const panTarget = (s: AdjustTarget) => {
    if (!s) return null
    if (s.kind === 'blockBg') {
      // 블록 배경 사진: 늘 꽉 채우기, 확대 없음
      const b = t.blocks.find((x) => x.id === s.id)
      const r = b && blockRect(b)
      const bg = b && b.type !== 'image' ? b.style.bgImage : null
      if (!r || !bg) return null
      const asset = t.assets.find((a) => a.hash === bg.assetHash)
      const content = { focus: { ...bg.focus, zoom: 1 }, fit: 'cover' as const }
      return asset && { box: blockBox(r), rotation: 0, content, asset }
    }
    if (s.kind === 'block') {
      const b = t.blocks.find((x) => x.id === s.id)
      const r = b && blockRect(b)
      if (!b || b.type !== 'image' || !r || !b.props.assetHash) return null
      const box = blockBox(r)
      const asset = t.assets.find((a) => a.hash === b.props.assetHash)
      return asset && { box, rotation: 0, content: b.props, asset }
    }
    const f = t.freeItems.find((x) => x.id === s.id)
    if (!f || f.kind !== 'image' || f.locked) return null
    const asset = t.assets.find((a) => a.hash === f.content.assetHash)
    const box = { left: f.x, top: f.y, width: f.w, height: f.h }
    return asset && { box, rotation: f.rotation, content: f.content, asset }
  }
  const adjusting = ed.adjusting
  const pan = panTarget(adjusting)

  /** 다른 것을 누르면 사진 위치 조정을 끝낸다 */
  const endAdjust = (unless?: string) => {
    if (ed.adjusting && ed.adjusting.id !== unless) ed.adjust(null)
  }

  const startPan = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !adjusting || !pan) return
    e.stopPropagation()
    const start = toCanvas(e)
    const { box, rotation, content, asset } = pan
    const target = adjusting
    track(
      (ev) => {
        const p = toCanvas(ev)
        const d = toLocalDelta(p.x - start.x, p.y - start.y, rotation)
        const next = panFocus(
          content.focus,
          d,
          { w: box.width, h: box.height },
          { w: asset.width, h: asset.height },
          content.fit,
        )
        const focus = { ...content.focus, ...next }
        const opts = { groupKey: `pan:${target.id}`, continuous: true }
        if (target.kind === 'blockBg') {
          const b = t.blocks.find((x) => x.id === target.id)
          const bg = b?.style.bgImage
          if (bg)
            ed.dispatch(
              {
                type: 'block/style',
                id: target.id,
                patch: { bgImage: { ...bg, focus: { x: focus.x, y: focus.y } } },
              },
              opts,
            )
        } else if (target.kind === 'block')
          ed.dispatch({ type: 'block/props', id: target.id, patch: { focus } }, opts)
        else ed.dispatch({ type: 'free/content', id: target.id, patch: { focus } }, opts)
      },
      () => ed.endGesture(),
    )
  }

  const startBlockDrag = (b: GridBlock, box: Box) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    endAdjust(b.id)
    ed.select({ kind: 'block', id: b.id })
    const rect = blockRect(b)!
    const start = toCanvas(e)
    let moved = false
    let last: { col: number; row: number; valid: boolean } | null = null
    track(
      (ev) => {
        const p = toCanvas(ev)
        const dx = p.x - start.x
        const dy = p.y - start.y
        if (!moved && Math.hypot(dx * scale, dy * scale) < DRAG_THRESHOLD) return
        moved = true
        const cell = snapToCell(box.left + dx, box.top + dy, rect.w, rect.h)
        const cand = { ...cell, w: rect.w, h: rect.h }
        const valid = canPlace(CANVAS, items, cand, b.id)
        last = { ...cell, valid }
        setGhost({
          rect: cand,
          from: box,
          at: { ...box, left: box.left + dx, top: box.top + dy },
          valid,
        })
      },
      () => {
        setGhost(null)
        if (!moved || !last) return
        if (!last.valid) {
          ed.showNotice('놓을 수 없는 자리라 원래 위치로 돌아갔어요')
          return
        }
        if (last.col !== b.col || last.row !== b.row)
          ed.dispatch({ type: 'block/move', id: b.id, col: last.col, row: last.row })
      },
    )
  }

  const startFreeMove = (f: FreeItem) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    endAdjust(f.id)
    ed.select({ kind: 'free', id: f.id })
    if (f.locked) return
    const start = toCanvas(e)
    let moved = false
    track(
      (ev) => {
        const p = toCanvas(ev)
        if (!moved && Math.hypot((p.x - start.x) * scale, (p.y - start.y) * scale) < DRAG_THRESHOLD)
          return
        moved = true
        ed.dispatch(
          {
            type: 'free/update',
            id: f.id,
            patch: { x: f.x + p.x - start.x, y: f.y + p.y - start.y },
          },
          { groupKey: `move:${f.id}`, continuous: true },
        )
      },
      () => ed.endGesture(),
    )
  }

  const startResize = (f: FreeItem, corner: Corner) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    track(
      (ev) => {
        const nb = resizeFromCorner(f, corner, toCanvas(ev), ev.shiftKey)
        ed.dispatch(
          { type: 'free/update', id: f.id, patch: nb },
          { groupKey: `resize:${f.id}`, continuous: true },
        )
      },
      () => ed.endGesture(),
    )
  }

  const startRotate = (f: FreeItem) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    track(
      (ev) => {
        const rotation = rotationFromPointer(f, toCanvas(ev), ev.shiftKey)
        ed.dispatch(
          { type: 'free/update', id: f.id, patch: { rotation } },
          { groupKey: `rotate:${f.id}`, continuous: true },
        )
      },
      () => ed.endGesture(),
    )
  }

  const freeHit = (f: FreeItem) => {
    const selected = ed.selection?.kind === 'free' && ed.selection.id === f.id
    const handle = px(12)
    return (
      <div
        key={f.id}
        className={`ke-hit ke-free ${selected ? 'is-selected' : ''} ${f.locked ? 'is-locked' : ''}`}
        style={{
          left: f.x,
          top: f.y,
          width: f.w,
          height: f.h,
          transform: f.rotation ? `rotate(${f.rotation}deg)` : undefined,
          outlineWidth: px(selected ? 2 : 1),
        }}
        onPointerDown={startFreeMove(f)}
        onDoubleClick={() => {
          if (f.kind === 'image' && !f.locked) ed.adjust({ kind: 'free', id: f.id })
        }}
        aria-label={f.kind === 'image' ? '이미지' : '스티커'}
      >
        {selected && !f.locked && (
          <>
            {CORNERS.map((c) => (
              <span
                key={c}
                className={`ke-handle ke-handle--${c}`}
                style={{ width: handle, height: handle, margin: -handle / 2, borderWidth: px(1.5) }}
                onPointerDown={startResize(f, c)}
              />
            ))}
            <span
              className="ke-rotate"
              style={{
                width: handle,
                height: handle,
                top: -px(32),
                marginLeft: -handle / 2,
                borderWidth: px(1.5),
              }}
              onPointerDown={startRotate(f)}
              title="회전 (Shift: 15도 단위)"
            />
          </>
        )}
      </div>
    )
  }

  const { back, front } = freeLayers(t.freeItems)

  return (
    <div
      ref={root}
      className="ke-overlay"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return
        ed.select(null)
        endAdjust()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(e) => {
        e.preventDefault() // Electron 기본 동작(파일로 이동) 방지
        const file = e.dataTransfer.files[0]
        if (file) onDropFile(file, toCanvas(e))
      }}
    >
      {/* 빈 칸에만 안내선(블록 위에 겹쳐 그리지 않음) */}
      {Array.from({ length: CANVAS.cols * CANVAS.rows }, (_, i) => {
        const cell = { col: i % CANVAS.cols, row: Math.floor(i / CANVAS.cols), w: 1, h: 1 }
        if (items.some((it) => rectsOverlap(it, cell))) return null
        return <div key={i} className="ke-cell" style={{ ...blockBox(cell), borderWidth: px(1) }} />
      })}
      {back.map(freeHit)}
      {t.blocks.map((b) => {
        const r = blockRect(b)
        if (!r) return null
        const box = blockBox(r)
        const selected = ed.selection?.kind === 'block' && ed.selection.id === b.id
        return (
          <div
            key={b.id}
            className={`ke-hit ke-block ${selected ? 'is-selected' : ''}`}
            style={{ ...box, outlineWidth: px(selected ? 2.5 : 1) }}
            onPointerDown={startBlockDrag(b, box)}
            onDoubleClick={() => {
              // 이미지 블록은 두 번 누르면 사진 위치 조정
              if (b.type === 'image' && b.props.assetHash) ed.adjust({ kind: 'block', id: b.id })
              // 다른 블록은 배경 사진이 있으면 그 사진 위치 조정
              else if (b.type !== 'image' && b.style.bgImage)
                ed.adjust({ kind: 'blockBg', id: b.id })
            }}
            aria-label={`${b.type} 블록`}
          />
        )
      })}
      {front.map(freeHit)}
      {pan && (
        <>
          <div
            className="ke-pan"
            style={{
              ...pan.box,
              transform: pan.rotation ? `rotate(${pan.rotation}deg)` : undefined,
              outlineWidth: px(2.5),
            }}
            onPointerDown={startPan}
            aria-label="끌어서 사진 위치 조정"
          />
          <div
            className="ke-pan-bar"
            style={{
              left: pan.box.left,
              top: Math.max(0, pan.box.top - px(44)),
              gap: px(8),
              padding: `${px(5)}px ${px(6)}px ${px(5)}px ${px(12)}px`,
              fontSize: px(13),
              borderRadius: px(999),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span>끌어서 사진 위치 조정</span>
            <button
              type="button"
              style={{ padding: `${px(4)}px ${px(12)}px`, borderRadius: px(999) }}
              onClick={() => ed.adjust(null)}
            >
              완료
            </button>
          </div>
        </>
      )}
      {incoming && (
        <div
          className={`ke-ghost ${incoming.valid ? 'is-valid' : 'is-invalid'}`}
          style={{ ...blockBox(incoming.rect), borderWidth: px(2) }}
        />
      )}
      {ghost && (
        <>
          <div
            className={`ke-ghost ${ghost.valid ? 'is-valid' : 'is-invalid'}`}
            style={{ ...blockBox(ghost.rect), borderWidth: px(2) }}
          />
          <div className="ke-dragging" style={{ ...ghost.at, outlineWidth: px(2) }} />
        </>
      )}
    </div>
  )
}
