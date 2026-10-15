import type { Theme } from '@kkumikkumi/schema'
import type { ThemeSummary } from '../../../shared/api'
import type { BoardData } from '../board/BoardContext'
import { uniqueName } from '../board/timetable'
import { makeAssetUrl } from './assetUrl'
import { ThemeDialog } from './ThemeDialog'
import { lookOf, lookOfSummary, uniqueLooks } from './themeLook'
import { ThemeManager } from './ThemeManager'
import { useColorCombos } from './useColorCombos'
import type { ThemeActions } from './useThemeActions'

const noAsset = () => null

/** 테마 관리 창과 테마 만들기/수정 창(열려 있을 때만) */
export function ThemeDialogs({
  actions: a,
  list,
  theme,
  data,
  now,
}: {
  actions: ThemeActions
  list: readonly ThemeSummary[]
  /** 지금 테마(관리 창의 현재 표시, 새 테마의 처음 외형) */
  theme: Theme
  data: BoardData
  now: Date
}) {
  const dlg = a.themeDlg
  const combos = useColorCombos()
  return (
    <>
      {a.manageOpen && (
        <ThemeManager
          list={list}
          currentId={theme.id}
          actions={a.manageActions}
          onClose={a.closeManage}
        />
      )}
      {dlg && (
        <ThemeDialog
          key={dlg.mode === 'edit' ? dlg.theme.id : 'create'}
          mode={dlg.mode}
          initialName={
            dlg.mode === 'edit'
              ? dlg.theme.name
              : uniqueName(
                  a.okThemes.map((s) => s.name),
                  '새 테마',
                )
          }
          initialLook={lookOf(dlg.mode === 'edit' ? dlg.theme : theme)}
          nameLocked={dlg.mode === 'edit' && dlg.builtin}
          base={dlg.mode === 'edit' ? dlg.theme : undefined}
          sources={uniqueLooks(
            a.okThemes
              .filter((s) => dlg.mode === 'create' || s.id !== dlg.theme.id)
              .map((s) => ({ name: s.name, look: lookOfSummary(s) })),
          )}
          takenNames={a.okThemes
            .filter((s) => dlg.mode === 'create' || s.id !== dlg.theme.id)
            .map((s) => s.name)}
          combos={combos.list}
          onSaveCombo={combos.add}
          onDeleteCombo={combos.remove}
          data={data}
          now={now}
          assetUrl={dlg.mode === 'edit' ? makeAssetUrl(dlg.theme) : noAsset}
          onSubmit={a.submitTheme}
          onCancel={a.closeThemeDlg}
        />
      )}
    </>
  )
}
