import { SettingsSchema, type Settings } from '@kkumikkumi/schema'
import { z } from 'zod'
import { NoInput } from '../inputs'
import { assertTheme, getSettings, type HandlerDeps, type HandlersOf } from './deps'

export function settingsHandlers(d: HandlerDeps): HandlersOf<'settings'> {
  return {
    'settings.get': async (i) => {
      NoInput.parse(i)
      return getSettings(d)
    },
    'settings.update': async (i) => {
      const { patch } = z
        .strictObject({
          patch: SettingsSchema.pick({
            activeThemeId: true,
            petEnabled: true,
            autoSwitchEnabled: true,
            manualOverride: true,
          }).partial(),
        })
        .parse(i)
      if (patch.activeThemeId) await assertTheme(d, patch.activeThemeId)
      if (patch.manualOverride) await assertTheme(d, patch.manualOverride.themeId)
      const next: Settings = { ...getSettings(d) }
      if (patch.activeThemeId !== undefined) next.activeThemeId = patch.activeThemeId
      if (patch.petEnabled !== undefined) next.petEnabled = patch.petEnabled
      if (patch.autoSwitchEnabled !== undefined) next.autoSwitchEnabled = patch.autoSwitchEnabled
      if (patch.manualOverride !== undefined) next.manualOverride = patch.manualOverride
      return d.repos.settings.save(next)
    },
  }
}
