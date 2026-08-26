const NV2_API = '/.netlify/functions/narration'
const nv2q = (selector, root = document) => root.querySelector(selector)
const nv2qa = (selector, root = document) => [...root.querySelectorAll(selector)]

let nv2Editor = null
let nv2Initialising = ''
let nv2Recorder = null
let nv2Preview = null
let nv2PreviewPageId = ''
let nv2SaveBusy = false
let nv2Reader = { bookId:'', book:null, pageId:'', audio:null, oldVolume:null }

const nv2BaseFetch = window.__ambientOriginalFetch || window.fetch.bind(window)

function nv2AudioUrl(bookId, pageId, version = '') {
  const qs = new URLSearchParams({ bookId, pageId })
  if (version) qs.set('v', version)
  return `${NV2_API}?${qs}`
}

function nv2AddStyles() {
  if (nv2q('#narration-v2-styles')) return
  const style = document.createElement('style')
  style.id = 'narration-v2-styles'
  style.textContent = `
    .nv2-tools{margin-top:9px;padding:9px;border:1px solid #e4dbcf;border-radius:11px;background:#faf7f1}
    .nv2-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
    .nv2-head strong{font-size:.76rem;color:#4c554f}.nv2-status{font-size:.69rem;color:#81786d;text-align:right}
    .nv2-actions{display:flex;gap:6px;flex-wrap:wrap}.nv2-actions button{padding:6px 8px!important;font-size:.72rem!important;border-radius:9px!important}
    .nv2-record{background:#fff4f1!important;color:#9b3b31!important;border-color:#e9c9c3!important}.nv2-stop{background:#a43c30!important;color:#fff!important;border-color:#a43c30!important}.nv2-remove{color:#a43c30!important}
    .nv2-dot{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:#c54032;animation:nv2pulse 1s infinite}@keyframes nv2pulse{50%{opacity:.3}}
    .nv2-reader-hint{position:fixed;left:50%;bottom:72px;z-index:26000;transform:translateX(-50%);border:0;border-radius:999px;padding:8px 12px;background:#171714e8;color:#fff;font-size:.76rem;font-weight:850;box-shadow:0 6px 24px #0005}
    @media(max-width:720px){.nv2-actions button{flex:1}.nv2-reader-hint{bottom:62px}}
  `
  document.head.appendChild(style)
}

function nv2BookIdFromEditor() {
  const image = nv2q('.book-edit-grid .book-edit-card img')
  if (!image?.src) return ''
  try { return new URL(image.src).searchParams.get('bookId') || '' } catch { return '' }
}

function nv2PageIdFromCard(card) {
  if (!card) return ''
  if (card.dataset.nv2PageId) return card.dataset.nv2PageId
  const image = nv2q('img', card)
  if (!image?.src) return ''
  try { return new URL(image.src).searchParams.get('pageId') || '' } catch { return '' }
}

function nv2NewItem(page = {}) {
  return {
    wasExisting: !!page.narration,
    present: !!page.narration,
    removed: false,
    pendingBlob: null,
    previewUrl: '',
    contentType: page.narrationType || 'audio/webm',
  }
}

function nv2Item(pageId) {
  if (!nv2Editor) return null
  if (!nv2Editor.items.has(pageId)) nv2Editor.items.set(pageId, nv2NewItem())
  return nv2Editor.items.get(pageId)
}

async function nv2InitEditor(bookId) {
  if (!bookId || nv2Initialising === bookId) return
  if (nv2Editor?.bookId === bookId) return nv2SyncEditorTools()
  nv2Initialising = bookId
  try {
    const response = await nv2BaseFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
    if (!response.ok) throw new Error('Could not load narration details.')
    const data = await response.json()
    if (!nv2q('.book-edit-backdrop') || nv2BookIdFromEditor() !== bookId) return
    const book = data.book
    const items = new Map()
    ;(book.pages || []).forEach(page => items.set(page.id, nv2NewItem(page)))
    nv2Editor = {
      bookId,
      book,
      items,
      initialIds: new Set((book.pages || []).map(page => page.id)),
    }
    nv2SyncEditorTools()
  } catch (error) {
    console.warn('Narration editor:', error)
  } finally {
    if (nv2Initialising === bookId) nv2Initialising = ''
  }
}

function nv2FormatTime(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function nv2Mime() {
  if (!window.MediaRecorder) return ''
  return ['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type => MediaRecorder.isTypeSupported?.(type)) || ''
}

function nv2StopPreview() {
  if (nv2Preview) {
    nv2Preview.pause()
    nv2Preview.currentTime = 0
  }
  const oldPage = nv2PreviewPageId
  nv2Preview = null
  nv2PreviewPageId = ''
  if (oldPage) nv2RenderPageTool(oldPage, true)
}

async function nv2PlayPreview(pageId) {
  if (!nv2Editor) return
  if (nv2PreviewPageId === pageId && nv2Preview) return nv2StopPreview()
  nv2StopPreview()
  const item = nv2Item(pageId)
  if (!item?.present) return
  const source = item.previewUrl || nv2AudioUrl(nv2Editor.bookId, pageId, nv2Editor.book?.updatedAt || '')
  const audio = new Audio(source)
  nv2Preview = audio
  nv2PreviewPageId = pageId
  audio.onended = nv2StopPreview
  audio.onerror = () => { nv2StopPreview(); alert('Could not play this recording.') }
  nv2RenderPageTool(pageId, true)
  try { await audio.play() } catch { nv2StopPreview() }
}

async function nv2StartRecording(pageId) {
  if (!nv2Editor || !pageId) return
  if (nv2Recorder) return alert('Finish the current recording first.')
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return alert('Microphone recording is not supported in this browser.')
  nv2StopPreview()
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true } })
    const mimeType = nv2Mime()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const state = { pageId, recorder, stream, chunks:[], startedAt:Date.now(), timer:null, cancelled:false }
    nv2Recorder = state
    recorder.ondataavailable = event => { if (event.data?.size) state.chunks.push(event.data) }
    recorder.onstop = () => {
      clearInterval(state.timer)
      stream.getTracks().forEach(track => track.stop())
      if (!state.cancelled && nv2Editor) {
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(state.chunks, { type })
        if (blob.size) {
          const item = nv2Item(pageId)
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
          item.pendingBlob = blob
          item.previewUrl = URL.createObjectURL(blob)
          item.contentType = type
          item.present = true
          item.removed = false
        }
      }
      nv2Recorder = null
      const save = nv2q('.book-edit-save')
      if (save && !nv2SaveBusy) save.disabled = false
      nv2RenderPageTool(pageId, true)
    }
    recorder.start(250)
    state.timer = setInterval(() => {
      const tool = nv2qa('.nv2-tools').find(el => el.dataset.pageId === pageId)
      const status = nv2q('.nv2-status', tool || document)
      if (status) status.innerHTML = `<span class="nv2-dot"></span>Recording ${nv2FormatTime(Date.now() - state.startedAt)}`
    }, 500)
    const save = nv2q('.book-edit-save')
    if (save) save.disabled = true
    nv2RenderPageTool(pageId, true)
  } catch (error) {
    nv2Recorder = null
    if (error?.name === 'NotAllowedError') alert('Microphone access was not allowed. Please allow microphone access and try again.')
    else alert('Could not start the microphone.')
  }
}

function nv2StopRecording(cancelled = false) {
  const state = nv2Recorder
  if (!state) return
  state.cancelled = cancelled
  clearInterval(state.timer)
  if (state.recorder.state !== 'inactive') state.recorder.stop()
  else state.stream.getTracks().forEach(track => track.stop())
}

function nv2Remove(pageId) {
  const item = nv2Item(pageId)
  if (!item) return
  if (nv2Recorder?.pageId === pageId) nv2StopRecording(true)
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  item.previewUrl = ''
  item.pendingBlob = null
  item.present = false
  item.removed = true
  if (nv2PreviewPageId === pageId) nv2StopPreview()
  nv2RenderPageTool(pageId, true)
}

function nv2RenderPageTool(pageId, force = false) {
  if (!nv2Editor || !pageId) return
  const card = nv2qa('.book-edit-card').find(el => nv2PageIdFromCard(el) === pageId)
  if (!card) return
  card.dataset.nv2PageId = pageId
  let tool = nv2q('.nv2-tools', card)
  if (!tool) {
    tool = document.createElement('div')
    tool.className = 'nv2-tools'
    const drag = nv2q('.book-edit-drag', card)
    card.insertBefore(tool, drag || null)
  }
  const item = nv2Item(pageId)
  const recording = nv2Recorder?.pageId === pageId
  const playing = nv2PreviewPageId === pageId && !!nv2Preview
  const signature = [pageId, recording, playing, !!item?.present, !!item?.pendingBlob, !!item?.removed].join('|')
  if (!force && tool.dataset.signature === signature) return
  tool.dataset.signature = signature
  tool.dataset.pageId = pageId
  const status = recording ? '<span class="nv2-dot"></span>Recording…' : item?.pendingBlob ? 'New recording ready to save' : item?.present ? 'Recording saved' : 'No recording'
  tool.innerHTML = `<div class="nv2-head"><strong>🎙 Page narration</strong><span class="nv2-status">${status}</span></div><div class="nv2-actions"></div>`
  const actions = nv2q('.nv2-actions', tool)
  if (recording) {
    const stop = document.createElement('button')
    stop.type = 'button'; stop.className = 'nv2-stop'; stop.textContent = '■ Stop recording'
    stop.onclick = e => { e.preventDefault(); e.stopPropagation(); nv2StopRecording(false) }
    actions.appendChild(stop)
    return
  }
  if (item?.present) {
    const play = document.createElement('button')
    play.type = 'button'; play.textContent = playing ? '■ Stop preview' : '▶ Play'
    play.onclick = e => { e.preventDefault(); e.stopPropagation(); nv2PlayPreview(pageId) }
    actions.appendChild(play)
  }
  const record = document.createElement('button')
  record.type = 'button'; record.className = 'nv2-record'; record.textContent = item?.present ? '🎙 Re-record' : '🎙 Record'
  record.onclick = e => { e.preventDefault(); e.stopPropagation(); nv2StartRecording(pageId) }
  actions.appendChild(record)
  if (item?.present) {
    const remove = document.createElement('button')
    remove.type = 'button'; remove.className = 'nv2-remove'; remove.textContent = 'Remove'
    remove.onclick = e => { e.preventDefault(); e.stopPropagation(); nv2Remove(pageId) }
    actions.appendChild(remove)
  }
}

function nv2SyncEditorTools() {
  if (!nv2Editor?.bookId || !nv2q('.book-edit-backdrop')) return
  nv2qa('.book-edit-card').forEach(card => {
    const pageId = nv2PageIdFromCard(card)
    if (pageId) nv2RenderPageTool(pageId)
  })
}

function nv2CleanupEditor() {
  if (nv2Recorder) nv2StopRecording(true)
  nv2StopPreview()
  nv2Editor?.items?.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl) })
  nv2Editor = null
  nv2Initialising = ''
}

async function nv2Upload(bookId, pageId, item) {
  const response = await nv2BaseFetch(`${NV2_API}?bookId=${encodeURIComponent(bookId)}&pageId=${encodeURIComponent(pageId)}`, {
    method:'POST', headers:{ 'content-type':item.pendingBlob.type || item.contentType || 'audio/webm' }, body:item.pendingBlob,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'Could not save a page recording.')
  }
  item.wasExisting = true
  item.present = true
  item.removed = false
  item.contentType = item.pendingBlob.type || item.contentType || 'audio/webm'
  item.pendingBlob = null
}

async function nv2Delete(bookId, pageId) {
  const response = await nv2BaseFetch(`${NV2_API}?bookId=${encodeURIComponent(bookId)}&pageId=${encodeURIComponent(pageId)}`, { method:'DELETE' })
  if (!response.ok) throw new Error('Could not remove a page recording.')
}

function nv2InstallSavePatch() {
  if (window.__narrationV2FetchPatch) return
  window.__narrationV2FetchPatch = true
  const previous = window.__ambientOriginalFetch || window.fetch.bind(window)
  window.__ambientOriginalFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
    if (method === 'POST' && url.includes('/.netlify/functions/books') && typeof init?.body === 'string' && nv2Editor) {
      let body = null
      try { body = JSON.parse(init.body) } catch {}
      if (body?.id === nv2Editor.bookId && Array.isArray(body.pages)) {
        if (nv2Recorder) throw new Error('Stop the page recording before saving the book.')
        nv2SaveBusy = true
        const currentIds = new Set(body.pages.map(page => page.id))
        try {
          for (const page of body.pages) {
            const item = nv2Item(page.id)
            if (item?.pendingBlob) await nv2Upload(body.id, page.id, item)
            if (item?.removed && item.wasExisting) {
              await nv2Delete(body.id, page.id)
              item.wasExisting = false
            }
            if (item?.present) {
              page.narration = true
              page.narrationType = item.contentType || 'audio/webm'
            } else {
              delete page.narration
              delete page.narrationType
            }
          }
          for (const pageId of nv2Editor.initialIds) {
            if (currentIds.has(pageId)) continue
            const item = nv2Editor.items.get(pageId)
            if (item?.wasExisting) await nv2Delete(body.id, pageId)
          }
          init = { ...init, body:JSON.stringify(body) }
        } finally {
          nv2SaveBusy = false
        }
      }
    }
    return previous(input, init)
  }
}

function nv2CurrentReaderBookId() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function nv2CurrentReaderPageId() {
  const image = nv2q('.reader-page img')
  if (!image?.src) return ''
  try { return new URL(image.src).searchParams.get('pageId') || '' } catch { return '' }
}

function nv2RestoreBackground() {
  if (nv2Reader.oldVolume == null) return
  const slider = nv2q('.ambient-toolbar input[type="range"]')
  if (slider) {
    slider.value = String(nv2Reader.oldVolume)
    slider.dispatchEvent(new Event('input', { bubbles:true }))
  }
  nv2Reader.oldVolume = null
}

function nv2DuckBackground() {
  const slider = nv2q('.ambient-toolbar input[type="range"]')
  if (!slider || nv2Reader.oldVolume != null) return
  const value = Number(slider.value)
  nv2Reader.oldVolume = Number.isFinite(value) ? value : 0.26
  slider.value = String(Math.max(0.02, nv2Reader.oldVolume * 0.25))
  slider.dispatchEvent(new Event('input', { bubbles:true }))
}

function nv2StopReaderAudio() {
  if (nv2Reader.audio) {
    nv2Reader.audio.pause()
    nv2Reader.audio.currentTime = 0
    nv2Reader.audio = null
  }
  nv2RestoreBackground()
  nv2q('.nv2-reader-hint')?.remove()
}

function nv2ShowTapHint(pageId) {
  if (nv2q('.nv2-reader-hint') || !nv2q('.reader')) return
  const hint = document.createElement('button')
  hint.type = 'button'; hint.className = 'nv2-reader-hint'; hint.textContent = '🔊 Tap to hear this page'
  hint.onclick = () => { hint.remove(); nv2PlayReaderPage(pageId, true) }
  document.body.appendChild(hint)
}

async function nv2LoadReaderBook(bookId) {
  try {
    const response = await nv2BaseFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
    if (!response.ok) return null
    return (await response.json()).book || null
  } catch { return null }
}

async function nv2PlayReaderPage(pageId, force = false) {
  const { bookId, book } = nv2Reader
  if (!bookId || !book || !pageId) return
  const page = book.pages?.find(entry => entry.id === pageId)
  if (!page?.narration) return
  if (!force && nv2Reader.audio) return
  nv2StopReaderAudio()
  nv2DuckBackground()
  const audio = new Audio(nv2AudioUrl(bookId, pageId, book.updatedAt || ''))
  audio.preload = 'auto'; audio.volume = 1
  nv2Reader.audio = audio
  audio.onended = () => { if (nv2Reader.audio === audio) nv2Reader.audio = null; nv2RestoreBackground() }
  audio.onerror = () => { if (nv2Reader.audio === audio) nv2Reader.audio = null; nv2RestoreBackground() }
  try { await audio.play() }
  catch { if (nv2Reader.audio === audio) nv2Reader.audio = null; nv2RestoreBackground(); nv2ShowTapHint(pageId) }
}

async function nv2SyncReader() {
  const bookId = nv2CurrentReaderBookId()
  const reader = nv2q('.reader')
  if (!reader || !bookId) {
    if (nv2Reader.bookId) {
      nv2StopReaderAudio()
      nv2Reader = { bookId:'', book:null, pageId:'', audio:null, oldVolume:null }
    }
    return
  }
  if (nv2Reader.bookId !== bookId) {
    nv2StopReaderAudio()
    nv2Reader = { bookId, book:null, pageId:'', audio:null, oldVolume:null }
    nv2Reader.book = await nv2LoadReaderBook(bookId)
    if (!nv2Reader.book || nv2Reader.bookId !== bookId) return
  }
  const pageId = nv2CurrentReaderPageId()
  if (!pageId || pageId === nv2Reader.pageId) return
  nv2Reader.pageId = pageId
  nv2StopReaderAudio()
  setTimeout(() => nv2PlayReaderPage(pageId, false), 60)
}

function nv2Sync() {
  nv2AddStyles()
  const editor = nv2q('.book-edit-backdrop')
  if (editor) {
    const bookId = nv2BookIdFromEditor()
    if (bookId && nv2Editor?.bookId !== bookId) nv2InitEditor(bookId)
    else nv2SyncEditorTools()
  } else if (nv2Editor && !nv2SaveBusy) {
    nv2CleanupEditor()
  }
  nv2SyncReader()
}

nv2AddStyles()
nv2InstallSavePatch()
const nv2Observer = new MutationObserver(() => nv2Sync())
nv2Observer.observe(document.documentElement, { childList:true, subtree:true })
window.addEventListener('popstate', () => setTimeout(nv2Sync, 0))
setInterval(nv2Sync, 350)
nv2Sync()
