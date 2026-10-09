import { findFreeSlot } from '@kkumikkumi/schema'

export function App() {
  const slot = findFreeSlot({ cols: 8, rows: 5 }, [], { w: 2, h: 2 })
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>꾸미꾸미</h1>
      <p>P0 골격. platform: {window.kkumi.platform}</p>
      <p>
        schema 패키지 연결 확인: findFreeSlot → ({slot?.col}, {slot?.row})
      </p>
    </main>
  )
}
