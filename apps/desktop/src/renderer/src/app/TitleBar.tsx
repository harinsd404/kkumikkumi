import { useEffect, useRef, useState } from 'react'
import chevronDownUrl from '../board/icons/chevron-down.svg'
import redoUrl from '../board/icons/redo.svg'
import undoUrl from '../board/icons/undo.svg'
import { maskCss } from '../board/style'
import type { SaveStatus } from '../editor/state/autosave'
import { ColorDots } from './ThemeDialog'

/** 편집 중 타이틀바 도구(위젯·꾸미기 추가는 편집 패널의 갤러리에서) */
interface EditTools {
  onUndo(): void
  onRedo(): void
  canUndo: boolean
  canRedo: boolean
  status: SaveStatus
}

/** 보드 창 안에서 보여 줄 화면 */
/** 화면. 할 일과 캘린더는 한 화면(할 일)이다(2026-10-16). */
export type AppPage = 'board' | 'todo' | 'timer' | 'memo' | 'timetable' | 'settings'

export interface PageNav {
  current: AppPage
  /** 지금 갈 수 있는 화면(구현된 세부 페이지만) */
  /** icon이 있으면 글자 대신 아이콘만(좁은 타이틀바에서 넘치지 않게), label은 접근성 이름 */
  pages: readonly { id: AppPage; label: string; icon?: string }[]
  onNavigate(page: AppPage): void
}

/** 타이틀바 테마 메뉴: 저장된 테마 고르기, 프리셋으로 새 테마 만들기 (이름 바꾸기·삭제는 M6) */
export interface ThemeMenu {
  currentId: string
  /** 기본 테마 먼저, 그다음 내 테마 */
  themes: readonly { id: string; name: string; builtin: boolean; colors: readonly string[] }[]
  onOpen(): void
  onSelect(id: string): void
  onCreate(): void
  onManage(): void
}

interface Props {
  themeName: string | null
  /** 없으면(편집 중, 불러오는 중) 테마 알약은 이름만 보여 준다 */
  themeMenu?: ThemeMenu | undefined
  editing: boolean
  onToggleEdit(): void
  tools?: EditTools
  nav?: PageNav
}

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
export function TitleBar({ themeName, themeMenu, editing, onToggleEdit, tools, nav }: Props) {
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
                className={`tb-tab ${p.icon ? 'tb-tab-icon' : ''}`}
                aria-selected={nav.current === p.id}
                aria-label={p.icon ? p.label : undefined}
                title={p.icon ? p.label : undefined}
                onClick={() => nav.onNavigate(p.id)}
              >
                {p.icon ? (
                  <span className="tb-glyph" style={maskCss(p.icon, 'currentColor')} />
                ) : (
                  p.label
                )}
              </button>
            ))}
          </div>
        )}
        {editing && tools && (
          <>
            <button
              type="button"
              className="tb-btn tb-icon"
              onClick={tools.onUndo}
              disabled={!tools.canUndo}
              aria-label="실행 취소"
              title="실행 취소 (⌘Z)"
            >
              <span className="tb-glyph" style={maskCss(undoUrl, 'currentColor')} />
            </button>
            <button
              type="button"
              className="tb-btn tb-icon"
              onClick={tools.onRedo}
              disabled={!tools.canRedo}
              aria-label="다시 실행"
              title="다시 실행 (⇧⌘Z)"
            >
              <span className="tb-glyph" style={maskCss(redoUrl, 'currentColor')} />
            </button>
          </>
        )}
      </div>
      <ThemePill name={themeName} menu={themeMenu} />
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

/** 열림 상태 + 바깥을 누르거나 Escape면 닫기 */
function useClosable() {
  const [value, set] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!value) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) set(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [value])
  return [value, set, ref] as const
}

/** 가운데 테마 알약. 메뉴가 있으면 눌러서 테마를 고르거나 새로 만든다. */
function ThemePill({ name, menu }: { name: string | null; menu: ThemeMenu | undefined }) {
  const [open, setOpen, ref] = useClosable()
  const label = `꾸미꾸미${name ? ` · ${name}` : ''}`
  if (!menu)
    return (
      <div className="app-theme-pill is-static">
        <span>{label}</span>
      </div>
    )
  return (
    <div className="tb-menu app-theme" ref={ref}>
      <button
        type="button"
        className="app-theme-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        title="테마 바꾸기"
        onClick={() => {
          if (!open) menu.onOpen()
          setOpen(!open)
        }}
      >
        <span>{label}</span>
        <span className="app-theme-chevron" style={maskCss(chevronDownUrl, 'currentColor')} />
      </button>
      {open && (
        <div className="tb-menu-list app-theme-list" role="menu" aria-label="테마">
          {(
            [
              ['기본 테마', menu.themes.filter((t) => t.builtin)],
              ['내 테마', menu.themes.filter((t) => !t.builtin)],
            ] as const
          ).map(
            ([head, items]) =>
              items.length > 0 && (
                <div key={head} role="group" aria-label={head}>
                  <p className="tb-menu-head">{head}</p>
                  {items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={t.id === menu.currentId}
                      className="app-theme-item"
                      onClick={() => {
                        setOpen(false)
                        if (t.id !== menu.currentId) menu.onSelect(t.id)
                      }}
                    >
                      <ColorDots colors={t.colors} />
                      {t.name}
                    </button>
                  ))}
                </div>
              ),
          )}
          <hr className="tb-menu-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              menu.onCreate()
            }}
          >
            + 새 테마 만들기…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              menu.onManage()
            }}
          >
            테마 관리…
          </button>
        </div>
      )}
    </div>
  )
}
