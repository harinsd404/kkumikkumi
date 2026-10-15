import type { Asset } from '@kkumikkumi/schema'
import { useState, type ComponentProps } from 'react'
import type { ImportedAsset, TimetableData } from '../../../shared/api'
import { Inspector } from '../editor/Inspector'
import type { EditorApi, Selection } from '../editor/useEditor'
import { WidgetGallery } from '../editor/WidgetGallery'
import type { useEditorCommands } from './useEditorCommands'
import type { MemoStore } from './useMemos'
import type { UserData } from './useUserData'

export type PanelTab = 'add' | 'settings'

/** 편집 패널 탭: 고른 것이 생기면 설정, 없어지면 위젯 추가 */
export function usePanelTab(selection: Selection) {
  const [panelTab, setPanelTab] = useState<PanelTab>('add')
  const [prevSel, setPrevSel] = useState(selection)
  if (prevSel !== selection) {
    setPrevSel(selection)
    if (!!selection !== !!prevSel) setPanelTab(selection ? 'settings' : 'add')
  }
  return [panelTab, setPanelTab] as const
}

type Commands = ReturnType<typeof useEditorCommands>

/** 편집 모드 오른쪽 패널: 위젯 추가(갤러리) / 설정(인스펙터) */
export function EditPanel({
  ed,
  tab,
  onTab,
  env,
  onPick,
  importAsset,
  commands,
  onCutout,
  user,
  memos,
  timetables,
  otherThemes,
}: {
  ed: EditorApi
  tab: PanelTab
  onTab(tab: PanelTab): void
  env: ComponentProps<typeof WidgetGallery>['env']
  onPick: ComponentProps<typeof WidgetGallery>['onPick']
  importAsset(src: { dialog: true }): Promise<ImportedAsset | null>
  commands: Pick<Commands, 'addDecor' | 'duplicate' | 'remove'>
  /** 흰 배경 스티커: 지울지 물어본다 */
  onCutout(asset: Asset): void
  user: UserData
  memos: MemoStore
  timetables: TimetableData | undefined
  otherThemes: ComponentProps<typeof Inspector>['otherThemes']
}) {
  return (
    <aside className="edit-panel" aria-label="편집">
      <div className="edit-tabs" role="tablist" aria-label="편집 패널">
        <button type="button" role="tab" aria-selected={tab === 'add'} onClick={() => onTab('add')}>
          위젯 추가
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'settings'}
          onClick={() => onTab('settings')}
        >
          {ed.selection ? '설정' : '테마 설정'}
        </button>
      </div>
      {tab === 'add' ? (
        <WidgetGallery
          env={env}
          onPick={onPick}
          onAddDecor={async (kind) => {
            const r = await importAsset({ dialog: true })
            if (!r) return
            // 스티커로 넣을 때만, 흰 배경이면 지울지 물어본다
            if (kind === 'sticker' && r.whiteBackground) onCutout(r.asset)
            else commands.addDecor(kind, r.asset)
          }}
        />
      ) : (
        <Inspector
          ed={ed}
          pickImage={async () => (await importAsset({ dialog: true }))?.asset ?? null}
          onDuplicate={commands.duplicate}
          onDelete={commands.remove}
          todoLists={user.lists}
          memos={memos}
          timetables={timetables}
          otherThemes={otherThemes}
          events={user.actions.calendar}
        />
      )}
    </aside>
  )
}
