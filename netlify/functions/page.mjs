import { getStore } from '@netlify/blobs'

const store = () => getStore('video-books', { consistency: 'strong' })
const pageKey = (bookId, pageId) => `pages/${bookId}/${pageId}`
const MAX_BYTES = 4_000_000

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
    const key = pageKey(bookId, pageId)
    const method = req.method.toUpperCase()

    if (method === 'POST') {
      const contentType = req.headers.get('content-type') || 'image/jpeg'
      if (!contentType.startsWith('image/')) return json({ error: 'Only image pages can be uploaded.' }, 415)
      const blob = await req.blob()
      if (blob.size > MAX_BYTES) return json({ error: 'Page image is too large. Keep each page under 4 MB.' }, 413)
      await books.set(key, blob)
      return json({ ok: true, size: blob.size })
    }

    if (method === 'GET') {
      const blob = await books.get(key, { type: 'blob' })
      if (!blob) return new Response('Not found', { status: 404 })
      return new Response(blob, {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      })
    }

    if (method === 'DELETE') {
      await books.delete(key)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    console.error(error)
    return json({ error: error?.message || 'Unexpected server error.' }, 500)
  }
}
