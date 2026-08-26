import { getStore } from '@netlify/blobs'

const store = () => getStore('video-books', { consistency: 'strong' })
const audioKey = (bookId, pageId) => `narration/${bookId}/${pageId}`
const metaKey = (bookId, pageId) => `narration-meta/${bookId}/${pageId}.json`
const MAX_BYTES = 6_000_000

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
}

export default async (req) => {
  try {
    const url = new URL(req.url)
    const bookId = url.searchParams.get('bookId')
    const pageId = url.searchParams.get('pageId')
    if (!bookId || !pageId) return json({ error: 'Missing bookId or pageId.' }, 400)

    const books = store()
    const key = audioKey(bookId, pageId)
    const metadataKey = metaKey(bookId, pageId)
    const method = req.method.toUpperCase()

    if (method === 'POST') {
      const contentType = req.headers.get('content-type') || 'audio/webm'
      if (!contentType.startsWith('audio/')) return json({ error: 'Only audio recordings can be uploaded.' }, 415)
      const blob = await req.blob()
      if (!blob.size) return json({ error: 'The recording is empty.' }, 400)
      if (blob.size > MAX_BYTES) return json({ error: 'Recording is too large. Keep each page recording under 6 MB.' }, 413)
      await books.set(key, blob)
      await books.setJSON(metadataKey, { contentType, size: blob.size, updatedAt: new Date().toISOString() })
      return json({ ok: true, size: blob.size, contentType })
    }

    if (method === 'GET') {
      const blob = await books.get(key, { type: 'blob' })
      if (!blob) return new Response('Not found', { status: 404 })
      const meta = await books.get(metadataKey, { type: 'json' })
      return new Response(blob, {
        status: 200,
        headers: {
          'content-type': meta?.contentType || 'audio/webm',
          'cache-control': 'public, max-age=3600',
        },
      })
    }

    if (method === 'DELETE') {
      await Promise.all([books.delete(key), books.delete(metadataKey)])
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    console.error(error)
    return json({ error: error?.message || 'Unexpected server error.' }, 500)
  }
}
