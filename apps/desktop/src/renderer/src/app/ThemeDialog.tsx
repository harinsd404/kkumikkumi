import {
  CANVAS,
  THEME_TEMPLATE_IDS,
  THEME_TEMPLATES,
  blockCells,
  type Theme,
  type ThemeLook,
  type ThemeTemplateId,
} from '@kkumikkumi/schema'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Board } from '../board/Board'
import type { BoardData } from '../board/BoardContext'
import { fontStack, FONTS } from '../board/fonts'
import { colorGroups, type ThemeColors } from './colorGroups'
import { Swatches } from './Swatches'
import {
  applyLook,
  colorOf,
  LOOK_COLORS,
  previewTheme,
  withColor,
  withColorsFrom,
  type LookColorKey,
} from './themeLook'

const HEX = /^#[0-9a-fA-F]{6}$/
const FONT_OPTIONS = Object.entries(FONTS).map(([id, f]) => ({ id, label: f.label }))
const PATTERNS = [
  { id: null, label: '없음' },
  { id: 'stars', label: '별' },
  { id: 'dots', label: '점' },
] as const

export interface ThemeDialogResult {
  name: string
  look: ThemeLook
  template: ThemeTemplateId
}

/**
 * 테마 만들기/수정 창. 왼쪽에서 이름·색·무늬·글꼴(만들 때는 배치도)을 고르고 오른쪽 미리보기로 바로 본다.
 * 수정할 때는 그 테마의 실제 배치(base)에 외형만 바꿔 미리 본다.
 */
export function ThemeDialog({
  mode,
  initialName,
  initialLook,
  nameLocked,
  base,
  sources,
  takenNames,
  data,
  now,
  assetUrl,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit'
  initialName: string
  initialLook: ThemeLook
  /** 기본 테마는 이름을 바꿀 수 없다 */
  nameLocked: boolean
  /** 수정할 테마(미리보기 배치) */
  base?: Theme | undefined
  /** 시작 색으로 가져올 수 있는 테마들 */
  sources: readonly { name: string; look: ThemeLook }[]
  /** 이미 쓰는 이름(이 테마 이름 제외) */
  takenNames: readonly string[]
  data: BoardData
  now: Date
  assetUrl(hash: string): string | null
  /** 실패하면 보여 줄 문구를 돌려준다 */
  onSubmit(r: ThemeDialogResult): Promise<string | null>
  onCancel(): void
}) {
  const [name, setName] = useState(initialName)
  const [look, setLook] = useState(initialLook)
  const [template, setTemplate] = useState<ThemeTemplateId>('classic')
  const [field, setField] = useState<LookColorKey>('bg')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  const trimmed = name.trim()
  const nameError =
    trimmed === ''
      ? '이름을 적어 주세요'
      : trimmed.length > 40
        ? '이름은 40자까지예요'
        : !nameLocked && takenNames.includes(trimmed)
          ? '같은 이름의 테마가 있어요'
          : null

  // 미리보기는 입력보다 늦게 따라와도 된다(보드 전체를 다시 그리므로)
  const preview = useMemo(
    () =>
      base ? applyLook(base, look, trimmed || base.name) : previewTheme(look, template, '미리보기'),
    [base, look, template, trimmed],
  )
  const deferred = useDeferredValue(preview)

  const swatches = useMemo(() => {
    const current: ThemeColors = {
      name: trimmed || '이 테마',
      palette: look.palette,
      bgColor: look.background.color,
    }
    const others = sources.map((s) => ({
      name: s.name,
      palette: s.look.palette,
      bgColor: s.look.background.color,
    }))
    return colorGroups(current, others)
  }, [look, sources, trimmed])

  const fields = LOOK_COLORS.filter((f) => more || !f.more)
  const allFields = look.background.pattern
    ? [...fields, { key: 'pattern' as const, label: '무늬' }]
    : fields
  const activeField = allFields.some((f) => f.key === field) ? field : 'bg'
  const activeLabel = allFields.find((f) => f.key === activeField)!.label
  const value = colorOf(look, activeField)

  const submit = async () => {
    if (nameError || busy) return
    setBusy(true)
    setError(null)
    const err = await onSubmit({ name: trimmed, look, template })
    if (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div
      className="dlg-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div className="dlg td" role="dialog" aria-modal="true" aria-labelledby="td-title">
        <h2 id="td-title" className="td-title">
          {mode === 'create' ? '새 테마 만들기' : '테마 색·글꼴 수정'}
        </h2>
        <div className="td-body">
          <div className="td-form">
            <label className="dlg-field">
              <span>이름</span>
              <input
                value={name}
                maxLength={40}
                disabled={nameLocked}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                autoFocus={!nameLocked}
              />
            </label>
            {nameLocked ? (
              <p className="td-note">기본 테마는 이름을 바꿀 수 없어요.</p>
            ) : (
              nameError &&
              trimmed !== '' && (
                <p className="dlg-error" role="alert">
                  {nameError}
                </p>
              )
            )}

            {sources.length > 0 && (
              <section className="td-section" aria-label="다른 테마 색 가져오기">
                <h3>색 가져오기</h3>
                <div className="td-sources">
                  {sources.map((s, i) => (
                    <button
                      key={`${s.name}-${i}`}
                      type="button"
                      className="td-source"
                      onClick={() => setLook((l) => withColorsFrom(l, s.look))}
                      title={`${s.name}의 색과 무늬로`}
                    >
                      <Dots look={s.look} />
                      {s.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="td-section" aria-label="색">
              <h3>색</h3>
              <div className="td-fields" role="radiogroup" aria-label="바꿀 색">
                {allFields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={f.key === activeField}
                    className="td-field"
                    onClick={() => setField(f.key)}
                  >
                    <span className="td-chip" style={{ background: colorOf(look, f.key)! }} />
                    {f.label}
                  </button>
                ))}
                <button type="button" className="td-more" onClick={() => setMore(!more)}>
                  {more ? '접기' : '더 보기'}
                </button>
              </div>
              <HexInput
                key={activeField}
                label={activeLabel}
                value={value ?? '#ffffff'}
                onChange={(c) => setLook((l) => withColor(l, activeField, c))}
              />
              <Swatches
                groups={swatches}
                value={value}
                onPick={(c) => setLook((l) => withColor(l, activeField, c))}
              />
            </section>

            <section className="td-section" aria-label="배경 무늬">
              <h3>배경 무늬</h3>
              <div className="td-seg" role="radiogroup" aria-label="배경 무늬">
                {PATTERNS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    role="radio"
                    aria-checked={(look.background.pattern?.id ?? null) === p.id}
                    onClick={() =>
                      setLook((l) => ({
                        ...l,
                        background: {
                          ...l.background,
                          pattern:
                            p.id === null
                              ? null
                              : { id: p.id, color: l.background.pattern?.color ?? l.palette.check },
                        },
                      }))
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="td-section" aria-label="글꼴">
              <h3>글꼴</h3>
              <div className="td-seg" role="radiogroup" aria-label="글꼴">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={look.fontId === f.id}
                    style={{ fontFamily: fontStack(f.id) }}
                    onClick={() => setLook((l) => ({ ...l, fontId: f.id }))}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="td-side">
            <div className="td-preview" aria-label="미리보기">
              <Board theme={deferred} assetUrl={assetUrl} data={data} mode="edit" now={now} />
            </div>
            {mode === 'create' && (
              <section className="td-section" aria-label="배치">
                <h3>배치</h3>
                <div className="td-templates" role="radiogroup" aria-label="배치">
                  {THEME_TEMPLATE_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={template === id}
                      className="td-template"
                      onClick={() => setTemplate(id)}
                    >
                      <TemplateMap id={id} />
                      <strong>{THEME_TEMPLATES[id].label}</strong>
                      <span>{THEME_TEMPLATES[id].hint}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
        {error && (
          <p className="dlg-error" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <span className="dlg-spacer" />
          <button
            type="button"
            className="is-primary"
            disabled={nameError !== null || busy}
            onClick={() => void submit()}
          >
            {mode === 'create' ? '만들기' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 대표색 점 3개(배경, 강조, 체크) */
export function Dots({ look }: { look: ThemeLook }) {
  return (
    <span className="td-dots" aria-hidden>
      {[look.background.color, look.palette.accent, look.palette.check].map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </span>
  )
}

/** 배치 템플릿 그림: 8x5 칸 위의 블록 상자 */
function TemplateMap({ id }: { id: ThemeTemplateId }) {
  return (
    <span
      className="td-map"
      aria-hidden
      style={{
        gridTemplateColumns: `repeat(${CANVAS.cols}, 1fr)`,
        gridTemplateRows: `repeat(${CANVAS.rows}, 1fr)`,
      }}
    >
      {THEME_TEMPLATES[id].blocks.map((b, i) => {
        const c = blockCells(b.type, b.size)!
        return (
          <span
            key={i}
            className={`td-map-block is-${b.type}`}
            style={{
              gridColumn: `${b.col + 1} / span ${c.w}`,
              gridRow: `${b.row + 1} / span ${c.h}`,
            }}
          />
        )
      })}
    </span>
  )
}

/** #rrggbb 입력 + 시스템 색 고르기 */
function HexInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange(c: string): void
}) {
  const [text, setText] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setText(value)
  }
  const commit = () => {
    if (HEX.test(text)) onChange(text.toLowerCase())
    else setText(value)
  }
  return (
    <div className="td-hex">
      <span>{label}</span>
      <input
        type="color"
        aria-label={`${label} 고르기`}
        value={value.slice(0, 7)}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        aria-label={`${label} 코드`}
        placeholder="#rrggbb"
        maxLength={7}
        value={text}
        onChange={(e) => setText(e.target.value.trim())}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </div>
  )
}
