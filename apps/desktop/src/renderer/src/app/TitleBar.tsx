import chevronDownUrl from '../board/icons/chevron-down.svg'
import { maskCss } from '../board/style'

/** 앱이 그리는 타이틀바(시안 3:1080). 신호등 버튼은 시스템 것(hiddenInset). 테마 전환 드롭다운은 M6. */
export function TitleBar({ themeName }: { themeName: string | null }) {
  return (
    <header className="app-titlebar">
      <button type="button" className="app-theme-pill" disabled title="테마 전환은 추후 지원">
        <span>꾸미꾸미{themeName ? ` · ${themeName}` : ''}</span>
        <span className="app-theme-chevron" style={maskCss(chevronDownUrl, '#4a3a36')} />
      </button>
    </header>
  )
}
