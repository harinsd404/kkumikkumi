import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { SYNC_MAX_BYTES, SyncPushSchema } from '@kkumikkumi/schema'
import type { SyncStore } from './store'

function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk as Uint8Array)
    size += bytes.length
    if (size > SYNC_MAX_BYTES) throw new Error('request_too_large')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** No browser CORS, cookies, or public signup: only explicitly provisioned bearer keys. */
export function createSyncHttpServer(store: SyncStore) {
  return createServer(
    { requestTimeout: 20000, headersTimeout: 10000, maxHeaderSize: 8192 },
    async (req, res) => {
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true })
      const auth = req.headers.authorization ?? ''
      const accountId = store.authenticate(auth.startsWith('Bearer ') ? auth.slice(7) : '')
      if (!accountId) return send(res, 401, { error: 'unauthorized' })
      try {
        if (req.method === 'GET' && req.url === '/v1/snapshot')
          return send(res, 200, store.snapshot(accountId))
        if (req.method === 'POST' && req.url === '/v1/changes') {
          if (!req.headers['content-type']?.startsWith('application/json'))
            return send(res, 415, { error: 'json_required' })
          const input = SyncPushSchema.safeParse(await readJson(req))
          if (!input.success) return send(res, 400, { error: 'invalid_request' })
          const result = store.push(accountId, input.data)
          return send(res, result.status, result.snapshot)
        }
        send(res, 404, { error: 'not_found' })
      } catch (e) {
        const tooLarge = e instanceof Error && /^(request|document)_too_large$/.test(e.message)
        send(res, tooLarge ? 413 : 400, { error: tooLarge ? 'too_large' : 'invalid_request' })
      }
    },
  )
}
