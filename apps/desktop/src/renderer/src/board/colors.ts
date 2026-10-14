// 색 계산(순수 함수). 입력은 HexColor(#rrggbb, 알파가 붙어 있으면 무시).

export const hexToHsl = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60
  return [h, s, l]
}

export const hslToHex = (h: number, s: number, l: number): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 상대 휘도(WCAG, 0 = 검정 … 1 = 흰색) */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** a와 b를 섞는다(t = 0이면 a, 1이면 b) */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgbOf(a)
  const y = rgbOf(b)
  const hex = (i: number) =>
    Math.round(x[i]! + (y[i]! - x[i]!) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(0)}${hex(1)}${hex(2)}`
}

/** 이보다 밝은 버튼 바탕은 흰 카드 위에서 거의 보이지 않는다 */
const CONTROL_MAX_LUMINANCE = 0.88

/**
 * 화면 버튼·고른 탭 바탕색. 테마의 control 색이 흰색에 가까우면(예: 코튼캔디 #f2fafc)
 * 강조·체크 색 중 진한 쪽을 조금씩 섞어 보이게 만든다. 이미 충분히 진하면 그대로.
 */
export function uiControl(palette: { control: string; accent: string; check: string }): string {
  if (luminance(palette.control) <= CONTROL_MAX_LUMINANCE) return palette.control
  const tint =
    luminance(palette.check) <= luminance(palette.accent) ? palette.check : palette.accent
  for (let t = 0.1; t < 1; t += 0.1) {
    const c = mixHex(palette.control, tint, t)
    if (luminance(c) <= CONTROL_MAX_LUMINANCE) return c
  }
  return tint
}

/** 옅은 색을 글자로 쓸 수 있게 차분하고 진하게(밝기 0.7 이하, 채도 0.4 이하). 시안 #c4e0f0 → #96bace 근처 */
export function deepen(hex: string): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, Math.min(s, 0.4), Math.min(l, 0.7))
}

/**
 * 투두 블록 구역 색(시안 6:2384): 구역마다 체크색 → 강조색을 번갈아 쓴다.
 * label은 구역 이름 글자색(체크색은 옅어서 진하게), done은 완료한 체크 상자 바탕.
 */
export function sectionTone(
  palette: { accent: string; check: string },
  index: number,
): { label: string; done: string } {
  return index % 2 === 0
    ? { label: deepen(palette.check), done: palette.check }
    : { label: palette.accent, done: palette.accent }
}
