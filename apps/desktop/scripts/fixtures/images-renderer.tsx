import { createRoot } from 'react-dom/client'
import { AssetImage } from '../../src/renderer/src/ui/AssetImage'

const hash = 'a'.repeat(64)
createRoot(document.getElementById('root')!).render(
  <AssetImage id="recovering" src={`kkumi-asset://diary/${hash}.png`} alt="" />,
)
