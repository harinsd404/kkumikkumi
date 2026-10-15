import { blockCells, blockRect, CANVAS, canPlace, type Asset, type Theme } from '@kkumikkumi/schema'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../board/Board'
import type { BoardActions } from '../board/BoardContext'
import { blockBox } from '../board/layout'
import { EditorOverlay, type ToCanvas } from '../editor/EditorOverlay'
import { Inspector } from '../editor/Inspector'
import { dropCell, type Point } from '../editor/state/geometry'
import { newFreeItem } from '../editor/state/reducer'
import { keyToCommand } from '../editor/state/shortcuts'
import { useEditor, type EditorApi } from '../editor/useEditor'
import { WidgetGallery, WidgetPreview, type WidgetKind } from '../editor/WidgetGallery'
import { makeAssetUrl } from './assetUrl'
import { CutoutDialog } from './CutoutDialog'
import { EventDialog } from './EventDialog'
import { ThemeDialog, type ThemeDialogResult } from './ThemeDialog'
import { applyLook, lookOf, lookOfSummary, uniqueLooks } from './themeLook'
import { ThemeManager, type ThemeManagerActions } from './ThemeManager'
import type { ImportedAsset } from '../../../shared/api'
import { PHASE_LABEL } from '../../../shared/pomodoro'
import { CalendarPage } from '../pages/CalendarPage'
import { MemoPage } from '../pages/MemoPage'
import { TimetablePage } from '../pages/TimetablePage'
import { themeTones, uniqueName } from '../board/timetable'
import { otherThemes } from './colorGroups'
import { TimerPage } from '../pages/TimerPage'
import { TodoPage } from '../pages/TodoPage'
import { themeColorVars, themeVars } from './themeVars'
import { TitleBar, type AppPage, type PageNav, type ThemeMenu } from './TitleBar'
import { useMemos } from './useMemos'
import { useThemes } from './useThemes'
import { useTimetable } from './useTimetable'
import { useUserData } from './useUserData'

/** 구현된 화면(세부 페이지는 단계별로 추가) */
const PAGES: PageNav['pages'] = [
  { id: 'board', label: '보드' },
  { id: 'todo', label: '할 일' },
  { id: 'calendar', label: '캘린더' },
  { id: 'timer', label: '타이머' },
  { id: 'memo', label: '메모' },
  { id: 'timetable', label: '시간표' },
]

const THEME_ERRORS: Record<string, string> = {
  builtin_theme: '기본 테마는 이름을 바꾸거나 지울 수 없어요',
  last_theme: '마지막 테마는 지울 수 없어요',
  not_found: '테마를 찾지 못했어요',
  invalid_input: '입력한 값을 확인해 주세요',
  invalid_schema: '테마를 저장할 수 없는 상태예요',
}

const ASSET_ERRORS: Record<string, string> = {
  unsupported_format: 'PNG, JPG, WebP 이미지만 넣을 수 있어요',
  too_large_input: '파일이 너무 커요 (25MB까지)',
  too_many_pixels: '해상도가 너무 커요',
  decode_failed: '이미지를 읽을 수 없어요',
  too_large_output: '이미지가 너무 커서 줄여도 5MB를 넘어요',
  invalid_input: '파일이 너무 커요',
}

const noAsset = () => null

/** 모듈 수준 함수(안정 참조): 자동 저장기가 매 렌더 새로 만들어지지 않도록 */
async function saveTheme(theme: Theme) {
  const r = await window.kkumi.invoke('themes.save', { theme })
  return r.ok ? ({ ok: true } as const) : ({ ok: false, code: r.error.code } as const)
}

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export function BoardScreen({
  initialTheme,
  initialPage = 'board',
  onSwitchTheme,
}: {
  initialTheme: Theme
  initialPage?: AppPage
  /** 활성 테마 바꾸기(App이 이 화면을 새 테마로 다시 만든다) */
  onSwitchTheme?(id: string, page: AppPage): Promise<boolean>
}) {
  const ed = useEditor(initialTheme, { save: saveTheme })
  const user = useUserData(ed.showNotice)
  const memos = useMemos(ed.showNotice)
  const timetable = useTimetable(ed.showNotice)
  const now = useMinuteClock()
  const [editing, setEditing] = useState(false)
  /** 편집 패널 탭: 고른 것이 생기면 설정, 없어지면 위젯 추가 */
  const [panelTab, setPanelTab] = useState<'add' | 'settings'>('add')
  const [prevSel, setPrevSel] = useState(ed.selection)
  if (prevSel !== ed.selection) {
    setPrevSel(ed.selection)
    if (!!ed.selection !== !!prevSel) setPanelTab(ed.selection ? 'settings' : 'add')
  }
  /** 갤러리에서 끌어 오는 중인 위젯(커서 위치, 놓일 자리) */
  const [incoming, setIncoming] = useState<{
    kind: WidgetKind
    client: { x: number; y: number }
    target: { rect: { col: number; row: number; w: number; h: number }; valid: boolean } | null
  } | null>(null)
  const toCanvasRef = useRef<ToCanvas | null>(null)
  /** 흰 배경 스티커: 지울지 물어보는 중인 원본 에셋 */
  const [cutout, setCutout] = useState<Asset | null>(null)
  const [page, setPage] = useState<AppPage>(initialPage)
  const themes = useThemes()
  /** 메모 블록에서 들어오면 그 메모를 연다 */
  const [memoOpen, setMemoOpen] = useState<string | null>(null)
  const theme = ed.theme
  // 블록의 "크게 보기" 버튼이 세부 페이지로 보낸다
  const memoToggle = memos.toggle
  const timetableSelect = timetable.select
  const boardActions = useMemo<BoardActions>(
    () => ({
      ...user.actions,
      memo: { toggle: memoToggle },
      timetable: { select: (id) => void timetableSelect(id) },
      pages: {
        todo: () => setPage('todo'),
        calendar: () => setPage('calendar'),
        timer: () => setPage('timer'),
        timetable: () => setPage('timetable'),
        memo: (b) => {
          setMemoOpen(b.type === 'memo' ? b.props.memoId : null)
          setPage('memo')
        },
      },
    }),
    [user.actions, memoToggle, timetableSelect],
  )
  const boardData = useMemo(
    () => ({
      ...user.data,
      ...(memos.memos ? { memos: memos.memos } : {}),
      ...(timetable.data ? { timetable: timetable.data } : {}),
    }),
    [user.data, memos.memos, timetable.data],
  )
  const navigate = useCallback((p: AppPage) => {
    setMemoOpen(null)
    setPage(p)
  }, [])
  const assetUrl = useMemo(() => makeAssetUrl(theme), [theme])
  const previewEnv = useMemo(
    () => ({ theme, data: boardData, assetUrl, now }),
    [theme, boardData, assetUrl, now],
  )
  const others = useMemo(() => otherThemes(themes.list, theme.id), [themes.list, theme.id])

  const showNotice = ed.showNotice
  const flushTheme = ed.flush
  const flushMemoEdits = memos.flush
  const refreshThemes = themes.refresh
  /** 남은 변경을 저장하고 테마를 (다시) 불러온다. 같은 ID여도 화면을 새로 만든다. */
  const switchTo = useCallback(
    async (id: string) => {
      await Promise.all([flushTheme(), flushMemoEdits()])
      if (!onSwitchTheme || !(await onSwitchTheme(id, page))) {
        showNotice('테마를 바꾸지 못했어요')
        return false
      }
      return true
    },
    [flushTheme, flushMemoEdits, onSwitchTheme, page, showNotice],
  )
  const okThemes = useMemo(() => themes.list.flatMap((s) => (s.ok ? [s] : [])), [themes.list])
  const themeMenu = useMemo<ThemeMenu | undefined>(() => {
    if (!onSwitchTheme) return undefined
    return {
      currentId: theme.id,
      themes: okThemes.map((s) => ({
        id: s.id,
        name: s.name,
        builtin: s.builtin,
        colors: [s.bgColor ?? s.palette.surface, s.palette.accent, s.palette.check],
      })),
      onOpen: () => void refreshThemes(),
      onSelect: (id) => void switchTo(id),
      onCreate: () => setThemeDlg({ mode: 'create' }),
      onManage: () => {
        void refreshThemes()
        setManageOpen(true)
      },
    }
  }, [onSwitchTheme, refreshThemes, switchTo, theme.id, okThemes])

  /** 테마 만들기/수정 창 */
  const [themeDlg, setThemeDlg] = useState<
    { mode: 'create' } | { mode: 'edit'; theme: Theme; builtin: boolean } | null
  >(null)
  const [manageOpen, setManageOpen] = useState(false)
  const errText = (code: string) => THEME_ERRORS[code] ?? `실패했어요 (${code})`

  const openEdit = async (id: string) => {
    await flushTheme() // 지금 테마면 편집 중 변경을 먼저 저장
    const r = await window.kkumi.invoke('themes.get', { id })
    if (!r.ok) return showNotice(errText(r.error.code))
    const s = okThemes.find((x) => x.id === id)
    setThemeDlg({ mode: 'edit', theme: r.value, builtin: s?.builtin ?? false })
  }

  const submitTheme = async (res: ThemeDialogResult): Promise<string | null> => {
    if (!themeDlg) return null
    if (themeDlg.mode === 'create') {
      const r = await window.kkumi.invoke('themes.create', {
        name: res.name,
        ...res.look,
        template: res.template,
      })
      if (!r.ok) return errText(r.error.code)
      setThemeDlg(null)
      setManageOpen(false)
      await switchTo(r.value.id)
      return null
    }
    const id = themeDlg.theme.id
    await flushTheme()
    const cur = await window.kkumi.invoke('themes.get', { id }) // 최신 배치에 외형만 바꾼다
    if (!cur.ok) return errText(cur.error.code)
    const r = await window.kkumi.invoke('themes.save', {
      theme: applyLook(cur.value, res.look, themeDlg.builtin ? undefined : res.name),
    })
    if (!r.ok) return errText(r.error.code)
    setThemeDlg(null)
    if (id === theme.id) await switchTo(id)
    else await refreshThemes()
    return null
  }

  /** 관리 창 동작 후: 지금 테마가 바뀌었으면 다시 불러오고, 아니면 목록만 */
  const afterChange = async (id: string) => {
    if (id === theme.id) await switchTo(id)
    else await refreshThemes()
  }
  const manageActions: ThemeManagerActions = {
    onSelect: (id) => {
      setManageOpen(false)
      void switchTo(id)
    },
    onEdit: (id) => void openEdit(id),
    onCreate: () => setThemeDlg({ mode: 'create' }),
    onRename: async (id, name) => {
      if (id === theme.id) await flushTheme()
      const r = await window.kkumi.invoke('themes.rename', { id, name })
      if (!r.ok) return errText(r.error.code)
      await afterChange(id)
      return null
    },
    onDuplicate: async (id) => {
      if (id === theme.id) await flushTheme()
      const src = okThemes.find((s) => s.id === id)
      const name = uniqueName(
        okThemes.map((s) => s.name),
        `${src?.name ?? '테마'} 복사본`,
      )
      const r = await window.kkumi.invoke('themes.duplicate', { id, name })
      if (!r.ok) return errText(r.error.code)
      await refreshThemes()
      return null
    },
    onDelete: async (id) => {
      if (id === theme.id) await flushTheme()
      const r = await window.kkumi.invoke('themes.delete', { id })
      if (!r.ok) return errText(r.error.code)
      if (id === theme.id) await switchTo(r.value.activeThemeId)
      else await refreshThemes()
      return null
    },
    onReset: async (id) => {
      if (id === theme.id) await flushTheme()
      const r = await window.kkumi.invoke('themes.resetBuiltin', { id })
      if (!r.ok) return errText(r.error.code)
      await afterChange(id)
      return null
    },
  }

  // 창을 닫을 때 남은 변경 저장
  const flushMemos = memos.flush
  useEffect(() => {
    window.kkumi.onBeforeClose(async () => {
      await Promise.all([ed.flush(), flushMemos()])
    })
  }, [ed, flushMemos])

  const importAsset = useCallback(
    async (src: { dialog: true } | { bytes: Uint8Array }): Promise<ImportedAsset | null> => {
      const r =
        'dialog' in src
          ? await window.kkumi.invoke('assets.importFromDialog', {
              themeId: theme.id,
              purpose: 'image',
            })
          : await window.kkumi.invoke('assets.importBytes', {
              themeId: theme.id,
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
    [ed, theme.id],
  )

  const addDecor = useCallback(
    (kind: 'image' | 'sticker', asset: Asset, at?: Point) => {
      const id = crypto.randomUUID()
      if (ed.dispatch({ type: 'free/add', item: newFreeItem(kind, id, asset, at) }))
        ed.select({ kind: 'free', id })
    },
    [ed],
  )

  const duplicate = useCallback(() => {
    const s = ed.selection
    if (!s) return
    const newId = crypto.randomUUID()
    const ok = ed.dispatch(
      s.kind === 'block'
        ? { type: 'block/duplicate', id: s.id, newId }
        : { type: 'free/duplicate', id: s.id, newId },
    )
    if (ok) ed.select({ kind: s.kind, id: newId })
  }, [ed])

  const addBlock = useCallback(
    (kind: WidgetKind, at?: { col: number; row: number }) => {
      const id = crypto.randomUUID()
      if (ed.dispatch({ type: 'block/add', block: kind, id, ...(at ? { at } : {}) }))
        ed.select({ kind: 'block', id })
    },
    [ed],
  )

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
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setIncoming(null)
        if (e.type === 'pointercancel') return
        if (!moved) return addBlock(kind)
        const target = targetAt(e)
        if (!target) return // 보드 밖에 놓으면 취소
        if (!target.valid) return ed.showNotice('다른 블록과 겹쳐서 놓을 수 없어요')
        addBlock(kind, { col: target.rect.col, row: target.rect.row })
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [ed, addBlock],
  )

  const remove = useCallback(() => {
    const s = ed.selection
    if (!s) return
    if (
      ed.dispatch(
        s.kind === 'block' ? { type: 'block/delete', id: s.id } : { type: 'free/delete', id: s.id },
      )
    )
      ed.select(null)
  }, [ed])

  const exitEdit = useCallback(async () => {
    ed.select(null)
    setEditing(false)
    await ed.flush()
    // 지운 이미지 파일 정리(최근 10분 안에 가져온 파일은 main이 남겨 둔다)
    await window.kkumi.invoke('themes.pruneAssets', { id: theme.id })
  }, [ed, theme.id])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      const c = keyToCommand({
        key: e.key,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        inTextField: isTextField(e.target),
      })
      if (!c) return
      e.preventDefault()
      runCommand(c.cmd === 'nudge' ? c : c.cmd)
    }
    const runCommand = (c: string | { dx: number; dy: number; big: boolean }) => {
      if (typeof c === 'object') return nudge(ed, c)
      if (c === 'undo') ed.undo()
      else if (c === 'redo') ed.redo()
      else if (c === 'delete') remove()
      else if (c === 'duplicate') duplicate()
      else if (c === 'save') void ed.flush()
      else if (c === 'escape') {
        if (ed.selection) ed.select(null)
        else void exitEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, ed, remove, duplicate, exitEdit])

  return (
    <div className="app" style={themeColorVars(theme)}>
      <TitleBar
        themeName={theme.name}
        themeMenu={editing ? undefined : themeMenu}
        editing={editing}
        onToggleEdit={() => (editing ? void exitEdit() : setEditing(true))}
        nav={{ current: page, pages: PAGES, onNavigate: navigate }}
        tools={{
          onUndo: ed.undo,
          onRedo: ed.redo,
          canUndo: ed.canUndo,
          canRedo: ed.canRedo,
          status: ed.status,
        }}
      />
      <main className={`app-board ${editing && page === 'board' ? 'is-editing' : ''}`}>
        {page === 'todo' && (
          <div className="app-page" style={themeVars(theme)}>
            <TodoPage todos={user.data.todos} actions={user.actions} lists={user.lists} now={now} />
          </div>
        )}
        {page === 'calendar' && (
          <div className="app-page" style={themeVars(theme)}>
            <CalendarPage
              actions={user.actions}
              version={user.data.version ?? 0}
              now={now}
              weekStartsOn={weekStartsOf(theme)}
              updateEvent={user.events.update}
            />
          </div>
        )}
        {page === 'timer' && (
          <div className="app-page" style={themeVars(theme)}>
            <TimerPage
              timer={user.data.timer}
              pomodoro={user.data.pomodoro}
              command={user.actions.timer.command}
              sessions={user.timer.sessions}
              updatePomodoro={user.timer.updatePomodoro}
              now={now}
              weekStartsOn={weekStartsOf(theme)}
              openMini={() => void window.kkumi.invoke('miniTimer.open')}
            />
          </div>
        )}
        {page === 'memo' && (
          <div className="app-page" style={themeVars(theme)}>
            <MemoPage store={memos} initialId={memoOpen} now={now} />
          </div>
        )}
        {page === 'timetable' && (
          <div className="app-page" style={themeVars(theme)}>
            <TimetablePage store={timetable} now={now} tones={themeTones(theme.defaults.palette)} />
          </div>
        )}
        {page === 'board' && (
          <div className="app-stage">
            <Board
              theme={theme}
              assetUrl={assetUrl}
              data={boardData}
              actions={boardActions}
              now={now}
              mode={editing ? 'edit' : 'use'}
              overlay={
                editing
                  ? (scale) => (
                      <EditorOverlay
                        ed={ed}
                        scale={scale}
                        incoming={incoming?.target}
                        toCanvasRef={toCanvasRef}
                        onDropFile={async (file, at) => {
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
                        }}
                      />
                    )
                  : undefined
              }
            />
          </div>
        )}
        {editing && page === 'board' && (
          <aside className="edit-panel" aria-label="편집">
            <div className="edit-tabs" role="tablist" aria-label="편집 패널">
              <button
                type="button"
                role="tab"
                aria-selected={panelTab === 'add'}
                onClick={() => setPanelTab('add')}
              >
                위젯 추가
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panelTab === 'settings'}
                onClick={() => setPanelTab('settings')}
              >
                {ed.selection ? '설정' : '테마 설정'}
              </button>
            </div>
            {panelTab === 'add' ? (
              <WidgetGallery
                env={previewEnv}
                onPick={pickWidget}
                onAddDecor={async (kind) => {
                  const r = await importAsset({ dialog: true })
                  if (!r) return
                  // 스티커로 넣을 때만, 흰 배경이면 지울지 물어본다
                  if (kind === 'sticker' && r.whiteBackground) setCutout(r.asset)
                  else addDecor(kind, r.asset)
                }}
              />
            ) : (
              <Inspector
                ed={ed}
                pickImage={async () => (await importAsset({ dialog: true }))?.asset ?? null}
                onDuplicate={duplicate}
                onDelete={remove}
                todoLists={user.lists}
                memos={memos}
                timetables={timetable.data}
                otherThemes={others}
              />
            )}
          </aside>
        )}
        {incoming && (
          <div
            className="wg-drag"
            style={{ left: incoming.client.x, top: incoming.client.y }}
            aria-hidden
          >
            <WidgetPreview kind={incoming.kind} env={previewEnv} maxW={180} maxH={140} />
          </div>
        )}
        {manageOpen && (
          <ThemeManager
            list={themes.list}
            currentId={theme.id}
            actions={manageActions}
            onClose={() => setManageOpen(false)}
          />
        )}
        {themeDlg && (
          <ThemeDialog
            key={themeDlg.mode === 'edit' ? themeDlg.theme.id : 'create'}
            mode={themeDlg.mode}
            initialName={
              themeDlg.mode === 'edit'
                ? themeDlg.theme.name
                : uniqueName(
                    okThemes.map((s) => s.name),
                    '새 테마',
                  )
            }
            initialLook={lookOf(themeDlg.mode === 'edit' ? themeDlg.theme : theme)}
            nameLocked={themeDlg.mode === 'edit' && themeDlg.builtin}
            base={themeDlg.mode === 'edit' ? themeDlg.theme : undefined}
            sources={uniqueLooks(
              okThemes
                .filter((s) => themeDlg.mode === 'create' || s.id !== themeDlg.theme.id)
                .map((s) => ({ name: s.name, look: lookOfSummary(s) })),
            )}
            takenNames={okThemes
              .filter((s) => themeDlg.mode === 'create' || s.id !== themeDlg.theme.id)
              .map((s) => s.name)}
            data={boardData}
            now={now}
            assetUrl={themeDlg.mode === 'edit' ? makeAssetUrl(themeDlg.theme) : noAsset}
            onSubmit={submitTheme}
            onCancel={() => setThemeDlg(null)}
          />
        )}
        {cutout && (
          <CutoutDialog
            themeId={theme.id}
            original={cutout}
            onCancel={() => setCutout(null)}
            onUseOriginal={() => {
              setCutout(null)
              addDecor('sticker', cutout)
            }}
            onUseCutout={(asset) => {
              setCutout(null)
              ed.dispatch({ type: 'asset/add', asset })
              addDecor('sticker', asset)
            }}
          />
        )}
        {user.editing && !editing && (
          <EventDialog
            target={user.editing}
            theme={theme}
            otherThemes={others}
            onCreate={user.events.create}
            onUpdate={user.events.update}
            onDelete={user.events.remove}
            onClose={user.closeEditor}
          />
        )}
        {user.timerDone && (
          <div className="app-banner" role="alert">
            <span>
              {user.timerDone.mode === 'focus' ? '집중 시간이 끝났어요' : '쉬는 시간이 끝났어요'}
              {user.timerDone.late && ' (앱이 꺼져 있는 동안)'}
              {user.timerDone.next &&
                (user.timerDone.next.started
                  ? ` · ${PHASE_LABEL[user.timerDone.next.phase]} 시작`
                  : ` · 다음은 ${PHASE_LABEL[user.timerDone.next.phase]}`)}
            </span>
            <button type="button" onClick={user.dismissTimerDone}>
              확인
            </button>
          </div>
        )}
        {ed.notice && (
          <div className="app-notice" role="status">
            {ed.notice}
          </div>
        )}
      </main>
    </div>
  )
}

/** 방향키: 자유 아이템은 1px(Shift 10px), 블록은 한 칸 */
function nudge(ed: EditorApi, c: { dx: number; dy: number; big: boolean }) {
  const s = ed.selection
  if (!s) return
  if (s.kind === 'free') {
    const f = ed.theme.freeItems.find((x) => x.id === s.id)
    if (!f) return
    const step = c.big ? 10 : 1
    ed.dispatch(
      { type: 'free/update', id: f.id, patch: { x: f.x + c.dx * step, y: f.y + c.dy * step } },
      { groupKey: `nudge:${f.id}` },
    )
  } else {
    const b = ed.theme.blocks.find((x) => x.id === s.id)
    if (b) ed.dispatch({ type: 'block/move', id: b.id, col: b.col + c.dx, row: b.row + c.dy })
  }
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

/** 날짜 표시용 시계(분 단위). 자정이 지나면 캘린더/투두 섹션이 다음 날로 넘어간다. 카운트다운에는 쓰지 않는다. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let t: number
    const tick = () => {
      setNow(new Date())
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    }
    t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    const onFocus = () => setNow(new Date()) // 절전 복귀 후 바로 맞춘다
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return now
}

/** 페이지의 주 시작 요일: 보드의 첫 캘린더 블록 설정을 따른다(없으면 일요일) */
function weekStartsOf(t: Theme): 0 | 1 {
  for (const b of t.blocks) if (b.type === 'calendar') return b.props.weekStartsOn
  return 0
}
