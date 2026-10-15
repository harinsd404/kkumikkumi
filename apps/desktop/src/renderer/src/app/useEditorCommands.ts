import type { Asset } from '@kkumikkumi/schema'
import { useCallback, useEffect, useState } from 'react'
import type { Point } from '../editor/state/geometry'
import { newFreeItem } from '../editor/state/reducer'
import { keyToCommand } from '../editor/state/shortcuts'
import type { EditorApi } from '../editor/useEditor'
import type { WidgetKind } from '../editor/WidgetGallery'
import { isModalOpen } from './Modal'

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/** 편집 모드 켜고 끄기, 추가/복제/삭제, 편집 중 키보드 단축키 */
export function useEditorCommands(ed: EditorApi, themeId: string) {
  const [editing, setEditing] = useState(false)

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
    await window.kkumi.invoke('themes.pruneAssets', { id: themeId })
  }, [ed, themeId])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      // 대화창이 열려 있으면 뒤의 보드를 건드리지 않는다
      if (isModalOpen()) return
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

  const startEdit = useCallback(() => setEditing(true), [])

  return { editing, startEdit, exitEdit, addDecor, addBlock, duplicate, remove }
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
