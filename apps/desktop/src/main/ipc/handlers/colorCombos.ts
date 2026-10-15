import { LookColorsSchema, MAX_COLOR_COMBOS, Name } from '@kkumikkumi/schema'
import { ConflictError } from '../../db/repos'
import { IdIn, NoInput } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

/** 내 색 조합: 테마 만들기 창에서 저장해 두고 다시 고르는 색 묶음(최대 30개, 최근 것이 앞) */
export function colorComboHandlers(d: HandlerDeps): HandlersOf<'colorCombos'> {
  const { repos } = d
  return {
    'colorCombos.list': async (i) => {
      NoInput.parse(i)
      return repos.settings.colorCombos()
    },
    'colorCombos.add': async (i) => {
      const { name, ...colors } = LookColorsSchema.extend({ name: Name }).parse(i)
      const list = repos.settings.colorCombos()
      if (list.length >= MAX_COLOR_COMBOS) throw new ConflictError('color_combo_limit')
      const combo = { id: d.newId(), name, ...colors, createdAt: d.now() }
      repos.settings.saveColorCombos([combo, ...list])
      return combo
    },
    'colorCombos.delete': async (i) => {
      const { id } = IdIn.parse(i)
      const list = repos.settings.colorCombos()
      repos.settings.saveColorCombos(list.filter((c) => c.id !== id.toLowerCase()))
      return null
    },
  }
}
