import { describe, expect, it } from 'vitest'
import { parseAssetUrl } from '../assetUrl'

const id = '00000000-0000-7000-8000-000000000001'
const hash = 'a'.repeat(64)

describe('parseAssetUrl', () => {
  it('정상 URL', () => {
    expect(parseAssetUrl(`kkumi-asset://${id}/${hash}.png`)).toEqual({
      themeId: id,
      hash,
      ext: 'png',
    })
  })
  it('일기 사진 URL', () => {
    expect(parseAssetUrl(`kkumi-asset://diary/${hash}.jpg`)).toEqual({
      themeId: 'diary',
      hash,
      ext: 'jpg',
    })
    expect(parseAssetUrl(`kkumi-asset://diaries/${hash}.jpg`)).toBeNull()
  })
  it.each([
    [`kkumi-asset://${id}/../${hash}.png`, '상위 경로'],
    [`kkumi-asset://${id}/%2e%2e/${hash}.png`, '인코딩된 상위 경로'],
    [`kkumi-asset://${id}/sub/${hash}.png`, '하위 폴더'],
    [`kkumi-asset://${id}/${hash}.svg`, 'svg 확장자'],
    [`kkumi-asset://${id}/${hash}.png?x=1`, '쿼리'],
    [`kkumi-asset://${id}/${hash}.png#x`, '해시'],
    [`kkumi-asset://not-a-uuid/${hash}.png`, 'UUID 아님'],
    [`kkumi-asset://${id}/theme.json`, '테마 파일'],
    [`file:///${id}/${hash}.png`, '다른 스킴'],
    [`kkumi-asset://${id}/${'A'.repeat(64)}.png`, '대문자 해시'],
    ['nonsense', '파싱 불가'],
  ])('%s 거부 (%s)', (url) => {
    expect(parseAssetUrl(url)).toBeNull()
  })
})
