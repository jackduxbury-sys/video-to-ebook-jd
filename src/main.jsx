import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API_BOOKS = '/.netlify/functions/books'
const API_PAGE = '/.netlify/functions/page'
const MAX_PAGE_WIDTH = 1600
const JPEG_QUALITY = 0.86
const MAX_FRAMES = 500

const uid = () => crypto.randomUUID()

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function pageUrl(bookId, pageId, cacheKey = '') {
  const qs = new URLSearchParams({ bookId, pageId })
  if (cacheKey) qs.set('v', cacheKey)
  return `${API_PAGE}?${qs.toString()}`
}

async function api(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {}
    throw new Error(message)
  }
  const type = res.headers.get('content-type') || ''
  return type.includes('application/json') ? res.json() : res
}

function App() {
  const [route, setRoute] = useState(() => parseRoute())

  useEffect(() => {
    const onPop = () => setRoute(parseRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function go(path) {
    history.pushState({}, '', path)
    setRoute(parseRoute())
  }

  if (route.name === 'reader') return <Reader bookId={route.id} go={go} />
  if (route.name === 'create') return <Creator go={go} />
  return <Library go={go} />
}

function parseRoute() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  const m = path.match(/^\/book\/([^/]+)$/)
  if (m) return { name: 'reader', id: decodeURIComponent(m[1]) }
  if (path === '/create') return { name: 'create' }
  return { name: 'library' }
}

function Shell({ children, title = 'Video Books', actions }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">VIDEO → EBOOK</p>
          <h1>{title}</h1>
        </div>
        <div className="top-actions">{actions}</div>
      </header>
      <main>{children}</main>
    </div>
  )
}

function Library({ go }) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await api(API_BOOKS)
      setBooks(data.books || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function remove(book) {
    if (!confirm(`Delete “${book.title}”? This removes the published pages too.`)) return
    try {
      await api(`${API_BOOKS}?id=${encodeURIComponent(book.id)}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <Shell
      title="My eBooks"
      actions={<button className="primary" onClick={() => go('/create')}>＋ Create new book</button>}
    >
      <section className="intro-card">
        <div>
          <h2>Turn a video into a simple picture book.</h2>
          <p>Upload a video, keep the useful frames, then publish them as a touch-friendly eBook.</p>
        </div>
        <div className="steps-mini">
          <span>1. Upload</span><span>2. Choose frames</span><span>3. Publish</span><span>4. Read</span>
        </div>
      </section>

      {error && <div className="notice error">{error}</div>}
      {loading ? (
        <div className="empty">Loading your books…</div>
      ) : books.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📚</div>
          <h2>No books yet</h2>
          <p>Your published books will appear here.</p>
          <button className="primary" onClick={() => go('/create')}>Create your first book</button>
        </div>
      ) : (
        <div className="book-grid">
          {books.map(book => {
            const cover = book.pages?.[book.coverIndex || 0]
            return (
              <article className="book-card" key={book.id}>
                <button className="cover-button" onClick={() => go(`/book/${book.id}`)}>
                  {cover ? (
                    <img className="book-cover" src={pageUrl(book.id, cover.id, book.updatedAt)} alt="" />
                  ) : <div className="book-cover placeholder">📖</div>}
                </button>
                <div className="book-info">
                  <div>
                    <h3>{book.title}</h3>
                    <p>{book.pages?.length || 0} pages</p>
                  </div>
                  <div className="card-actions">
                    <button onClick={() => go(`/book/${book.id}`)}>Read</button>
                    <button className="danger-ghost" onClick={() => remove(book)}>Delete</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </Shell>
  )
}

function Creator({ go }) {
  const videoRef = useRef(null)
  const [title, setTitle] = useState('')
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [interval, setIntervalValue] = useState(2)
  const [frames, setFrames] = useState([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    frames.forEach(f => URL.revokeObjectURL(f.previewUrl))
  }, [videoUrl])

  function chooseVideo(file) {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      alert('Please choose a video file.')
      return
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    frames.forEach(f => URL.revokeObjectURL(f.previewUrl))
    setFrames([])
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setStatus('Video ready. Choose how often you want a frame, then generate.')
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
  }

  async function generateFrames() {
    const video = videoRef.current
    if (!video || !videoFile) return
    setStatus('Reading video…')
    setProgress(0)

    try {
      await ensureMetadata(video)
      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read this video duration.')

      frames.forEach(f => URL.revokeObjectURL(f.previewUrl))
      const next = []
      const times = []
      for (let t = 0; t < duration; t += Number(interval)) times.push(Math.min(t, Math.max(0, duration - 0.05)))
      if (times.length === 0) times.push(0)
      if (times.length > MAX_FRAMES) {
        throw new Error(`That setting would create ${times.length} frames. Choose a longer interval so the book stays under ${MAX_FRAMES} pages.`)
      }

      for (let i = 0; i < times.length; i++) {
        setStatus(`Creating frame ${i + 1} of ${times.length}…`)
        await seekVideo(video, times[i])
        const blob = await videoToImageBlob(video)
        next.push({
          id: uid(),
          timestamp: times[i],
          blob,
          previewUrl: URL.createObjectURL(blob),
          caption: '',
        })
        setProgress(Math.round(((i + 1) / times.length) * 100))
        await new Promise(r => setTimeout(r, 0))
      }

      setFrames(next)
      setStatus(`${next.length} frames created. Delete any you do not want, then publish.`)
    } catch (e) {
      setStatus(`Could not generate frames: ${e.message}`)
    }
  }

  function deleteFrame(id) {
    setFrames(prev => {
      const f = prev.find(x => x.id === id)
      if (f) URL.revokeObjectURL(f.previewUrl)
      return prev.filter(x => x.id !== id)
    })
  }

  function updateCaption(id, caption) {
    setFrames(prev => prev.map(f => f.id === id ? { ...f, caption } : f))
  }

  function moveFrame(from, to) {
    if (from === to || from == null || to == null) return
    setFrames(prev => {
      const copy = [...prev]
      const [item] = copy.splice(from, 1)
      copy.splice(to, 0, item)
      return copy
    })
  }

  async function publish() {
    if (!title.trim()) return alert('Add a book title first.')
    if (frames.length === 0) return alert('Generate and keep at least one frame first.')

    setPublishing(true)
    setProgress(0)
    const bookId = uid()
    const now = new Date().toISOString()

    try {
      for (let i = 0; i < frames.length; i++) {
        setStatus(`Uploading page ${i + 1} of ${frames.length}…`)
        const f = frames[i]
        const qs = new URLSearchParams({ bookId, pageId: f.id })
        await api(`${API_PAGE}?${qs.toString()}`, {
          method: 'POST',
          headers: { 'content-type': f.blob.type || 'image/jpeg' },
          body: f.blob,
        })
        setProgress(Math.round(((i + 1) / (frames.length + 1)) * 100))
      }

      setStatus('Saving book…')
      const manifest = {
        id: bookId,
        title: title.trim(),
        createdAt: now,
        updatedAt: now,
        coverIndex: 0,
        pages: frames.map((f, index) => ({
          id: f.id,
          order: index,
          timestamp: f.timestamp,
          caption: f.caption.trim(),
        })),
      }
      await api(API_BOOKS, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(manifest),
      })
      setProgress(100)
      setStatus('Published!')
      go(`/book/${bookId}`)
    } catch (e) {
      setStatus(`Publish failed: ${e.message}`)
      alert(`Publish failed: ${e.message}`)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Shell
      title="Create a Book"
      actions={<button onClick={() => go('/')}>← My books</button>}
    >
      <div className="creator-layout">
        <section className="panel upload-panel">
          <div className="field-row">
            <label className="grow">
              <span>Book title</span>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Making Pancakes" />
            </label>
            <label>
              <span>Frame every</span>
              <select value={interval} onChange={e => setIntervalValue(Number(e.target.value))}>
                <option value={0.5}>0.5 seconds</option>
                <option value={1}>1 second</option>
                <option value={2}>2 seconds</option>
                <option value={3}>3 seconds</option>
                <option value={5}>5 seconds</option>
              </select>
            </label>
          </div>

          <label className="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); chooseVideo(e.dataTransfer.files?.[0]) }}>
            <input type="file" accept="video/*" onChange={e => chooseVideo(e.target.files?.[0])} />
            <div className="drop-icon">🎬</div>
            <strong>{videoFile ? videoFile.name : 'Drop a video here'}</strong>
            <span>{videoFile ? 'Choose another video' : 'or click to choose a video'}</span>
          </label>

          {videoUrl && (
            <div className="video-box">
              <video ref={videoRef} src={videoUrl} controls preload="metadata" playsInline />
              <button className="primary large" onClick={generateFrames} disabled={publishing}>Generate frames</button>
            </div>
          )}

          {status && (
            <div className="status-box">
              <span>{status}</span>
              {(progress > 0 && progress < 100) && <div className="progress"><i style={{ width: `${progress}%` }} /></div>}
            </div>
          )}
        </section>

        {frames.length > 0 && (
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">FRAME EDITOR</p>
                <h2>{frames.length} pages kept</h2>
                <p>Delete unwanted frames. Drag cards to change the page order. Captions are optional.</p>
              </div>
              <button className="publish" onClick={publish} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish eBook'}</button>
            </div>

            <div className="frame-grid">
              {frames.map((frame, index) => (
                <article
                  className="frame-card"
                  key={frame.id}
                  draggable={!publishing}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { moveFrame(dragIndex, index); setDragIndex(null) }}
                >
                  <div className="frame-number">{index + 1}</div>
                  <img src={frame.previewUrl} alt={`Frame at ${fmtTime(frame.timestamp)}`} />
                  <div className="frame-meta">
                    <span>{fmtTime(frame.timestamp)}</span>
                    <button className="delete" onClick={() => deleteFrame(frame.id)} disabled={publishing}>Delete</button>
                  </div>
                  <input
                    className="caption-input"
                    value={frame.caption}
                    onChange={e => updateCaption(frame.id, e.target.value)}
                    placeholder="Optional page caption…"
                    disabled={publishing}
                  />
                  <div className="drag-hint">⋮⋮ drag to reorder</div>
                </article>
              ))}
            </div>

            <div className="publish-bottom">
              <button className="publish large" onClick={publish} disabled={publishing}>{publishing ? 'Publishing…' : `Publish ${frames.length}-page eBook`}</button>
            </div>
          </section>
        )}
      </div>
    </Shell>
  )
}

function Reader({ bookId, go }) {
  const [book, setBook] = useState(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await api(`${API_BOOKS}?id=${encodeURIComponent(bookId)}`)
        if (active) setBook(data.book)
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [bookId])

  const pages = book?.pages || []
  const page = pages[index]

  function previous() { setIndex(i => Math.max(0, i - 1)) }
  function next() { setIndex(i => Math.min(pages.length - 1, i + 1)) }

  useEffect(() => {
    function key(e) {
      if (e.key === 'ArrowLeft') previous()
      if (e.key === 'ArrowRight' || e.key === ' ') next()
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [pages.length])

  const touch = useRef(null)
  function onTouchStart(e) { touch.current = e.touches[0]?.clientX }
  function onTouchEnd(e) {
    if (touch.current == null) return
    const x = e.changedTouches[0]?.clientX
    const d = x - touch.current
    if (Math.abs(d) > 50) d < 0 ? next() : previous()
    touch.current = null
  }

  if (loading) return <div className="reader-message">Loading book…</div>
  if (error || !book) return <div className="reader-message"><h2>Could not open book</h2><p>{error}</p><button onClick={() => go('/')}>Back to library</button></div>
  if (!page) return <div className="reader-message"><h2>This book has no pages.</h2><button onClick={() => go('/')}>Back</button></div>

  return (
    <div className={`reader ${fullscreen ? 'is-fullscreen' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="reader-top">
        <button onClick={() => go('/')}>← Library</button>
        <h1>{book.title}</h1>
        <button onClick={() => setFullscreen(v => !v)}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
      </header>

      <div className="reader-stage">
        <button className="nav-side left" onClick={previous} disabled={index === 0} aria-label="Previous page">‹</button>
        <figure className="reader-page">
          <img src={pageUrl(book.id, page.id, book.updatedAt)} alt={`Page ${index + 1}`} />
          {page.caption && <figcaption>{page.caption}</figcaption>}
        </figure>
        <button className="nav-side right" onClick={next} disabled={index === pages.length - 1} aria-label="Next page">›</button>
      </div>

      <footer className="reader-footer">
        <button onClick={previous} disabled={index === 0}>← Previous</button>
        <div className="page-count"><strong>{index + 1}</strong> / {pages.length}</div>
        <button onClick={next} disabled={index === pages.length - 1}>Next →</button>
      </footer>
    </div>
  )
}

function ensureMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve() }
    const fail = () => { cleanup(); reject(new Error('Video metadata could not be loaded.')) }
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('error', fail)
    }
    video.addEventListener('loadedmetadata', done, { once: true })
    video.addEventListener('error', fail, { once: true })
  })
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.02 && video.readyState >= 2) return resolve()
    const done = () => { cleanup(); requestAnimationFrame(resolve) }
    const fail = () => { cleanup(); reject(new Error('Could not seek in this video.')) }
    const cleanup = () => {
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', fail)
    }
    video.addEventListener('seeked', done, { once: true })
    video.addEventListener('error', fail, { once: true })
    video.currentTime = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.01)))
  })
}

function videoToImageBlob(video) {
  const sourceW = video.videoWidth || 1280
  const sourceH = video.videoHeight || 720
  const scale = Math.min(1, MAX_PAGE_WIDTH / sourceW)
  const w = Math.max(1, Math.round(sourceW * scale))
  const h = Math.max(1, Math.round(sourceH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { alpha: false })
  ctx.drawImage(video, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create an image from the frame.')), 'image/jpeg', JPEG_QUALITY)
  })
}

createRoot(document.getElementById('root')).render(<App />)
