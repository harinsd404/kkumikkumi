import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { hexToHsv, hsvToHex } from '../board/colors'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * 자유 색 고르기: 채도·밝기 사각형 + 색상 띠. 값은 #rrggbb.
 * 회색처럼 색상이 없는 색을 지나도 고르던 색상을 잃지 않도록 HSV를 따로 들고 있는다.
 */
export function ColorPicker({
  value,
  label,
  onChange,
}: {
  value: string
  label: string
  onChange(hex: string): void
}) {
  const hex6 = value.slice(0, 7).toLowerCase()
  const [hsv, setHsv] = useState(() => hexToHsv(hex6))
  const [prev, setPrev] = useState(hex6)
  if (prev !== hex6) {
    // 바깥에서 바뀐 값(견본, 코드 입력)만 다시 읽는다
    setPrev(hex6)
    if (hsvToHex(...hsv) !== hex6) setHsv(hexToHsv(hex6))
  }
  const [h, s, v] = hsv

  const set = (next: [number, number, number]) => {
    const out = hsvToHex(...next)
    setHsv(next)
    setPrev(out)
    if (out !== hex6) onChange(out)
  }

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    set([h, clamp01((e.clientX - r.left) / r.width), 1 - clamp01((e.clientY - r.top) / r.height)])
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    set([h, clamp01(s + m[0]), clamp01(v + m[1])])
  }

  return (
    <div className="cpk">
      <div
        className="cpk-area"
        role="slider"
        tabIndex={0}
        aria-label={`${label} 채도와 밝기`}
        aria-valuetext={`채도 ${Math.round(s * 100)}%, 밝기 ${Math.round(v * 100)}%`}
        style={{ background: `hsl(${h} 100% 50%)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e)}
        onKeyDown={onKey}
      >
        <span
          className="cpk-thumb"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hex6 }}
        />
      </div>
      <input
        type="range"
        className="cpk-hue"
        aria-label={`${label} 색상`}
        min={0}
        max={359}
        value={Math.round(h)}
        onChange={(e) => set([Number(e.target.value), s, v])}
      />
    </div>
  )
}
