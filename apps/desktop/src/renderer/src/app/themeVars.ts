import type { Theme } from '@kkumikkumi/schema'
import type { CSSProperties } from 'react'
import { uiControl } from '../board/colors'
import { fontStack } from '../board/fonts'

/**
 * 앱 화면(타이틀바, 인스펙터, 편집 화면)에 넘기는 테마 색 CSS 변수. 폰트/글자색은 건드리지 않는다.
 * --t-control은 흰 바탕 위에서도 보이도록 보정한 값(uiControl).
 * 배경이 이미지인 테마는 페이지 바탕을 surface 색으로 대신한다.
 */
export function themeColorVars(theme: Theme): CSSProperties {
  const p = theme.defaults.palette
  return {
    '--t-text': p.text,
    '--t-sub': p.subText,
    '--t-accent': p.accent,
    '--t-check': p.check,
    '--t-control': uiControl(p),
    '--t-surface': p.surface,
    '--t-bg': theme.background.type === 'color' ? theme.background.color : p.surface,
  } as CSSProperties
}

/** 보드 밖 화면(일정 창, 세부 페이지)에 테마 팔레트/폰트를 넘긴다 */
export function themeVars(theme: Theme): CSSProperties {
  return {
    fontFamily: fontStack(theme.defaults.fontId),
    color: theme.defaults.palette.text,
    ...themeColorVars(theme),
  }
}
