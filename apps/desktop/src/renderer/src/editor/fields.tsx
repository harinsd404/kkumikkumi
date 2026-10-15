import { useState, type ReactNode } from 'react'
import type { SwatchGroup } from '../app/colorGroups'
import { Swatches } from '../app/Swatches'
import { FONTS } from '../board/fonts'

// 인스펙터 입력 컴포넌트(작고 단순하게). 색은 HexColor(#rrggbb / #rrggbbaa)만 받는다.
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ki-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ki-row">
      <span className="ki-label">{label}</span>
      <span className="ki-control">{children}</span>
    </label>
  )
}

export function ColorField(props: {
  label: string
  value: string | null
  onChange(v: string | null): void
  swatches: readonly SwatchGroup[]
  /** null 선택지(예: "투명", "팔레트") */
  nullLabel?: string
}) {
  const { value, onChange } = props
  const [text, setText] = useState(value ?? '')
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    // 외부 변경(실행 취소 등)을 입력란에 반영
    setPrev(value)
    setText(value ?? '')
  }
  const commitText = () => {
    if (text === '' && props.nullLabel) onChange(null)
    else if (HEX.test(text)) onChange(text.toLowerCase())
    else setText(value ?? '')
  }
  return (
    <div className="ki-color">
      <span className="ki-row-label">{props.label}</span>
      <div className="ki-color-line">
        <input
          type="color"
          aria-label={`${props.label} 고르기`}
          value={(value ?? '#ffffff').slice(0, 7)}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className="ki-hex"
          aria-label={`${props.label} 코드`}
          placeholder="#rrggbb"
          value={text}
          maxLength={9}
          onChange={(e) => setText(e.target.value.trim())}
          onBlur={commitText}
          onKeyDown={(e) => e.key === 'Enter' && commitText()}
        />
        {props.nullLabel && (
          <button
            type="button"
            className={`ki-chip ${value === null ? 'is-on' : ''}`}
            onClick={() => onChange(null)}
          >
            {props.nullLabel}
          </button>
        )}
      </div>
      <Swatches groups={props.swatches} value={value} onPick={onChange} />
    </div>
  )
}

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange(v: number): void
  format?(v: number): string
}) {
  return (
    <Row label={props.label}>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output className="ki-out">{props.format ? props.format(props.value) : props.value}</output>
    </Row>
  )
}

/**
 * 숫자 칸. 입력 중에는 글자 그대로 두고 Enter나 포커스가 빠질 때 반영한다
 * (값마다 바로 반영하면 범위 보정 때문에 "120"을 칠 수 없다).
 */
export function NumberField(props: {
  label: string
  value: number
  onChange(v: number): void
  step?: number
}) {
  const shown = String(Math.round(props.value * 10) / 10)
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(v)) props.onChange(v)
    setDraft(null)
  }
  return (
    <Row label={props.label}>
      <input
        type="number"
        className="ki-num"
        step={props.step ?? 1}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(null)
        }}
      />
    </Row>
  )
}

export function Segmented<T extends string | number>(props: {
  label: string
  value: T
  options: readonly { value: T; label: string; disabled?: boolean }[]
  onChange(v: T): void
}) {
  return (
    <div className="ki-row" role="radiogroup" aria-label={props.label}>
      <span className="ki-label">{props.label}</span>
      <span className="ki-seg">
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            disabled={o.disabled}
            className={o.value === props.value ? 'is-on' : ''}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  )
}

const fontOptions = Object.entries(FONTS).map(([id, f]) => ({ id, label: f.label }))

/** 번들 글꼴 고르기. emptyLabel이 있으면 맨 위에 '' 선택지(테마 기본 등) */
export function FontSelect(props: {
  value: string
  onChange(fontId: string): void
  emptyLabel?: string
}) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      {props.emptyLabel !== undefined && <option value="">{props.emptyLabel}</option>}
      {fontOptions.map((f) => (
        <option key={f.id} value={f.id}>
          {f.label}
        </option>
      ))}
    </select>
  )
}
