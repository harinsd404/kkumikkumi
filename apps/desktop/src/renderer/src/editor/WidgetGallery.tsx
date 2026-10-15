import { blockCells, newBlock, type GridBlock, type Theme } from '@kkumikkumi/schema'
import { useMemo, useRef, useState } from 'react'
import { WIDGET_LABEL } from '../board/blockLabels'
import { BlockView } from '../board/BlockView'
import { BoardProvider, type BoardContextValue, type BoardData } from '../board/BoardContext'
import chevronLeftUrl from '../board/icons/chevron-left.svg'
import chevronRightUrl from '../board/icons/chevron-right.svg'
import { blockBox } from '../board/layout'
import { maskCss } from '../board/style'

export type WidgetKind = { type: GridBlock['type']; size: GridBlock['size'] }

/** 갤러리 목록: 종류별로 고를 수 있는 크기와 짧은 이름 */
interface GalleryGroup {
  type: GridBlock['type']
  label: string
  sizes: readonly { size: GridBlock['size']; label: string }[]
}

const GALLERY: readonly GalleryGroup[] = [
  {
    type: 'calendar',
    label: WIDGET_LABEL.calendar,
    sizes: [
      { size: 'M', label: '미니' },
      { size: 'L', label: '월간' },
    ],
  },
  {
    type: 'todo',
    label: WIDGET_LABEL.todo,
    sizes: [
      { size: 'S', label: '작게' },
      { size: 'M', label: '길게' },
      { size: 'L', label: '크게' },
    ],
  },
  {
    type: 'timer',
    label: WIDGET_LABEL.timer,
    sizes: [
      { size: 'S', label: '작게' },
      { size: 'M', label: '크게' },
    ],
  },
  {
    type: 'memo',
    label: WIDGET_LABEL.memo,
    sizes: [
      { size: 'S', label: '작게' },
      { size: 'M', label: '길게' },
      { size: 'L', label: '크게' },
    ],
  },
  {
    type: 'timetable',
    label: WIDGET_LABEL.timetable,
    sizes: [
      { size: 'S', label: '오늘' },
      { size: 'M', label: '오늘 길게' },
      { size: 'L', label: '한 주' },
    ],
  },
  {
    type: 'dday',
    label: WIDGET_LABEL.dday,
    sizes: [
      { size: 'S', label: '한 줄' },
      { size: 'M', label: '크게' },
    ],
  },
  {
    type: 'image',
    label: WIDGET_LABEL.image,
    sizes: [
      { size: 'S', label: '가로' },
      { size: 'M', label: '정사각' },
      { size: 'L', label: '크게' },
      { size: 'W', label: '배너' },
    ],
  },
]

/** 미리보기 상자의 최대 크기(화면 px) */
const MAX_W = 212
const MAX_H = 160

interface PreviewEnv {
  theme: Theme
  data: BoardData
  assetUrl(hash: string): string | null
  now: Date
}

/**
 * 위젯 실제 미리보기: 지금 테마와 데이터로 블록을 그려 작게 줄인다. 안의 버튼은 눌리지 않는다.
 * maxW/maxH 안에 들어가게 균일 스케일.
 */
export function WidgetPreview({
  kind,
  env,
  maxW = MAX_W,
  maxH = MAX_H,
}: {
  kind: WidgetKind
  env: PreviewEnv
  maxW?: number
  maxH?: number
}) {
  const cells = blockCells(kind.type, kind.size)
  const ctx = useMemo<BoardContextValue>(
    () => ({
      mode: 'edit',
      theme: env.theme,
      assetUrl: env.assetUrl,
      data: env.data,
      actions: undefined,
      now: env.now,
    }),
    [env.theme, env.assetUrl, env.data, env.now],
  )
  if (!cells) return null
  const block = newBlock(kind.type, kind.size, 'preview', 0, 0)
  const box = blockBox({ col: 0, row: 0, ...cells })
  const scale = Math.min(maxW / box.width, maxH / box.height)
  return (
    <div
      className="wg-frame"
      style={{ width: box.width * scale, height: box.height * scale }}
      aria-hidden
    >
      <div
        className="kb-canvas wg-canvas"
        style={{ width: box.width, height: box.height, transform: `scale(${scale})` }}
      >
        <BoardProvider value={ctx}>
          <BlockView block={block} box={{ ...box, left: 0, top: 0 }} />
        </BoardProvider>
      </div>
    </div>
  )
}

/**
 * 위젯 추가 갤러리(애플 위젯 편집 방식). 누르면 빈 자리에 추가, 보드로 끌면 그 칸에 추가.
 * 끌기는 부모(BoardScreen)가 처리한다: onPick(kind, 누른 이벤트).
 */
export function WidgetGallery({
  env,
  onPick,
  onAddDecor,
}: {
  env: PreviewEnv
  /** 위젯을 누르기 시작했다(누르기/끌기 판정은 부모가). 키보드로 고르면 start는 null(바로 추가). */
  onPick(kind: WidgetKind, start: { clientX: number; clientY: number } | null): void
  onAddDecor(kind: 'image' | 'sticker'): void
}) {
  return (
    <div className="wg">
      {/* 사진·스티커는 자주 쓰는 꾸미기라 맨 위에 */}
      <section className="wg-decor" aria-label="사진·스티커 넣기">
        <button type="button" className="wg-decor-btn" onClick={() => onAddDecor('image')}>
          사진 넣기
          <span>잘라서 채움</span>
        </button>
        <button type="button" className="wg-decor-btn" onClick={() => onAddDecor('sticker')}>
          스티커 넣기
          <span>투명 PNG 권장</span>
        </button>
      </section>
      <p className="wg-hint">위젯은 누르면 빈 자리에 넣고, 보드로 끌어 놓으면 그 자리에 넣어요.</p>
      {GALLERY.map((g) => (
        <SizeCarousel key={g.type} group={g} env={env} onPick={onPick} />
      ))}
    </div>
  )
}

type Pick = (kind: WidgetKind, start: { clientX: number; clientY: number } | null) => void

/**
 * 한 종류의 크기들을 좌우로 넘겨 보는 캐러셀. 트랙패드 가로 스크롤(스냅), 양옆 화살표, 아래 점으로 넘긴다.
 * 위젯을 누르거나 끄는 동작은 그대로(누르기 = 추가, 끌기 = 보드에 놓기).
 */
function SizeCarousel({
  group: g,
  env,
  onPick,
}: {
  group: GalleryGroup
  env: PreviewEnv
  onPick: Pick
}) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const n = g.sizes.length
  const go = (i: number) => {
    const el = track.current
    if (!el) return
    const to = Math.min(Math.max(i, 0), n - 1)
    el.scrollTo({ left: to * el.clientWidth, behavior: 'smooth' })
  }
  return (
    <section className="wg-group" aria-label={g.label}>
      <div className="wg-head">
        <h3 className="wg-title">{g.label}</h3>
        {n > 1 && (
          <span className="wg-count" aria-live="polite">
            {g.sizes[index]!.label} · {index + 1}/{n}
          </span>
        )}
      </div>
      <div className="wg-carousel">
        <div
          ref={track}
          className="wg-track"
          onScroll={(e) => {
            const el = e.currentTarget
            setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)))
          }}
        >
          {g.sizes.map((s) => {
            const cells = blockCells(g.type, s.size)!
            const kind = { type: g.type, size: s.size }
            return (
              <button
                key={s.size}
                type="button"
                className="wg-item"
                aria-label={`${g.label} ${s.label} (${cells.w}×${cells.h}) 추가`}
                onPointerDown={(e) => {
                  if (e.button === 0) onPick(kind, { clientX: e.clientX, clientY: e.clientY })
                }}
                onKeyDown={(e) => {
                  // 키보드: Enter/Space로 빈 자리에 추가(끌기 없이)
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onPick(kind, null)
                  }
                }}
              >
                <WidgetPreview kind={kind} env={env} />
                <span className="wg-caption">
                  {s.label} <span className="wg-cells">{`${cells.w}×${cells.h}`}</span>
                </span>
              </button>
            )
          })}
        </div>
        {n > 1 && (
          <>
            <button
              type="button"
              className="wg-arrow is-prev"
              aria-label={`${g.label} 이전 크기`}
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              <span style={maskCss(chevronLeftUrl, 'currentColor')} />
            </button>
            <button
              type="button"
              className="wg-arrow is-next"
              aria-label={`${g.label} 다음 크기`}
              disabled={index === n - 1}
              onClick={() => go(index + 1)}
            >
              <span style={maskCss(chevronRightUrl, 'currentColor')} />
            </button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="wg-dots">
          {g.sizes.map((s, i) => (
            <button
              key={s.size}
              type="button"
              className="wg-dot"
              aria-label={`${g.label} ${s.label} 보기`}
              aria-current={i === index}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
