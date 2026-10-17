import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'

/**
 * 앱 메뉴. 기본 메뉴의 "보기 → 다시 불러오기/개발자 도구"는 개발 중에만 둔다.
 * 편집 메뉴는 입력 칸의 복사·붙여넣기 단축키에 필요하다.
 */
export function setAppMenu(h: { openMcpSettings(): void }): void {
  const dev = !app.isPackaged
  const template: MenuItemConstructorOptions[] = [
    {
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'AI 연결…', click: () => h.openMcpSettings() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
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
