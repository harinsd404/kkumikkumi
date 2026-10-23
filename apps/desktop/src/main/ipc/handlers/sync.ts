import { z } from 'zod'
import { NoInput } from '../inputs'
import { SyncError } from '../../sync/service'
import type { HandlerDeps, HandlersOf } from './deps'

export function syncHandlers(d: HandlerDeps): HandlersOf<'sync'> {
  const service = () => {
    if (!d.sync) throw new SyncError('sync_unavailable')
    return d.sync
  }
  return {
    'sync.status': async (i) => {
      NoInput.parse(i)
      return service().status()
    },
    'sync.connect': async (i) =>
      service().connect(
        z
          .strictObject({
            url: z.string().max(2048),
            token: z.string().max(128),
            importLocal: z.boolean(),
          })
          .parse(i),
      ),
    'sync.disconnect': async (i) => {
      NoInput.parse(i)
      return service().disconnect()
    },
    'sync.run': async (i) => {
      const { prefer } = z.strictObject({ prefer: z.enum(['local', 'remote']).optional() }).parse(i)
      return service().run(prefer)
    },
  }
}
