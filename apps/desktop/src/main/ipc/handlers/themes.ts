import {
  FontId,
  HexColor,
  Name,
  PaletteSchema,
  PatternSchema,
  THEME_TEMPLATE_IDS,
  ThemeSchema,
  type Settings,
} from '@kkumikkumi/schema'
import { z } from 'zod'
import { transaction } from '../../db/connection'
import { IdIn, IdNameIn, NoInput } from '../inputs'
import { getSettings, type HandlerDeps, type HandlersOf } from './deps'

export function themeHandlers(d: HandlerDeps): HandlersOf<'themes'> {
  const graceMs = d.pruneGraceMs ?? 10 * 60 * 1000
  const { repos, themes } = d
  return {
    'themes.list': async (i) => {
      NoInput.parse(i)
      return themes.list()
    },
    'themes.get': async (i) => themes.read(IdIn.parse(i).id),
    'themes.create': async (i) => {
      const opts = z
        .strictObject({
          name: Name,
          palette: PaletteSchema,
          background: z.strictObject({ color: HexColor, pattern: PatternSchema.nullable() }),
          fontId: FontId,
          template: z.enum(THEME_TEMPLATE_IDS),
        })
        .parse(i)
      return themes.create(opts)
    },
    'themes.save': async (i) => {
      const { theme } = z.strictObject({ theme: ThemeSchema }).parse(i)
      return themes.save({ ...theme, updatedAt: d.now() })
    },
    'themes.duplicate': async (i) => {
      const { id, name } = IdNameIn.parse(i)
      return themes.duplicate(id, name)
    },
    'themes.rename': async (i) => {
      const { id, name } = IdNameIn.parse(i)
      return themes.rename(id, name)
    },
    'themes.delete': async (i) => {
      const { id } = IdIn.parse(i)
      await themes.delete(id) // 마지막 테마면 last_theme
      const remaining = (await themes.list()).filter((s) => s.ok)
      const s = getSettings(d)
      const next: Settings = {
        ...s,
        activeThemeId: s.activeThemeId === id ? remaining[0]!.id : s.activeThemeId,
        manualOverride: s.manualOverride?.themeId === id ? null : s.manualOverride,
      }
      transaction(d.db, () => {
        repos.themeRules.deleteByTheme(id)
        repos.settings.save(next)
      })
      return next
    },
    'themes.resetBuiltin': async (i) => themes.resetBuiltin(IdIn.parse(i).id),
    'themes.pruneAssets': async (i) => themes.pruneAssets(IdIn.parse(i).id, graceMs),
  }
}
