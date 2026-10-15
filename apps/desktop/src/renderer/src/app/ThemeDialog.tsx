import {
  CANVAS,
  THEME_TEMPLATE_IDS,
  THEME_TEMPLATES,
  blockCells,
  type ColorCombo,
  type LookColors,
  type Theme,
  type ThemeLook,
  type ThemeTemplateId,
} from '@kkumikkumi/schema'
import { useDeferredValue, useMemo, useState } from 'react'
import { Board } from '../board/Board'
import type { BoardData } from '../board/BoardContext'
import { fontStack, FONTS } from '../board/fonts'
import { ColorPicker } from '../ui/ColorPicker'
import { ConfirmButton } from '../ui/ConfirmButton'
import { colorGroups, type SwatchGroup, type ThemeColors } from './colorGroups'
import {
  BUILTIN_COMBOS,
  KEY_SLOTS,
  lookColorsFromKeys,
  type KeyColors,
  type KeySlot,
} from './keyPalette'
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
import { ModalBackdrop } from './Modal'

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
  combos,
  data,
  now,
  assetUrl,
  onSubmit,
  onCancel,
  onSaveCombo,
  onDeleteCombo,
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
  /** 내 색 조합(저장해 둔 색 묶음) */
  combos: readonly ColorCombo[]
  data: BoardData
  now: Date
  assetUrl(hash: string): string | null
  /** 실패하면 보여 줄 문구를 돌려준다 */
  onSubmit(r: ThemeDialogResult): Promise<string | null>
  onCancel(): void
  /** 실패하면 보여 줄 문구 */
  onSaveCombo(name: string, colors: LookColors): Promise<string | null>
  onDeleteCombo(id: string): Promise<string | null>
}) {
  const [name, setName] = useState(initialName)
  const [look, setLook] = useState(initialLook)
  const [template, setTemplate] = useState<ThemeTemplateId>('classic')
  const [field, setField] = useState<LookColorKey>('bg')
  const [more, setMore] = useState(false)
  /** 자유 색 고르기(사각형 + 색상 띠)를 펼쳤는지 */
  const [pickerOpen, setPickerOpen] = useState(false)
  /** 대표색으로 만들기: null이면 닫힘. 고르지 않은 칸(null)은 자동 */
  const [keys, setKeys] = useState<KeyColors | null>(null)
  const [keySlot, setKeySlot] = useState<KeySlot>('accent')
  /** 지금 색을 내 조합으로 저장: 적고 있는 이름(null이면 닫힘) */
  const [comboName, setComboName] = useState<string | null>(null)
  const [comboError, setComboError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  /** 색 조합/다른 테마의 색으로 시작 */
  const pick = (c: LookColors) => {
    setKeys(null)
    setLook((l) => withColorsFrom(l, c))
  }

  /** 대표색이 바뀌면 나머지 칸을 다시 만든다(글꼴·무늬 종류는 그대로) */
  const applyKeys = (next: KeyColors) => {
    setKeys(next)
    setLook((l) => ({ ...l, ...lookColorsFromKeys(next, l.background.pattern?.id ?? null) }))
  }
  const openKeys = () => {
    setComboName(null)
    setKeySlot('accent')
    applyKeys({ accent: look.palette.accent, check: look.palette.check })
  }
  /** 대표색 칸의 지금 색(자동이면 만들어진 색) */
  const keyValue = (slot: KeySlot): string =>
    keys?.[slot] ??
    {
      accent: look.palette.accent,
      check: look.palette.check,
      bg: look.background.color,
      control: look.palette.control,
      pattern: look.background.pattern?.color ?? look.palette.check,
    }[slot]
  const keySlots = KEY_SLOTS.filter((k) => k.key !== 'pattern' || look.background.pattern)
  const activeKey = keySlots.some((k) => k.key === keySlot) ? keySlot : 'accent'
  const activeKeyInfo = keySlots.find((k) => k.key === activeKey)!

  const saveCombo = async () => {
    const n = comboName?.trim() ?? ''
    if (!n) return setComboError('이름을 적어 주세요')
    const err = await onSaveCombo(n.slice(0, 40), {
      palette: look.palette,
      background: look.background,
    })
    setComboError(err)
    if (!err) setComboName(null)
  }

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
    <ModalBackdrop onClose={onCancel} busy={busy}>
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
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void submit()}
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

            <section className="td-section" aria-label="색 조합">
              <h3>색 조합</h3>
              <SourceRow
                label="기본 조합"
                items={BUILTIN_COMBOS.map((c) => ({ key: c.id, name: c.name, colors: c }))}
                onPick={pick}
              />
              {combos.length > 0 && (
                <SourceRow
                  label="내 조합"
                  items={combos.map((c) => ({ key: c.id, name: c.name, colors: c }))}
                  onPick={pick}
                  onDelete={async (id) => setComboError(await onDeleteCombo(id))}
                />
              )}
              {sources.length > 0 && (
                <SourceRow
                  label="테마"
                  items={sources.map((s, i) => ({
                    key: `${s.name}-${i}`,
                    name: s.name,
                    colors: s.look,
                  }))}
                  onPick={pick}
                />
              )}
              <div className="td-combo-actions">
                <button type="button" className="td-more" onClick={openKeys} disabled={!!keys}>
                  대표색으로 새로 만들기
                </button>
                <button
                  type="button"
                  className="td-more"
                  onClick={() => {
                    setComboError(null)
                    setComboName(trimmed || '내 색 조합')
                  }}
                >
                  지금 색을 내 조합으로 저장
                </button>
              </div>
              {comboName !== null && (
                <div className="td-save-combo">
                  <input
                    aria-label="색 조합 이름"
                    value={comboName}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setComboName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) void saveCombo()
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        setComboName(null)
                      }
                    }}
                  />
                  <button type="button" className="td-source" onClick={() => void saveCombo()}>
                    저장
                  </button>
                  <button type="button" className="td-more" onClick={() => setComboName(null)}>
                    취소
                  </button>
                </div>
              )}
              {comboError && (
                <p className="dlg-error" role="alert">
                  {comboError}
                </p>
              )}
            </section>

            {keys ? (
              <section className="td-section td-keys" aria-label="대표색으로 만들기">
                <h3>대표색으로 만들기</h3>
                <p className="td-note">
                  강조·체크 색을 고르면 나머지 칸은 같은 계열로 채워요. 배경·버튼·무늬는 고르지
                  않으면 자동이에요. 글자색은 잘 읽히도록 자동으로 정해요.
                </p>
                <div className="td-fields" role="radiogroup" aria-label="대표색">
                  {keySlots.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      role="radio"
                      aria-checked={k.key === activeKey}
                      className="td-field"
                      onClick={() => setKeySlot(k.key)}
                    >
                      <span className="td-chip" style={{ background: keyValue(k.key) }} />
                      {k.label}
                      {k.optional && keys[k.key] == null && <em className="td-auto">자동</em>}
                    </button>
                  ))}
                </div>
                <ColorEditor
                  key={activeKey}
                  label={activeKeyInfo.label}
                  value={keyValue(activeKey)}
                  groups={swatches}
                  open={pickerOpen}
                  onToggle={() => setPickerOpen(!pickerOpen)}
                  onChange={(c) => applyKeys({ ...keys, [activeKey]: c })}
                />
                <div className="td-combo-actions">
                  {activeKeyInfo.optional && keys[activeKey] != null && (
                    <button
                      type="button"
                      className="td-more"
                      onClick={() => applyKeys({ ...keys, [activeKey]: null })}
                    >
                      자동으로
                    </button>
                  )}
                  <span className="dlg-spacer" />
                  <button type="button" className="td-source" onClick={() => setKeys(null)}>
                    다 골랐어요
                  </button>
                </div>
              </section>
            ) : (
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
                <ColorEditor
                  key={activeField}
                  label={activeLabel}
                  value={value ?? '#ffffff'}
                  groups={swatches}
                  open={pickerOpen}
                  onToggle={() => setPickerOpen(!pickerOpen)}
                  onChange={(c) => setLook((l) => withColor(l, activeField, c))}
                />
              </section>
            )}

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
    </ModalBackdrop>
  )
}

/** 대표색 점 3개(배경, 강조, 체크) */
export function Dots({ look }: { look: LookColors }) {
  return <ColorDots colors={[look.background.color, look.palette.accent, look.palette.check]} />
}

/** 대표색 점(타이틀바 테마 메뉴도 같이 쓴다) */
export function ColorDots({ colors }: { colors: readonly string[] }) {
  return (
    <span className="td-dots" aria-hidden>
      {colors.map((c, i) => (
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

/** 색 하나 고치기: 코드 입력 + (펼치면) 자유 색 고르기 + 견본 */
function ColorEditor({
  label,
  value,
  groups,
  open,
  onToggle,
  onChange,
}: {
  label: string
  value: string
  groups: SwatchGroup[]
  open: boolean
  onToggle(): void
  onChange(c: string): void
}) {
  return (
    <>
      <HexInput label={label} value={value} open={open} onToggle={onToggle} onChange={onChange} />
      {open && <ColorPicker label={label} value={value} onChange={onChange} />}
      <Swatches groups={groups} value={value} onPick={onChange} />
    </>
  )
}

/** 색 조합 한 줄(기본 조합 / 내 조합 / 테마). onDelete가 있으면 지우기 버튼도 */
function SourceRow({
  label,
  items,
  onPick,
  onDelete,
}: {
  label: string
  items: readonly { key: string; name: string; colors: LookColors }[]
  onPick(c: LookColors): void
  onDelete?(id: string): void
}) {
  return (
    <div className="td-src-group">
      <span className="td-src-label">{label}</span>
      <div className="td-sources">
        {items.map((it) => (
          <span key={it.key} className="td-source-wrap">
            <button
              type="button"
              className="td-source"
              onClick={() => onPick(it.colors)}
              title={`${it.name}의 색과 무늬로`}
            >
              <Dots look={it.colors} />
              {it.name}
            </button>
            {onDelete && (
              <ConfirmButton
                key={it.key}
                className="td-source-del"
                label="×"
                confirmLabel="지우기"
                onConfirm={() => onDelete(it.key)}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

/** #rrggbb 입력 + 자유 색 고르기 펼치기 */
function HexInput({
  label,
  value,
  open,
  onToggle,
  onChange,
}: {
  label: string
  value: string
  open: boolean
  onToggle(): void
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
      <button
        type="button"
        className="td-hex-chip"
        aria-label={`${label} 직접 고르기`}
        aria-expanded={open}
        style={{ background: value.slice(0, 7) }}
        onClick={onToggle}
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
      <button type="button" className="td-more" onClick={onToggle}>
        {open ? '접기' : '직접 고르기'}
      </button>
    </div>
  )
}
