import type { Asset, Theme } from '@kkumikkumi/schema'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Board } from '../board/Board'
import type { BoardData } from '../board/BoardContext'
import { EditorOverlay } from '../editor/EditorOverlay'
import { Inspector } from '../editor/Inspector'
import type { Point } from '../editor/state/geometry'
import { newFreeItem } from '../editor/state/reducer'
import { keyToCommand } from '../editor/state/shortcuts'
import { useEditor, type EditorApi } from '../editor/useEditor'
import { makeAssetUrl } from './assetUrl'
import { TitleBar } from './TitleBar'

const ASSET_ERRORS: Record<string, string> = {
  unsupported_format: 'PNG, JPG, WebP 이미지만 넣을 수 있어요',
  too_large_input: '파일이 너무 커요 (25MB까지)',
  too_many_pixels: '해상도가 너무 커요',
  decode_failed: '이미지를 읽을 수 없어요',
  too_large_output: '이미지가 너무 커서 줄여도 5MB를 넘어요',
  invalid_input: '파일이 너무 커요',
}

/** 모듈 수준 함수(안정 참조): 자동 저장기가 매 렌더 새로 만들어지지 않도록 */
async function saveTheme(theme: Theme) {
  const r = await window.kkumi.invoke('themes.save', { theme })
  return r.ok ? ({ ok: true } as const) : ({ ok: false, code: r.error.code } as const)
}

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export function BoardScreen({ initialTheme, data }: { initialTheme: Theme; data: BoardData }) {
  const ed = useEditor(initialTheme, { save: saveTheme })
  const [editing, setEditing] = useState(false)
  const theme = ed.theme
  const assetUrl = useMemo(() => makeAssetUrl(theme), [theme])

  // 창을 닫을 때 남은 변경 저장
  useEffect(() => {
    window.kkumi.onBeforeClose(() => ed.flush())
  }, [ed])

  const importAsset = useCallback(
    async (
      src: { dialog: true } | { bytes: Uint8Array },
    ): Promise<{ asset: Asset; hasTransparency: boolean } | null> => {
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
    <div className="app">
      <TitleBar
        themeName={theme.name}
        editing={editing}
        onToggleEdit={() => (editing ? void exitEdit() : setEditing(true))}
        tools={{
          onAddBlock: (type, size) => {
            const id = crypto.randomUUID()
            if (ed.dispatch({ type: 'block/add', block: { type, size }, id }))
              ed.select({ kind: 'block', id })
          },
          onAddDecor: async (kind) => {
            const r = await importAsset({ dialog: true })
            if (r) addDecor(kind, r.asset)
          },
          onUndo: ed.undo,
          onRedo: ed.redo,
          canUndo: ed.canUndo,
          canRedo: ed.canRedo,
          status: ed.status,
        }}
      />
      <main className="app-board">
        <Board
          theme={theme}
          assetUrl={assetUrl}
          data={data}
          mode={editing ? 'edit' : 'use'}
          overlay={
            editing
              ? (scale) => (
                  <EditorOverlay
                    ed={ed}
                    scale={scale}
                    onDropFile={async (file, at) => {
                      const bytes = new Uint8Array(await file.arrayBuffer())
                      const r = await importAsset({ bytes })
                      // 투명 영역이 있으면 스티커(잘리지 않게), 아니면 이미지
                      if (r) addDecor(r.hasTransparency ? 'sticker' : 'image', r.asset, at)
                    }}
                  />
                )
              : undefined
          }
        />
        {editing && (
          <Inspector
            ed={ed}
            pickImage={async () => (await importAsset({ dialog: true }))?.asset ?? null}
            onDuplicate={duplicate}
            onDelete={remove}
          />
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
