const NARRATION_API = '/.netlify/functions/narration'
const nq = (selector, root = document) => root.querySelector(selector)
const nqa = (selector, root = document) => [...root.querySelectorAll(selector)]

let narrationEditor = null
let narrationRecorder = null
let narrationPreviewAudio = null
let narrationDrag = null
let narrationSaveBusy = false
let readerNarration = { bookId: '', book: null, index: -1, audio: null, duckedVolume: null, blocked: false }

const narrationBaseFetch = window.__ambientOriginalFetch || window.fetch.bind(window)

function narrationUrl(bookId, pageId, cache = '') {
  const qs = new URLSearchParams({ bookId, pageId })
  if (cache) qs.set('v', cache)
  return `${NARRATION_API}?${qs}`
}

function addNarrationStyles() {
  if (nq('#narration-styles')) return
  const style = document.createElement('style')
  style.id = 'narration-styles'
  style.textContent = `
    .page-narration-tools{margin-top:9px;padding:9px;border:1px solid #e3dbcf;border-radius:11px;background:#faf7f1}
    .page-narration-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.page-narration-head strong{font-size:.76rem;color:#4c554f}.page-narration-status{font-size:.7rem;color:#81786d}
    .page-narration-actions{display:flex;gap:6px;flex-wrap:wrap}.page-narration-actions button{padding:6px 8px!important;font-size:.72rem!important;border-radius:9px!important}.page-narration-record{background:#fff4f1!important;color:#9b3b31!important;border-color:#e9c9c3!important}.page-narration-stop{background:#a43c30!important;color:white!important;border-color:#a43c30!important}.page-narration-remove{color:#a43c30!important}
    .page-narration-dot{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:#c54032;animation:narrationPulse 1s infinite}@keyframes narrationPulse{50%{opacity:.3}}
    .reader-narration-hint{position:fixed;left:50%;bottom:72px;z-index:25000;transform:translateX(-50%);border:0;border-radius:999px;padding:8px 12px;background:#171714df;color:#fff;font-size:.76rem;font-weight:850;box-shadow:0 6px 24px #0005;opacity:.9}
    @media(max-width:720px){.page-narration-actions button{flex:1}.reader-narration-hint{bottom:62px}}
  `
  document.head.appendChild(style)
}

function editorBookIdFromButton(button) {
  const card = button?.closest('.book-card')
  const image = nq('.book-cover', card || document)
  if (!image?.src) return ''
  try { return new URL(image.src).searchParams.get('bookId') || '' } catch { return '' }
}

async function beginNarrationEditor(bookId) {
  if (!bookId) return
  narrationEditor = { bookId, book: null, pageOrder: [], items: new Map(), initialIds: new Set() }
  try {
    const response = await narrationBaseFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
    if (!response.ok) throw new Error('Could not load narration details.')
    const data = await response.json()
    if (!narrationEditor || narrationEditor.bookId !== bookId) return
    const book = data.book
    narrationEditor.book = book
    narrationEditor.pageOrder = (book.pages || []).map(page => page.id)
    narrationEditor.initialIds = new Set(narrationEditor.pageOrder)
    ;(book.pages || []).forEach(page => {
      narrationEditor.items.set(page.id, {
        wasExisting: !!page.narration,
        present: !!page.narration,
        removed: false,
        pendingBlob: null,
        previewUrl: '',
        contentType: page.narrationType || 'audio/webm',
      })
    })
    syncNarrationEditorUi()
  } catch (error) {
    console.warn(error)
  }
}

function endNarrationEditor() {
  stopNarrationPreview()
  if (narrationRecorder) stopPageRecording(true)
  if (narrationEditor) {
    narrationEditor.items.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl) })
  }
  narrationEditor = null
  narrationDrag = null
}

function parsePageIdFromCard(card) {
  if (!card) return ''
  if (card.dataset.narrationPageId) return card.dataset.narrationPageId
  const image = nq('img', card)
  if (image?.src) {
    try {
      const url = new URL(image.src)
      const pageId = url.searchParams.get('pageId')
      if (pageId) return pageId
    } catch {}
  }
  return ''
}

function itemForPage(pageId) {
  if (!narrationEditor) return null
  if (!narrationEditor.items.has(pageId)) {
    narrationEditor.items.set(pageId, { wasExisting:false, present:false, removed:false, pendingBlob:null, previewUrl:'', contentType:'audio/webm' })
  }
  return narrationEditor.items.get(pageId)
}

function formatRecordingTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function updateRecordingClock() {
  if (!narrationRecorder) return
  const elapsed = (Date.now() - narrationRecorder.startedAt) / 1000
  const tool = nqa('.page-narration-tools').find(el => el.dataset.pageId === narrationRecorder.pageId)
  const status = nq('.page-narration-status', tool || document)
  if (status) status.innerHTML = `<span class="page-narration-dot"></span>Recording ${formatRecordingTime(elapsed)}`
}

function preferredRecordingMime() {
  if (!window.MediaRecorder) return ''
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find(type => MediaRecorder.isTypeSupported?.(type)) || ''
}

async function startPageRecording(pageId) {
  if (!narrationEditor || !pageId) return
  if (narrationRecorder) return alert('Finish the current recording first.')
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return alert('Microphone recording is not supported in this browser.')

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true } })
    const mimeType = preferredRecordingMime()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const chunks = []
    const state = { pageId, recorder, stream, chunks, startedAt:Date.now(), timer:null, cancelled:false }
    narrationRecorder = state
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
    recorder.onstop = () => {
      clearInterval(state.timer)
      state.stream.getTracks().forEach(track => track.stop())
      if (!state.cancelled && narrationEditor) {
        const actualType = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type:actualType })
        if (blob.size) {
          const item = itemForPage(pageId)
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
          item.pendingBlob = blob
          item.previewUrl = URL.createObjectURL(blob)
          item.contentType = actualType
          item.present = true
          item.removed = false
        }
      }
      narrationRecorder = null
      const save = nq('.book-edit-save')
      if (save && !narrationSaveBusy) save.disabled = false
      syncNarrationEditorUi()
    }
    recorder.start(250)
    state.timer = setInterval(updateRecordingClock, 500)
    const save = nq('.book-edit-save')
    if (save) save.disabled = true
    syncNarrationEditorUi()
    updateRecordingClock()
  } catch (error) {
    narrationRecorder = null
    alert(error?.name === 'NotAllowedError' ? 'Microphone access was not allowed. Please allow microphone access and try again.' : 'Could not start the microphone.')
  }
}

function stopPageRecording(cancelled = false) {
  const state = narrationRecorder
  if (!state) return
  state.cancelled = cancelled
  clearInterval(state.timer)
  if (state.recorder.state !== 'inactive') state.recorder.stop()
  else state.stream.getTracks().forEach(track => track.stop())
}

function stopNarrationPreview() {
  if (narrationPreviewAudio) {
    narrationPreviewAudio.pause()
    narrationPreviewAudio.currentTime = 0
    narrationPreviewAudio = null
  }
  syncNarrationEditorUi()
}

function playEditorNarration(pageId) {
  if (!narrationEditor) return
  const item = itemForPage(pageId)
  if (!item?.present) return
  if (narrationPreviewAudio) return stopNarrationPreview()
  const source = item.previewUrl || narrationUrl(narrationEditor.bookId, pageId, narrationEditor.book?.updatedAt || '')
  const audio = new Audio(source)
  narrationPreviewAudio = audio
  audio.onended = () => { narrationPreviewAudio = null; syncNarrationEditorUi() }
  audio.onerror = () => { narrationPreviewAudio = null; syncNarrationEditorUi(); alert('Could not play this recording.') }
  audio.play().catch(() => { narrationPreviewAudio = null; syncNarrationEditorUi() })
  syncNarrationEditorUi()
}

function removeEditorNarration(pageId) {
  const item = itemForPage(pageId)
  if (!item) return
  if (narrationRecorder?.pageId === pageId) stopPageRecording(true)
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  item.previewUrl = ''
  item.pendingBlob = null
  item.present = false
  item.removed = true
  stopNarrationPreview()
  syncNarrationEditorUi()
}

function renderNarrationTool(card, pageId) {
  let tool = nq('.page-narration-tools', card)
  if (!tool) {
    tool = document.createElement('div')
    tool.className = 'page-narration-tools'
    const dragHint = nq('.book-edit-drag', card)
    card.insertBefore(tool, dragHint || null)
  }
  tool.dataset.pageId = pageId
  const item = itemForPage(pageId)
  const recording = narrationRecorder?.pageId === pageId
  const playing = !!narrationPreviewAudio
  const statusText = recording
    ? '<span class="page-narration-dot"></span>Recording…'
    : item?.pendingBlob
      ? 'New voice recording ready to save'
      : item?.present
        ? 'Voice recording saved'
        : 'No voice recording'

  tool.innerHTML = `<div class="page-narration-head"><strong>🎙 Page narration</strong><span class="page-narration-status">${statusText}</span></div><div class="page-narration-actions"></div>`
  const actions = nq('.page-narration-actions', tool)

  if (recording) {
    const stop = document.createElement('button')
    stop.type = 'button'
    stop.className = 'page-narration-stop'
    stop.textContent = '■ Stop recording'
    stop.onclick = event => { event.preventDefault(); event.stopPropagation(); stopPageRecording(false) }
    actions.appendChild(stop)
    return
  }

  if (item?.present) {
    const play = document.createElement('button')
    play.type = 'button'
    play.textContent = playing ? '■ Stop preview' : '▶ Play'
    play.onclick = event => { event.preventDefault(); event.stopPropagation(); playEditorNarration(pageId) }
    actions.appendChild(play)
  }

  const record = document.createElement('button')
  record.type = 'button'
  record.className = 'page-narration-record'
  record.textContent = item?.present ? '🎙 Re-record' : '🎙 Record'
  record.onclick = event => { event.preventDefault(); event.stopPropagation(); startPageRecording(pageId) }
  actions.appendChild(record)

  if (item?.present) {
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'page-narration-remove'
    remove.textContent = 'Remove'
    remove.onclick = event => { event.preventDefault(); event.stopPropagation(); removeEditorNarration(pageId) }
    actions.appendChild(remove)
  }
}

function syncNarrationEditorUi() {
  const grid = nq('.book-edit-grid')
  if (!grid || !narrationEditor?.book) return
  const cards = nqa('.book-edit-card', grid)
  if (!cards.length) return

  cards.forEach((card, index) => {
    let pageId = parsePageIdFromCard(card)
    if (!pageId) pageId = narrationEditor.pageOrder[index] || ''
    if (!pageId) return
    card.dataset.narrationPageId = pageId
    if (narrationEditor.pageOrder[index] !== pageId) narrationEditor.pageOrder[index] = pageId
    renderNarrationTool(card, pageId)
  })
}

function captureEditorOrdering() {
  document.addEventListener('dragstart', event => {
    const card = event.target.closest?.('.book-edit-card')
    if (!card || !narrationEditor) return
    const cards = nqa('.book-edit-card', card.parentElement)
    narrationDrag = { pageId:parsePageIdFromCard(card), from:cards.indexOf(card) }
  }, true)

  document.addEventListener('drop', event => {
    const card = event.target.closest?.('.book-edit-card')
    if (!card || !narrationEditor || !narrationDrag?.pageId) return
    const cards = nqa('.book-edit-card', card.parentElement)
    const to = cards.indexOf(card)
    const { pageId, from } = narrationDrag
    setTimeout(() => {
      if (!narrationEditor) return
      const currentFrom = narrationEditor.pageOrder.indexOf(pageId)
      const sourceIndex = currentFrom >= 0 ? currentFrom : from
      if (sourceIndex >= 0 && to >= 0) {
        narrationEditor.pageOrder.splice(sourceIndex, 1)
        narrationEditor.pageOrder.splice(to, 0, pageId)
      }
      narrationDrag = null
      syncNarrationEditorUi()
    }, 20)
  }, true)

  document.addEventListener('click', event => {
    const edit = event.target.closest?.('.book-edit-button')
    if (edit) {
      const id = editorBookIdFromButton(edit)
      if (id) beginNarrationEditor(id)
      return
    }

    const deleteButton = event.target.closest?.('.book-edit-delete')
    if (deleteButton && narrationEditor) {
      const card = deleteButton.closest('.book-edit-card')
      const cards = nqa('.book-edit-card', card?.parentElement || document)
      const index = cards.indexOf(card)
      const pageId = parsePageIdFromCard(card) || narrationEditor.pageOrder[index]
      const before = cards.length
      setTimeout(() => {
        const after = nqa('.book-edit-card').length
        if (narrationEditor && pageId && after < before) {
          narrationEditor.pageOrder = narrationEditor.pageOrder.filter(id => id !== pageId)
          syncNarrationEditorUi()
        }
      }, 30)
      return
    }

    if (event.target.closest?.('.book-edit-cancel')) setTimeout(endNarrationEditor, 0)
  }, true)
}

async function uploadNarration(bookId, pageId, item) {
  const response = await narrationBaseFetch(`${NARRATION_API}?bookId=${encodeURIComponent(bookId)}&pageId=${encodeURIComponent(pageId)}`, {
    method:'POST',
    headers:{ 'content-type':item.pendingBlob.type || item.contentType || 'audio/webm' },
    body:item.pendingBlob,
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

async function deleteNarration(bookId, pageId) {
  const response = await narrationBaseFetch(`${NARRATION_API}?bookId=${encodeURIComponent(bookId)}&pageId=${encodeURIComponent(pageId)}`, { method:'DELETE' })
  if (!response.ok) throw new Error('Could not remove a page recording.')
}

function installNarrationManifestPatch() {
  const previousFetch = window.__ambientOriginalFetch || window.fetch.bind(window)
  window.__ambientOriginalFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()

    if (method === 'POST' && url.includes('/.netlify/functions/books') && typeof init?.body === 'string' && narrationEditor) {
      let body
      try { body = JSON.parse(init.body) } catch { body = null }
      if (body?.id === narrationEditor.bookId && Array.isArray(body.pages)) {
        if (narrationRecorder) throw new Error('Stop the page recording before saving the book.')
        narrationSaveBusy = true
        const currentIds = new Set(body.pages.map(page => page.id))

        try {
          for (const page of body.pages) {
            const item = itemForPage(page.id)
            if (item?.pendingBlob) await uploadNarration(body.id, page.id, item)
            if (item?.removed && item.wasExisting) {
              await deleteNarration(body.id, page.id)
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

          for (const pageId of narrationEditor.initialIds) {
            if (currentIds.has(pageId)) continue
            const item = narrationEditor.items.get(pageId)
            if (item?.wasExisting) await deleteNarration(body.id, pageId)
          }

          init = { ...init, body:JSON.stringify(body) }
        } finally {
          narrationSaveBusy = false
        }
      }
    }

    return previousFetch(input, init)
  }
}

function currentReaderBookId() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function currentReaderPageIndex() {
  const count = Number(nq('.page-count strong')?.textContent || 1)
  return Math.max(0, count - 1)
}

function stopReaderNarration() {
  if (readerNarration.audio) {
    readerNarration.audio.pause()
    readerNarration.audio.currentTime = 0
    readerNarration.audio = null
  }
  restoreBackgroundVolume()
  nq('.reader-narration-hint')?.remove()
}

function duckBackgroundVolume() {
  const slider = nq('.ambient-toolbar input[type="range"]')
  if (!slider || readerNarration.duckedVolume != null) return
  const value = Number(slider.value)
  readerNarration.duckedVolume = Number.isFinite(value) ? value : 0.26
  slider.value = String(Math.max(0.03, readerNarration.duckedVolume * 0.32))
  slider.dispatchEvent(new Event('input', { bubbles:true }))
}

function restoreBackgroundVolume() {
  if (readerNarration.duckedVolume == null) return
  const slider = nq('.ambient-toolbar input[type="range"]')
  if (slider) {
    slider.value = String(readerNarration.duckedVolume)
    slider.dispatchEvent(new Event('input', { bubbles:true }))
  }
  readerNarration.duckedVolume = null
}

function showNarrationTapHint() {
  if (nq('.reader-narration-hint') || !nq('.reader')) return
  const hint = document.createElement('button')
  hint.type = 'button'
  hint.className = 'reader-narration-hint'
  hint.textContent = '🔊 Tap to hear this page'
  hint.onclick = () => { hint.remove(); playCurrentReaderNarration(true) }
  document.body.appendChild(hint)
}

async function loadReaderNarrationBook(bookId) {
  try {
    const response = await narrationBaseFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
    if (!response.ok) return null
    const data = await response.json()
    return data.book || null
  } catch { return null }
}

async function playCurrentReaderNarration(force = false) {
  const bookId = currentReaderBookId()
  if (!bookId || !readerNarration.book || readerNarration.bookId !== bookId) return
  const index = currentReaderPageIndex()
  const page = readerNarration.book.pages?.[index]
  if (!page?.narration) return
  if (!force && readerNarration.audio) return

  stopReaderNarration()
  duckBackgroundVolume()
  const audio = new Audio(narrationUrl(bookId, page.id, readerNarration.book.updatedAt || ''))
  audio.preload = 'auto'
  audio.volume = 1
  readerNarration.audio = audio
  audio.onended = () => {
    if (readerNarration.audio === audio) readerNarration.audio = null
    restoreBackgroundVolume()
  }
  audio.onerror = () => {
    if (readerNarration.audio === audio) readerNarration.audio = null
    restoreBackgroundVolume()
  }
  try {
    await audio.play()
    readerNarration.blocked = false
  } catch {
    if (readerNarration.audio === audio) readerNarration.audio = null
    restoreBackgroundVolume()
    readerNarration.blocked = true
    showNarrationTapHint()
  }
}

async function syncReaderNarration() {
  const bookId = currentReaderBookId()
  const reader = nq('.reader')
  if (!bookId || !reader) {
    if (readerNarration.bookId) {
      stopReaderNarration()
      readerNarration = { bookId:'', book:null, index:-1, audio:null, duckedVolume:null, blocked:false }
    }
    return
  }

  if (readerNarration.bookId !== bookId) {
    stopReaderNarration()
    readerNarration = { bookId, book:null, index:-1, audio:null, duckedVolume:null, blocked:false }
    readerNarration.book = await loadReaderNarrationBook(bookId)
    if (!readerNarration.book || readerNarration.bookId !== bookId) return
  }

  const index = currentReaderPageIndex()
  if (index === readerNarration.index) return
  readerNarration.index = index
  stopReaderNarration()
  setTimeout(() => playCurrentReaderNarration(false), 80)
}

function syncNarration() {
  addNarrationStyles()
  syncNarrationEditorUi()
  syncReaderNarration()
  if (!nq('.book-edit-backdrop') && narrationEditor && !narrationSaveBusy) endNarrationEditor()
}

addNarrationStyles()
captureEditorOrdering()
installNarrationManifestPatch()
const narrationObserver = new MutationObserver(syncNarration)
narrationObserver.observe(document.documentElement, { childList:true, subtree:true, characterData:true })
window.addEventListener('popstate', () => setTimeout(syncNarration, 0))
setInterval(syncNarration, 550)
syncNarration()
