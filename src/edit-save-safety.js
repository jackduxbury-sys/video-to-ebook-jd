let queuedBookPageDeletes = []

function installSafeEditDeletes() {
  if (window.__safeEditDeletesInstalled) return
  window.__safeEditDeletesInstalled = true

  const previousFetch = window.__ambientOriginalFetch || window.fetch.bind(window)

  const safeFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
    const editing = !!document.querySelector('.book-edit-backdrop')

    if (editing && method === 'DELETE' && url.includes('/.netlify/functions/page')) {
      queuedBookPageDeletes.push({ input, init: { ...init } })
      return new Response(JSON.stringify({ ok: true, queued: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (editing && method === 'POST' && url.includes('/.netlify/functions/books')) {
      const response = await previousFetch(input, init)
      if (response.ok && queuedBookPageDeletes.length) {
        const deletes = queuedBookPageDeletes
        queuedBookPageDeletes = []
        await Promise.allSettled(deletes.map(item => previousFetch(item.input, item.init)))
      }
      if (!response.ok) queuedBookPageDeletes = []
      return response
    }

    return previousFetch(input, init)
  }

  window.__ambientOriginalFetch = safeFetch

  document.addEventListener('click', event => {
    if (event.target.closest?.('.book-edit-cancel')) queuedBookPageDeletes = []
  }, true)
}

installSafeEditDeletes()
