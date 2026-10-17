import { describe, expect, it } from 'vitest'
import { toErrorCode } from '../errors'
import type { HandlerDeps } from '../handlers/deps'
import { appHandlers } from '../handlers/app'

const make = () => {
  const opened: string[] = []
  const h = appHandlers({
    app: { version: '1.2.3', openFolder: async (f) => void opened.push(f) },
  } as HandlerDeps)
  return { h, opened }
}
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return toErrorCode(e)
  }
}

describe('app 핸들러', () => {
  it('버전을 알려 준다', async () => {
    expect(await make().h['app.info'](undefined)).toEqual({ version: '1.2.3' })
  })

  it('정해진 두 폴더만 연다(경로나 다른 이름은 거부)', async () => {
    const { h, opened } = make()
    await h['app.openFolder']({ folder: 'logs' })
    await h['app.openFolder']({ folder: 'userData' })
    expect(opened).toEqual(['logs', 'userData'])
    for (const bad of [
      { folder: 'home' },
      { folder: '/etc' },
      { folder: 'logs', path: '/tmp' },
      'logs',
      undefined,
    ])
      expect(await codeOf(h['app.openFolder'](bad))).toBe('invalid_input')
    expect(opened).toHaveLength(2)
  })
})
