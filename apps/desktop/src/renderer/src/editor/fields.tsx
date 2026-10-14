import { useState, type ReactNode } from 'react'
import type { SwatchGroup } from '../app/colorGroups'
import { Swatches } from '../app/Swatches'

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
          placeholder={props.nullLabel ?? '#000000'}
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

export function NumberField(props: {
  label: string
  value: number
  onChange(v: number): void
  step?: number
}) {
  return (
    <Row label={props.label}>
      <input
        type="number"
        className="ki-num"
        step={props.step ?? 1}
        value={Math.round(props.value * 10) / 10}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) props.onChange(v)
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
