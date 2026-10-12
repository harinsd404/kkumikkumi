import { ThemeRuleSchema, type ThemeRule } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { bool, int, NotFoundError, type Row } from './rows'

const toRule = (r: Row): ThemeRule =>
  ThemeRuleSchema.parse({
    id: r['id'],
    themeId: r['theme_id'],
    enabled: bool(r['enabled']!),
    priority: r['priority'],
    conditions: JSON.parse(String(r['conditions'])),
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  })

export class ThemeRuleRepo {
  constructor(private readonly db: Db) {}

  list(): ThemeRule[] {
    return (
      this.db
        .prepare('SELECT * FROM theme_rules ORDER BY priority DESC, created_at DESC')
        .all() as Row[]
    ).map(toRule)
  }

  insert(rule: ThemeRule): ThemeRule {
    const r = ThemeRuleSchema.parse(rule)
    this.db
      .prepare(
        `INSERT INTO theme_rules (id, theme_id, enabled, priority, conditions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        r.id,
        r.themeId,
        int(r.enabled),
        r.priority,
        JSON.stringify(r.conditions),
        r.createdAt,
        r.updatedAt,
      )
    return r
  }

  update(rule: ThemeRule): ThemeRule {
    const r = ThemeRuleSchema.parse(rule)
    const { changes } = this.db
      .prepare(
        'UPDATE theme_rules SET theme_id = ?, enabled = ?, priority = ?, conditions = ?, updated_at = ? WHERE id = ?',
      )
      .run(r.themeId, int(r.enabled), r.priority, JSON.stringify(r.conditions), r.updatedAt, r.id)
    if (changes === 0) throw new NotFoundError('theme_rule')
    return r
  }

  delete(id: string): void {
    const { changes } = this.db.prepare('DELETE FROM theme_rules WHERE id = ?').run(id)
    if (changes === 0) throw new NotFoundError('theme_rule')
  }

  /** 테마 삭제 시 그 테마를 가리키는 규칙도 지운다(테마는 파일이라 FK가 없음). */
  deleteByTheme(themeId: string): number {
    return Number(
      this.db.prepare('DELETE FROM theme_rules WHERE theme_id = ?').run(themeId).changes,
    )
  }
}
