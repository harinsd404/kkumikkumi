import type { Theme } from '@kkumikkumi/schema'
import type { CSSProperties } from 'react'
import { fontStack } from '../board/fonts'

/**
 * 보드 밖 화면(일정 창, 세부 페이지)에 테마 팔레트/폰트를 CSS 변수로 넘긴다.
 * 배경이 이미지인 테마는 페이지 바탕을 surface 색으로 대신한다.
 */
export function themeVars(theme: Theme): CSSProperties {
  const p = theme.defaults.palette
  return {
    fontFamily: fontStack(theme.defaults.fontId),
    color: p.text,
    '--t-text': p.text,
    '--t-sub': p.subText,
    '--t-accent': p.accent,
    '--t-check': p.check,
    '--t-control': p.control,
    '--t-surface': p.surface,
    '--t-bg': theme.background.type === 'color' ? theme.background.color : p.surface,
  } as CSSProperties
}
