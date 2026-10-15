import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_BUNDLE_ID, APP_DISPLAY_NAME, APP_INTERNAL_NAME } from '../../shared/identity'

const yml = readFileSync(join(__dirname, '../../../electron-builder.yml'), 'utf8')
const field = (k: string) => new RegExp(`^${k}: (.+)$`, 'm').exec(yml)?.[1]?.trim()

describe('배포 설정', () => {
  it('electron-builder.yml의 appId/productName/표시 이름은 identity 상수와 같다', () => {
    expect(field('appId')).toBe(APP_BUNDLE_ID)
    // 파일 이름은 영문(내부 식별자), 보이는 이름은 표시 이름
    expect(field('productName')).toBe(APP_INTERNAL_NAME)
    expect(field(' {4}CFBundleDisplayName')).toBe(APP_DISPLAY_NAME)
    const strings = readFileSync(
      join(__dirname, '../../../build/lproj/ko.lproj/InfoPlist.strings'),
      'utf8',
    )
    expect(strings).toContain(`"${APP_DISPLAY_NAME}"`)
  })
})
