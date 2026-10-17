import type { Asset, Theme } from '@kkumikkumi/schema'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Board } from '../board/Board'
import type { BoardActions } from '../board/BoardContext'
import { useMinuteClock } from '../board/useMinuteClock'
import { EditorOverlay } from '../editor/EditorOverlay'
import { useEditor } from '../editor/useEditor'
import { WidgetPreview } from '../editor/WidgetGallery'
import { makeAssetUrl } from './assetUrl'
import { otherThemes } from './colorGroups'
import { CutoutDialog } from './CutoutDialog'
import { EditPanel, usePanelTab } from './EditPanel'
import { EventDialog } from './EventDialog'
import { McpDialog } from './McpDialog'
import { PageHost } from './PageHost'
import { ThemeDialogs } from './ThemeDialogs'
import { themeColorVars } from './themeVars'
import { TimerDoneBanner } from './TimerDoneBanner'
import { TitleBar, type AppPage, type PageNav } from './TitleBar'
import { useAssetImport } from './useAssetImport'
import { useEditorCommands } from './useEditorCommands'
import { useMemos } from './useMemos'
import { useThemeActions } from './useThemeActions'
import { useThemes } from './useThemes'
import { useTimetable } from './useTimetable'
import { useUserData } from './useUserData'
import { useWidgetDrag } from './useWidgetDrag'

/** 구현된 화면(세부 페이지는 단계별로 추가) */
const PAGES: PageNav['pages'] = [
  { id: 'board', label: '보드' },
  { id: 'todo', label: '할 일' },
  { id: 'timer', label: '타이머' },
  { id: 'memo', label: '메모' },
  { id: 'timetable', label: '시간표' },
]

/** 모듈 수준 함수(안정 참조): 자동 저장기가 매 렌더 새로 만들어지지 않도록 */
async function saveTheme(theme: Theme) {
  const r = await window.kkumi.invoke('themes.save', { theme })
  return r.ok ? ({ ok: true } as const) : ({ ok: false, code: r.error.code } as const)
}

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
  const theme = ed.theme
  const cmd = useEditorCommands(ed, theme.id)
  const editing = cmd.editing
  const [panelTab, setPanelTab] = usePanelTab(ed.selection)
  const drag = useWidgetDrag(ed, cmd.addBlock)
  const assets = useAssetImport(ed, theme.id, cmd.addDecor)
  /** 흰 배경 스티커: 지울지 물어보는 중인 원본 에셋 */
  const [cutout, setCutout] = useState<Asset | null>(null)
  /** 앱 메뉴 "AI 연결…" */
  const [mcpOpen, setMcpOpen] = useState(false)
  useEffect(() => window.kkumi.onOpenMcpSettings(() => setMcpOpen(true)), [])
  const [page, setPage] = useState<AppPage>(initialPage)
  /** 할 일 화면에서 달력을 크게 보는 중(캘린더·디데이 블록에서 들어오면 크게) */
  const [todoBig, setTodoBig] = useState(false)
  const themes = useThemes()
  /** 메모 블록에서 들어오면 그 메모를 연다 */
  const [memoOpen, setMemoOpen] = useState<string | null>(null)
  // 블록의 "크게 보기" 버튼이 세부 페이지로 보낸다
  const memoToggle = memos.toggle
  const timetableSelect = timetable.select
  const boardActions = useMemo<BoardActions>(
    () => ({
      ...user.actions,
      memo: { toggle: memoToggle },
      timetable: { select: (id) => void timetableSelect(id) },
      pages: {
        todo: () => {
          setTodoBig(false)
          setPage('todo')
        },
        calendar: () => {
          setTodoBig(true)
          setPage('todo')
        },
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
  const themeActions = useThemeActions({
    theme,
    page,
    themes,
    flushTheme: ed.flush,
    flushMemoEdits: memos.flush,
    showNotice: ed.showNotice,
    onSwitchTheme,
  })

  // 창을 닫을 때 남은 변경 저장. 입력 칸의 포커스를 먼저 빼서 blur 때 저장하는 칸(할 일 제목·메모 등)도 저장한다.
  const flushMemos = memos.flush
  const flushUser = user.flush
  useEffect(() => {
    window.kkumi.onBeforeClose(async () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      await Promise.all([ed.flush(), flushMemos(), flushUser()])
    })
  }, [ed, flushMemos, flushUser])

  const { incoming, toCanvasRef } = drag
  return (
    <div className="app" style={themeColorVars(theme)}>
      <TitleBar
        themeName={theme.name}
        themeMenu={editing ? undefined : themeActions.themeMenu}
        editing={editing}
        onToggleEdit={() => (editing ? void cmd.exitEdit() : cmd.startEdit())}
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
        <PageHost
          page={page}
          theme={theme}
          user={user}
          memos={memos}
          memoOpen={memoOpen}
          timetable={timetable}
          now={now}
          todoBig={todoBig}
          onTodoBig={setTodoBig}
        />
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
                        onDropFile={assets.onDropFile}
                      />
                    )
                  : undefined
              }
            />
          </div>
        )}
        {editing && page === 'board' && (
          <EditPanel
            ed={ed}
            tab={panelTab}
            onTab={setPanelTab}
            env={previewEnv}
            onPick={drag.pickWidget}
            importAsset={assets.importAsset}
            commands={cmd}
            onCutout={setCutout}
            user={user}
            memos={memos}
            timetables={timetable.data}
            otherThemes={others}
          />
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
        <ThemeDialogs
          actions={themeActions}
          list={themes.list}
          theme={theme}
          data={boardData}
          now={now}
        />
        {mcpOpen && <McpDialog onClose={() => setMcpOpen(false)} />}
        {cutout && (
          <CutoutDialog
            themeId={theme.id}
            original={cutout}
            onCancel={() => setCutout(null)}
            onUseOriginal={() => {
              setCutout(null)
              cmd.addDecor('sticker', cutout)
            }}
            onUseCutout={(asset) => {
              setCutout(null)
              ed.dispatch({ type: 'asset/add', asset })
              cmd.addDecor('sticker', asset)
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
          <TimerDoneBanner done={user.timerDone} onDismiss={user.dismissTimerDone} />
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
