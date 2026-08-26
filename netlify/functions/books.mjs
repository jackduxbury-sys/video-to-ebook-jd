import { getStore } from '@netlify/blobs'

const store = () => getStore('video-books', { consistency: 'strong' })
const manifestKey = id => `manifests/${id}.json`
const pagesPrefix = id => `pages/${id}/`
const narrationPrefix = id => `narration/${id}/`
const narrationMetaPrefix = id => `narration-meta/${id}/`

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
}

export default async (req) => {
  try {
    const method = req.method.toUpperCase()
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const books = store()

    if (method === 'GET' && id) {
      const book = await books.get(manifestKey(id), { type: 'json' })
      if (!book) return json({ error: 'Book not found.' }, 404)
      return json({ book })
    }

    if (method === 'GET') {
      const result = await books.list({ prefix: 'manifests/' })
      const manifests = await Promise.all(
        result.blobs.map(entry => books.get(entry.key, { type: 'json' }))
      )
      manifests.sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')))
      return json({ books: manifests.filter(Boolean) })
    }

    if (method === 'POST') {
      const book = await req.json()
      if (!book?.id || !book?.title || !Array.isArray(book?.pages)) {
        return json({ error: 'Invalid book manifest.' }, 400)
      }
      if (book.pages.length > 500) return json({ error: 'Books are limited to 500 pages.' }, 400)
      await books.setJSON(manifestKey(book.id), book)
      return json({ ok: true, book })
    }

    if (method === 'DELETE') {
      if (!id) return json({ error: 'Missing book id.' }, 400)
      const [pages, narration, narrationMeta] = await Promise.all([
        books.list({ prefix: pagesPrefix(id) }),
        books.list({ prefix: narrationPrefix(id) }),
        books.list({ prefix: narrationMetaPrefix(id) }),
      ])
      await Promise.all([
        ...pages.blobs.map(entry => books.delete(entry.key)),
        ...narration.blobs.map(entry => books.delete(entry.key)),
        ...narrationMeta.blobs.map(entry => books.delete(entry.key)),
      ])
      await books.delete(manifestKey(id))
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    console.error(error)
    return json({ error: error?.message || 'Unexpected server error.' }, 500)
  }
}
