import { createRoot } from 'react-dom/client'
import { createDefaultTheme, parseTheme, type Theme } from '@kkumikkumi/schema'
import { EditorOverlay } from '../../src/renderer/src/editor/EditorOverlay'
import { useEditor, type EditorApi } from '../../src/renderer/src/editor/useEditor'
import { BlockSection } from '../../src/renderer/src/editor/inspector/BlockSection'
import { FreeSection } from '../../src/renderer/src/editor/inspector/FreeSection'

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
const initial = createDefaultTheme({ theme: id(1), blocks: [id(2), id(3), id(4)] }, 0)
initial.blocks[0]!.style.bg = null
let saved: Theme | null = null
const save = async (t: Theme) => {
  const r = parseTheme(JSON.parse(JSON.stringify(t)))
  if (!r.success) throw new Error('Invalid saved theme')
  saved = r.data
  return { ok: true as const }
}
const testWindow = window as unknown as {
  editor: EditorApi
  saved: () => Theme | null
  reload: () => void
}
testWindow.saved = () => saved
const noop = () => {}
const apis = { pickImage: async () => null }
function Fixture({ theme }: { theme: Theme }) {
  const ed = useEditor(theme, { save })
  testWindow.editor = ed
  const b = ed.theme.blocks.find((b) => b.id === ed.selection?.id)
  const f = ed.theme.freeItems.find((f) => f.id === ed.selection?.id)
  return (
    <>
      <div
        style={{
          position: 'relative',
          width: 1600,
          height: 1000,
          transform: 'scale(0.5)',
          transformOrigin: '0 0',
        }}
      >
        <EditorOverlay ed={ed} scale={0.5} onDropFile={noop} />
      </div>
      <aside style={{ position: 'absolute', left: 810, top: 0, width: 320 }}>
        {b && (
          <BlockSection
            ed={ed}
            block={b}
            swatches={[]}
            apis={apis}
            onDuplicate={noop}
            onDelete={noop}
          />
        )}
        {f && <FreeSection ed={ed} free={f} swatches={[]} onDuplicate={noop} onDelete={noop} />}
      </aside>
    </>
  )
}
const root = createRoot(document.getElementById('root')!)
let version = 0
testWindow.reload = () => root.render(<Fixture key={++version} theme={saved!} />)
root.render(<Fixture theme={initial} />)
