// IPC 채널 이름 목록. preload는 이 목록에 있는 채널만 호출을 허용한다(의존성 없는 파일로 유지).
export const CHANNELS = [
  'themes.list',
  'themes.get',
  'themes.create',
  'themes.save',
  'themes.duplicate',
  'themes.rename',
  'themes.delete',
  'themes.pruneAssets',
  'assets.importFromDialog',
  'assets.importBytes',
  'settings.get',
  'settings.update',
  'todo.lists.list',
  'todo.lists.create',
  'todo.lists.update',
  'todo.lists.delete',
  'todo.items.list',
  'todo.items.create',
  'todo.items.update',
  'todo.items.delete',
  'todo.items.reorder',
  'todo.items.dueBetween',
  'calendar.range',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'timer.get',
  'timer.save',
  'themeRules.list',
  'themeRules.create',
  'themeRules.update',
  'themeRules.delete',
] as const

export type Channel = (typeof CHANNELS)[number]

export const isChannel = (c: unknown): c is Channel =>
  typeof c === 'string' && (CHANNELS as readonly string[]).includes(c)
