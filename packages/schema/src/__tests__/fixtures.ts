import type { z } from 'zod'
import { CANVAS, type ThemeSchema } from '../theme'

/** 테스트용 결정적 UUID (v7 형식) */
export const U = (n: number): string => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
/** 테스트용 sha256 (한 글자 반복) */
export const H = (c: string): string => c.repeat(64)

type ThemeInput = z.input<typeof ThemeSchema>

const style = {
  opacity: 1,
  radius: 16,
  border: { width: 0, color: null },
  shadow: 'soft',
  bg: '#ffffff',
  fontId: null,
  textColor: null,
} as const
const decor = {
  opacity: 1,
  radius: 0,
  border: { width: 0, color: '#000000' },
  shadow: 'none',
} as const
const content = {
  assetHash: H('a'),
  fit: 'cover',
  focus: { x: 0.5, y: 0.5, zoom: 1 },
  shape: 'rect',
} as const

const designTheme: ThemeInput = {
  schemaVersion: 1,
  id: U(1),
  name: '푸딩 아침',
  createdAt: 0,
  updatedAt: 0,
  canvas: { ...CANVAS },
  defaults: {
    fontId: 'pretendard',
    palette: {
      text: '#4a3a36',
      subText: '#85705f',
      accent: '#d9b48a',
      check: '#f6ebb5',
      surface: '#fff8e4',
      control: '#fdefc9',
    },
  },
  background: { type: 'color', color: '#fffae7', pattern: { id: 'dots', color: '#ded2be' } },
  // 디자인 시안 레이아웃: 배너 W(8x1), 캘린더 L(4x3), 투두 M(2x3) + 오른쪽 열에 타이머 S, 이미지 S
  blocks: [
    {
      id: U(2),
      type: 'calendar',
      size: 'L',
      col: 0,
      row: 1,
      style,
      props: { view: 'month', weekStartsOn: 0 },
    },
    { id: U(3), type: 'image', size: 'W', col: 0, row: 0, style, props: content },
    {
      id: U(4),
      type: 'todo',
      size: 'M',
      col: 4,
      row: 1,
      style,
      props: { listId: null, showCompleted: false },
    },
    {
      id: U(7),
      type: 'timer',
      size: 'S',
      col: 6,
      row: 1,
      style,
      props: { presetsMin: [25, 5], display: 'ring' },
    },
    { id: U(8), type: 'image', size: 'S', col: 6, row: 2, style, props: content },
  ],
  freeItems: [
    {
      id: U(5),
      kind: 'sticker',
      x: 100,
      y: 800,
      w: 120,
      h: 120,
      rotation: 15,
      z: 1,
      layer: 'front',
      locked: false,
      decor,
      source: { type: 'builtin', id: 'star' },
    },
    {
      id: U(6),
      kind: 'image',
      x: 1200,
      y: 100,
      w: 300,
      h: 300,
      rotation: 0,
      z: 0,
      layer: 'back',
      locked: false,
      decor,
      content,
    },
  ],
  pet: {
    name: '꾸이',
    size: 96,
    walk: true,
    speed: 'normal',
    source: { type: 'custom', images: { rest: H('b'), music: null, typing: H('c') } },
  },
  assets: [
    { hash: H('a'), mime: 'image/jpeg', width: 800, height: 600, bytes: 1000 },
    { hash: H('b'), mime: 'image/png', width: 256, height: 256, bytes: 1000 },
    { hash: H('c'), mime: 'image/png', width: 256, height: 256, bytes: 1000 },
  ],
}

/**
 * 변형 가능한 깊은 복사본. 잘못된 입력(미지의 키 등)을 만들기 위해 의도적으로 느슨한 타입을 반환한다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 잘못된 입력을 만들기 위한 테스트 전용
export const baseTheme = (): any => JSON.parse(JSON.stringify(designTheme))
