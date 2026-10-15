import { CANVAS, blockRect, type Theme } from '@kkumikkumi/schema'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Background } from './Background'
import {
  BoardProvider,
  type BoardActions,
  type BoardContextValue,
  type BoardData,
  type BoardMode,
} from './BoardContext'
import { BlockView } from './BlockView'
import { FreeItemView } from './FreeItemView'
import { blockBox, fitScale, freeLayers } from './layout'
import './board.css'

export interface BoardProps {
  theme: Theme
  assetUrl(hash: string): string | null
  data?: BoardData
  actions?: BoardActions | undefined
  mode?: BoardMode
  now?: Date
  /** 캔버스 맨 위에 겹쳐 그릴 레이어(에디터). 캔버스 좌표계 안에서 그려지고 현재 스케일을 받는다. */
  overlay?: ((scale: number) => ReactNode) | undefined
}

const EMPTY: BoardData = {}

/**
 * 보드 렌더러(순수 React, electron 의존 없음).
 * 1600x1000 논리 캔버스를 부모 크기에 맞춰 균일 스케일. 렌더 순서: 배경 → back 자유 아이템 → 그리드 블록 → front 자유 아이템.
 */
export function Board({
  theme,
  assetUrl,
  data = EMPTY,
  actions,
  mode = 'use',
  now,
  overlay,
}: BoardProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ctx = useMemo<BoardContextValue>(
    () => ({ mode, theme, assetUrl, data, actions, now: now ?? new Date() }),
    [mode, theme, assetUrl, data, actions, now],
  )

  const { scale, offsetX, offsetY } = fitScale(size.w, size.h)
  const canvasStyle: CSSProperties = {
    width: CANVAS.width,
    height: CANVAS.height,
    transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
  }
  const { back, front } = freeLayers(theme.freeItems)

  return (
    <BoardProvider value={ctx}>
      <div ref={hostRef} className="kb-host" data-mode={mode}>
        <div className="kb-canvas" style={canvasStyle}>
          <Background />
          <div className="kb-layer">
            {back.map((f) => (
              <FreeItemView key={f.id} item={f} />
            ))}
          </div>
          <div className="kb-layer">
            {theme.blocks.map((b) => {
              const rect = blockRect(b)
              return rect ? <BlockView key={b.id} block={b} box={blockBox(rect)} /> : null
            })}
          </div>
          <div className="kb-layer">
            {front.map((f) => (
              <FreeItemView key={f.id} item={f} />
            ))}
          </div>
          {overlay?.(scale)}
        </div>
      </div>
    </BoardProvider>
  )
}
