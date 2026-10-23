import type { SyncReadiness } from '../../../shared/api'

export interface SyncFocus {
  kind: 'input' | 'textarea' | 'contenteditable' | 'other'
  type?: string
  readOnly?: boolean
  disabled?: boolean
  connectionControls?: boolean
}

/** Connection credentials and immediate controls do not contain a content draft.
 * Text/date/time editors can save on blur, so keep their drafts in place.
 */
export function holdsSyncDraft(focus: SyncFocus): boolean {
  if (focus.connectionControls || focus.readOnly || focus.disabled) return false
  if (focus.kind === 'input')
    return ![
      'checkbox',
      'radio',
      'range',
      'color',
      'button',
      'submit',
      'reset',
      'file',
      'hidden',
      'image',
    ].includes(focus.type ?? 'text')
  return focus.kind === 'textarea' || focus.kind === 'contenteditable'
}

export function focusedSyncControl(doc: Document): SyncFocus {
  const el = doc.activeElement
  const connectionControls = !!el?.closest('[data-sync-controls]')
  if (el instanceof HTMLInputElement)
    return {
      kind: 'input',
      type: el.type,
      readOnly: el.readOnly,
      disabled: el.disabled,
      connectionControls,
    }
  if (el instanceof HTMLTextAreaElement)
    return { kind: 'textarea', readOnly: el.readOnly, disabled: el.disabled, connectionControls }
  return {
    kind: el instanceof HTMLElement && el.isContentEditable ? 'contenteditable' : 'other',
    connectionControls,
  }
}

export async function prepareRendererSync(d: {
  focus(): SyncFocus
  draftOpen(): boolean
  save(): Promise<boolean>
}): Promise<SyncReadiness> {
  const editing = () => holdsSyncDraft(d.focus()) || d.draftOpen()
  if (editing()) return 'editing'
  if (!(await d.save())) return 'save_failed'
  return editing() ? 'editing' : 'ready'
}
