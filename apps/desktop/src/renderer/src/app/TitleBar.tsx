import { useEffect, useRef, useState, type ReactNode } from 'react'
import chevronDownUrl from '../board/icons/chevron-down.svg'
import { maskCss } from '../board/style'
import type { SaveStatus } from '../editor/state/autosave'

export interface EditTools {
  onAddBlock(
    type: 'calendar' | 'todo' | 'timer' | 'image' | 'memo',
    size: 'S' | 'M' | 'L' | 'W',
  ): void
  onAddDecor(kind: 'image' | 'sticker'): void
  onUndo(): void
  onRedo(): void
  canUndo: boolean
  canRedo: boolean
  status: SaveStatus
}

/** 보드 창 안에서 보여 줄 화면 */
export type AppPage = 'board' | 'todo' | 'calendar' | 'timer' | 'memo' | 'timetable'

export interface PageNav {
  current: AppPage
  /** 지금 갈 수 있는 화면(구현된 세부 페이지만) */
  pages: readonly { id: AppPage; label: string }[]
  onNavigate(page: AppPage): void
}

interface Props {
  themeName: string | null
  editing: boolean
  onToggleEdit(): void
  tools?: EditTools
  nav?: PageNav
}

const BLOCK_MENU = [
  { type: 'calendar', size: 'L', label: '캘린더 · 월간 (4×3)' },
  { type: 'calendar', size: 'M', label: '캘린더 · 미니 (2×2)' },
  { type: 'todo', size: 'S', label: '투두 · 작게 (2×2)' },
  { type: 'todo', size: 'M', label: '투두 · 길게 (2×3)' },
  { type: 'todo', size: 'L', label: '투두 · 크게 (4×3)' },
  { type: 'timer', size: 'S', label: '타이머 · 작게 (2×1)' },
  { type: 'timer', size: 'M', label: '타이머 · 크게 (2×2)' },
  { type: 'memo', size: 'S', label: '메모 · 작게 (2×2)' },
  { type: 'memo', size: 'M', label: '메모 · 길게 (2×3)' },
  { type: 'memo', size: 'L', label: '메모 · 크게 (4×3)' },
  { type: 'image', size: 'S', label: '이미지 · 가로 (2×1)' },
  { type: 'image', size: 'M', label: '이미지 · 정사각 (2×2)' },
  { type: 'image', size: 'L', label: '이미지 · 크게 (4×3)' },
  { type: 'image', size: 'W', label: '이미지 · 배너 (8×1)' },
] as const

const statusText = (s: SaveStatus): string => {
  switch (s.state) {
    case 'idle':
      return ''
    case 'pending':
    case 'saving':
      return '저장 중…'
    case 'saved':
      return '저장됨'
    case 'invalid':
      return `저장 안 됨: ${s.message}`
    case 'error':
      return `저장 실패 (${s.code})`
  }
}

/** 앱이 그리는 타이틀바(시안 3:1080). 신호등 버튼은 시스템 것(hiddenInset). 테마 전환 드롭다운은 M6. */
export function TitleBar({ themeName, editing, onToggleEdit, tools, nav }: Props) {
  return (
    <header className={`app-titlebar ${editing ? 'is-editing' : ''}`}>
      <div className="tb-left">
        {!editing && nav && (
          <div className="tb-tabs" role="tablist" aria-label="화면">
            {nav.pages.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                className="tb-tab"
                aria-selected={nav.current === p.id}
                onClick={() => nav.onNavigate(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {editing && tools && (
          <>
            <Menu label="+ 블록">
              {(close) =>
                BLOCK_MENU.map((m) => (
                  <button
                    key={`${m.type}-${m.size}`}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close()
                      tools.onAddBlock(m.type, m.size)
                    }}
                  >
                    {m.label}
                  </button>
                ))
              }
            </Menu>
            <Menu label="+ 꾸미기">
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => (close(), tools.onAddDecor('image'))}
                  >
                    이미지 (사진, 잘라서 채움)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => (close(), tools.onAddDecor('sticker'))}
                  >
                    스티커 (투명 PNG 권장)
                  </button>
                </>
              )}
            </Menu>
            <button
              type="button"
              className="tb-btn tb-icon"
              onClick={tools.onUndo}
              disabled={!tools.canUndo}
              aria-label="실행 취소"
              title="실행 취소 (⌘Z)"
            >
              ↶
            </button>
            <button
              type="button"
              className="tb-btn tb-icon"
              onClick={tools.onRedo}
              disabled={!tools.canRedo}
              aria-label="다시 실행"
              title="다시 실행 (⇧⌘Z)"
            >
              ↷
            </button>
          </>
        )}
      </div>
      <button type="button" className="app-theme-pill" disabled title="테마 전환은 추후 지원">
        <span>꾸미꾸미{themeName ? ` · ${themeName}` : ''}</span>
        <span className="app-theme-chevron" style={maskCss(chevronDownUrl, '#4a3a36')} />
      </button>
      <div className="tb-right">
        {editing && tools && (
          <span className={`tb-status is-${tools.status.state}`} aria-live="polite">
            {statusText(tools.status)}
          </span>
        )}
        {(!nav || nav.current === 'board') && (
          <button
            type="button"
            className="tb-btn tb-primary"
            onClick={onToggleEdit}
            aria-pressed={editing}
          >
            {editing ? '완료' : '편집'}
          </button>
        )}
      </div>
    </header>
  )
}

function Menu({ label, children }: { label: string; children(close: () => void): ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  return (
    <div className="tb-menu" ref={ref}>
      <button
        type="button"
        className="tb-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div className="tb-menu-list" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
