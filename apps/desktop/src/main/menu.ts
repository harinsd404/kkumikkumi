import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import type { SettingsSection } from '../shared/api'

/**
 * 앱 메뉴. 기본 메뉴의 "보기 → 다시 불러오기/개발자 도구"는 개발 중에만 둔다.
 * 편집 메뉴는 입력 칸의 복사·붙여넣기 단축키에 필요하다.
 */
/** section: 설정 페이지에서 바로 보여 줄 구역(null이면 맨 위) */
export function setAppMenu(h: { openSettings(section: SettingsSection | null): void }): void {
  const dev = !app.isPackaged
  const template: MenuItemConstructorOptions[] = [
    {
      ...(process.platform === 'darwin' ? { role: 'appMenu' as const } : { label: '꾸미꾸미' }),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: '설정…', accelerator: 'CmdOrCtrl+,', click: () => h.openSettings(null) },
        { label: 'AI 연결…', click: () => h.openSettings('mcp') },
        { type: 'separator' },
        ...(process.platform === 'darwin'
          ? ([
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: '보기',
      submenu: [
        ...(dev
          ? ([
              { role: 'reload' },
              { role: 'toggleDevTools' },
              { type: 'separator' },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      label: '도움말',
      submenu: [
        {
          label: '오류 기록 폴더 열기',
          click: () => void shell.openPath(app.getPath('logs')),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
