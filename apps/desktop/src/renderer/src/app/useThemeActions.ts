import type { Theme } from '@kkumikkumi/schema'
import { useCallback, useMemo, useState } from 'react'
import type { ThemeSummary } from '../../../shared/api'
import { uniqueName } from '../board/timetable'
import type { ThemeDialogResult } from './ThemeDialog'
import { applyLook } from './themeLook'
import type { ThemeManagerActions } from './ThemeManager'
import type { AppPage, ThemeMenu } from './TitleBar'

const THEME_ERRORS: Record<string, string> = {
  builtin_theme: '기본 테마는 이름을 바꾸거나 지울 수 없어요',
  last_theme: '마지막 테마는 지울 수 없어요',
  not_found: '테마를 찾지 못했어요',
  invalid_input: '입력한 값을 확인해 주세요',
  invalid_schema: '테마를 저장할 수 없는 상태예요',
}
const errText = (code: string) => THEME_ERRORS[code] ?? `실패했어요 (${code})`

export type OkThemeSummary = Extract<ThemeSummary, { ok: true }>

/** 테마 만들기/수정 창 */
export type ThemeDlgState =
  { mode: 'create' } | { mode: 'edit'; theme: Theme; builtin: boolean } | null

export interface ThemeActions {
  /** 없으면(App이 테마 바꾸기를 넘기지 않음) 타이틀바는 이름만 보여 준다 */
  themeMenu: ThemeMenu | undefined
  okThemes: OkThemeSummary[]
  themeDlg: ThemeDlgState
  closeThemeDlg(): void
  submitTheme(res: ThemeDialogResult): Promise<string | null>
  manageOpen: boolean
  closeManage(): void
  manageActions: ThemeManagerActions
}

/** 타이틀바 테마 메뉴, 테마 만들기/수정 창, 테마 관리 창의 동작 */
export function useThemeActions({
  theme,
  page,
  themes,
  flushTheme,
  flushMemoEdits,
  showNotice,
  onSwitchTheme,
}: {
  theme: Theme
  page: AppPage
  themes: { list: ThemeSummary[]; refresh(): Promise<void> }
  flushTheme(): Promise<void>
  flushMemoEdits(): Promise<void>
  showNotice(text: string): void
  onSwitchTheme: ((id: string, page: AppPage) => Promise<boolean>) | undefined
}): ThemeActions {
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

  const [themeDlg, setThemeDlg] = useState<ThemeDlgState>(null)
  const [manageOpen, setManageOpen] = useState(false)

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

  return {
    themeMenu,
    okThemes,
    themeDlg,
    closeThemeDlg: () => setThemeDlg(null),
    submitTheme,
    manageOpen,
    closeManage: () => setManageOpen(false),
    manageActions,
  }
}
