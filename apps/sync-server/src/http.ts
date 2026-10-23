import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { SYNC_MAX_BYTES, SYNC_BLOB_MAX_BYTES, SyncPushSchema } from '@kkumikkumi/schema'
import type { SyncStore } from './store'

function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}
async function readBytes(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk as Uint8Array)
    size += bytes.length
    if (size > limit) throw new Error('request_too_large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
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
        if (req.url?.startsWith('/v1/')) return send(res, 426, { error: 'upgrade_required' })
        const blob = /^\/v2\/blobs\/([a-f0-9]{64})$/.exec(req.url ?? '')
        if (blob) {
          const hash = blob[1]!
          if (req.method === 'PUT') {
            if (req.headers['content-type'] !== 'application/octet-stream')
              return send(res, 415, { error: 'binary_required' })
            store.putBlob(accountId, hash, await readBytes(req, SYNC_BLOB_MAX_BYTES))
            return send(res, 200, { ok: true })
          }
          if (req.method === 'HEAD') {
            res.writeHead(store.hasBlob(accountId, hash) ? 200 : 404, {
              'Cache-Control': 'no-store',
            })
            return res.end()
          }
          if (req.method === 'GET') {
            const bytes = store.blob(accountId, hash)
            if (!bytes) return send(res, 404, { error: 'not_found' })
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Length': bytes.length,
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            })
            return res.end(bytes)
          }
        }
        if (req.method === 'GET' && req.url === '/v2/snapshot')
          return send(res, 200, store.snapshot(accountId))
        if (req.method === 'POST' && req.url === '/v2/changes') {
          if (!req.headers['content-type']?.startsWith('application/json'))
            return send(res, 415, { error: 'json_required' })
          const input = SyncPushSchema.safeParse(
            JSON.parse((await readBytes(req, SYNC_MAX_BYTES)).toString('utf8')),
          )
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
