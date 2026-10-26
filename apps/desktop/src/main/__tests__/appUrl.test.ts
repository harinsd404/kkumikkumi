import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { devServerUrlFor, isAppUrlFor } from '../appUrl'

const index = pathToFileURL(
  '/Applications/꾸미꾸미.app/Contents/Resources/app.asar/out/renderer/index.html',
)

describe('isAppUrlFor', () => {
  it('prod: 번들 index.html만 허용', () => {
    expect(isAppUrlFor(index.href, index)).toBe(true)
    expect(isAppUrlFor(`${index.href}#/x`, index)).toBe(true)
    expect(isAppUrlFor('file:///etc/passwd', index)).toBe(false)
    expect(isAppUrlFor('https://example.com/', index)).toBe(false)
    expect(isAppUrlFor('not a url', index)).toBe(false)
  })
  it('prod: 한글 경로의 NFD/NFC, 인코딩 차이는 같은 파일로 본다', () => {
    const nfd = pathToFileURL(fileURLToPath(index).normalize('NFD'))
    expect(isAppUrlFor(nfd.href, index)).toBe(true)
  })
  it('dev: 개발 서버 origin만', () => {
    expect(isAppUrlFor('http://localhost:5173/a', index, 'http://localhost:5173')).toBe(true)
    expect(isAppUrlFor('http://localhost:5174/', index, 'http://localhost:5173')).toBe(false)
    expect(isAppUrlFor(index.href, index, 'http://localhost:5173')).toBe(false)
  })
})

describe('devServerUrlFor', () => {
  it('패키지된 앱은 ELECTRON_RENDERER_URL을 무시한다', () => {
    const env = { ELECTRON_RENDERER_URL: 'https://evil.example' }
    expect(devServerUrlFor(env, true)).toBeUndefined()
    expect(devServerUrlFor(env, false)).toBe('https://evil.example')
    expect(devServerUrlFor({}, false)).toBeUndefined()
  })
})
