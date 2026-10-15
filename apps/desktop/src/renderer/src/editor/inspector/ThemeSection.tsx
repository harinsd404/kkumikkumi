import type { Palette } from '@kkumikkumi/schema'
import type { SwatchGroup } from '../../app/colorGroups'
import { ColorField, FontSelect, Row, Section, Segmented } from '../fields'
import type { EditorApi } from '../useEditor'

const PALETTE_LABEL: Record<keyof Palette, string> = {
  text: '제목 글자',
  subText: '보조 글자',
  accent: '강조(외곽선)',
  check: '체크',
  surface: '칸 배경',
  control: '버튼',
}

/** 아무것도 고르지 않았을 때: 테마 배경, 팔레트, 기본 글꼴 */
export function ThemeSection({
  ed,
  swatches,
}: {
  ed: EditorApi
  swatches: readonly SwatchGroup[]
}) {
  const t = ed.theme
  const palette = t.defaults.palette
  return (
    <>
      <Section title="배경">
        {t.background.type === 'color' ? (
          <>
            <ColorField
              label="배경색"
              value={t.background.color}
              swatches={swatches}
              onChange={(c) =>
                c &&
                ed.dispatch({ type: 'theme/background', patch: { color: c } }, { groupKey: 'bg' })
              }
            />
            <Segmented
              label="무늬"
              value={t.background.pattern?.id ?? 'none'}
              options={[
                { value: 'none', label: '없음' },
                { value: 'stars', label: '별' },
                { value: 'dots', label: '점' },
              ]}
              onChange={(id) => {
                const bg = t.background.type === 'color' ? t.background : null
                ed.dispatch({
                  type: 'theme/background',
                  patch: {
                    pattern:
                      id === 'none' ? null : { id, color: bg?.pattern?.color ?? palette.subText },
                  },
                })
              }}
            />
            {t.background.pattern && (
              <ColorField
                label="무늬 색"
                value={t.background.pattern.color}
                swatches={swatches}
                onChange={(c) => {
                  const p = t.background.type === 'color' ? t.background.pattern : null
                  if (c && p)
                    ed.dispatch(
                      { type: 'theme/background', patch: { pattern: { ...p, color: c } } },
                      { groupKey: 'pattern' },
                    )
                }}
              />
            )}
          </>
        ) : (
          <p className="ki-note">이미지 배경은 아직 편집할 수 없어요.</p>
        )}
      </Section>
      <Section title="팔레트">
        {(Object.keys(PALETTE_LABEL) as (keyof Palette)[]).map((k) => (
          <ColorField
            key={k}
            label={PALETTE_LABEL[k]}
            value={palette[k]}
            swatches={swatches}
            onChange={(c) =>
              c &&
              ed.dispatch(
                { type: 'theme/palette', patch: { [k]: c } },
                { groupKey: `palette:${k}` },
              )
            }
          />
        ))}
      </Section>
      <Section title="글꼴">
        <Row label="기본 글꼴">
          <FontSelect
            value={t.defaults.fontId}
            onChange={(fontId) => ed.dispatch({ type: 'theme/font', fontId })}
          />
        </Row>
      </Section>
      <p className="ki-note">블록이나 꾸미기를 누르면 그 설정이 보여요.</p>
    </>
  )
}
