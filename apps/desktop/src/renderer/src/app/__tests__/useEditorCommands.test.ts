import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorApi } from '../../editor/useEditor'
import { useEditorCommands } from '../useEditorCommands'

afterEach(() => vi.unstubAllGlobals())

// DOM 없이 종료 명령을 호출할 수 있도록 React 훅 컨텍스트에서 가져온다.
function commandsFor(flush: EditorApi['flush']) {
  const select = vi.fn()
  const showNotice = vi.fn()
  const invoke = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('window', { kkumi: { invoke } })
  const editor = { flush, select, showNotice } as unknown as EditorApi
  let commands!: ReturnType<typeof useEditorCommands>
  function Harness() {
    commands = useEditorCommands(editor)
    return null
  }
  renderToStaticMarkup(createElement(Harness))
  return { commands, select, showNotice, invoke }
}

describe('편집 종료', () => {
  it('저장 완료를 기다리고 실행취소가 참조할 수 있는 에셋은 정리하지 않는다', async () => {
    let resolve!: (saved: boolean) => void
    const flush = new Promise<boolean>((done) => {
      resolve = done
    })
    const { commands, select, invoke } = commandsFor(() => flush)
    const exiting = commands.exitEdit()
    expect(select).not.toHaveBeenCalled()
    resolve(true)
    await exiting
    expect(select).toHaveBeenCalledWith(null)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('저장이 실패하면 선택을 유지하고 재시도를 안내한다', async () => {
    const { commands, select, showNotice, invoke } = commandsFor(async () => false)
    await commands.exitEdit()
    expect(select).not.toHaveBeenCalled()
    expect(showNotice).toHaveBeenCalledWith(expect.stringContaining('다시 저장'))
    expect(invoke).not.toHaveBeenCalled()
  })
})
