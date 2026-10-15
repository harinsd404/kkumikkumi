import { ThemeRuleSchema } from '@kkumikkumi/schema'
import { z } from 'zod'
import { NotFoundError } from '../../db/repos'
import { IdIn, NoInput } from '../inputs'
import { assertTheme, type HandlerDeps, type HandlersOf } from './deps'

/** 테마 자동 전환 규칙 */
export function themeRuleHandlers(d: HandlerDeps): HandlersOf<'themeRules'> {
  const { repos } = d
  return {
    'themeRules.list': async (i) => {
      NoInput.parse(i)
      return repos.themeRules.list()
    },
    'themeRules.create': async (i) => {
      const { rule } = z
        .strictObject({
          rule: ThemeRuleSchema.omit({ id: true, createdAt: true, updatedAt: true }),
        })
        .parse(i)
      await assertTheme(d, rule.themeId)
      const now = d.now()
      return repos.themeRules.insert({ ...rule, id: d.newId(), createdAt: now, updatedAt: now })
    },
    'themeRules.update': async (i) => {
      const { rule } = z
        .strictObject({ rule: ThemeRuleSchema.omit({ createdAt: true, updatedAt: true }) })
        .parse(i)
      await assertTheme(d, rule.themeId)
      const cur = repos.themeRules.list().find((r) => r.id === rule.id)
      if (!cur) throw new NotFoundError('theme_rule')
      return repos.themeRules.update({ ...rule, createdAt: cur.createdAt, updatedAt: d.now() })
    },
    'themeRules.delete': async (i) => {
      repos.themeRules.delete(IdIn.parse(i).id)
      return null
    },
  }
}
