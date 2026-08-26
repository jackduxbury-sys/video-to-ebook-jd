const CLEAN_SOUND_GROUPS = [
  { label: 'No sound', options: [{ id: 'off', label: 'Off' }] },
  { label: 'Nature ambience', options: [
    { id: 'nature-rain', label: 'Gentle rain' },
    { id: 'nature-forest', label: 'Forest' },
    { id: 'nature-ocean', label: 'Ocean waves' },
    { id: 'nature-night', label: 'Night crickets' },
    { id: 'nature-fireplace', label: 'Cosy fireplace' },
    { id: 'nature-dreamy', label: 'Soft dreamy ambience' },
  ]},
  { label: 'Jolly storybook music', options: [
    { id: 'happy', label: 'Jolly plucked strings' },
    { id: 'xylophone', label: 'Sunny xylophone' },
    { id: 'bells', label: 'Magic storybook bells' },
    { id: 'story', label: 'Gentle storytime' },
    { id: 'adventure', label: 'Little adventure' },
    { id: 'lullaby', label: 'Soft lullaby' },
  ]},
]

const CLEAN_BACKDROPS = [
  { id: 'dark', label: 'Simple dark' },
  { id: 'woodland', label: 'Woodland' },
  { id: 'night-sky', label: 'Night sky' },
  { id: 'cosy-room', label: 'Cosy room' },
  { id: 'classroom', label: 'Playful classroom' },
  { id: 'clouds', label: 'Cloudy sky' },
  { id: 'pastel', label: 'Soft pastel' },
]

const cq = (selector, root = document) => root.querySelector(selector)
const cqa = (selector, root = document) => [...root.querySelectorAll(selector)]
let cleanBookId = ''
let cleanStarted = false
let cleanBook = null
let cleanWakeTimer = null
let cleanWasReader = false
let cleanSetupBusy = false

function cleanReaderBookId() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function normalizeCleanSound(value) {
  const legacy = {
    rain: 'nature-rain', forest: 'nature-forest', ocean: 'nature-ocean',
    night: 'nature-night', fireplace: 'nature-fireplace', dreamy: 'nature-dreamy',
  }
  const mapped = legacy[value] || value || 'off'
  const all = CLEAN_SOUND_GROUPS.flatMap(group => group.options).map(option => option.id)
  return all.includes(mapped) ? mapped : 'off'
}

function normalizeCleanBackdrop(value) {
  return CLEAN_BACKDROPS.some(option => option.id === value) ? value : 'dark'
}

function cleanSoundMarkup(selected) {
  const safe = normalizeCleanSound(selected)
  return CLEAN_SOUND_GROUPS.map(group => {
    if (group.label === 'No sound') {
      const option = group.options[0]
      return `<option value="${option.id}" ${safe === option.id ? 'selected' : ''}>${option.label}</option>`
    }
    return `<optgroup label="${group.label}">${group.options.map(option => `<option value="${option.id}" ${safe === option.id ? 'selected' : ''}>${option.label}</option>`).join('')}</optgroup>`
  }).join('')
}

function cleanBackdropMarkup(selected) {
  const safe = normalizeCleanBackdrop(selected)
  return CLEAN_BACKDROPS.map(option => `<option value="${option.id}" ${safe === option.id ? 'selected' : ''}>${option.label}</option>`).join('')
}

function addCleanReaderStyles() {
  if (cq('#clean-reader-styles')) return
  const style = document.createElement('style')
  style.id = 'clean-reader-styles'
  style.textContent = `
    /* Hide the old reader chrome; it still runs behind the scenes for sound/backdrop state. */
    .reader.reader-clean-started .reader-top,
    .reader.reader-clean-started .reader-footer,
    .reader.reader-clean-started .ambient-toolbar{display:none!important}
    .reader.reader-clean-started~.reader-backdrop-dock{display:none!important}
    body:has(.reader.reader-clean-started) .reader-backdrop-dock{display:none!important}

    .reader.reader-clean-started{position:relative!important;min-height:100vh!important;height:100vh!important;display:block!important;overflow:hidden!important;background:#111!important}
    .reader.reader-clean-started .reader-stage{position:absolute!important;inset:0!important;min-height:100vh!important;height:100vh!important;display:grid!important;grid-template-columns:64px minmax(0,1fr) 64px!important;align-items:center!important}
    .reader.reader-clean-started .reader-page{width:min(1180px,calc(100vw - 150px))!important;height:100vh!important;margin:0 auto!important;padding:2vh 0!important;display:grid!important;place-items:center!important;align-content:center!important;overflow:hidden!important}
    .reader.reader-clean-started .reader-page img{display:block!important;max-width:100%!important;max-height:92vh!important;width:auto!important;height:auto!important;object-fit:contain!important;border-radius:9px!important;box-shadow:0 22px 70px #0008!important}
    .reader.reader-clean-started .reader-page figcaption{position:absolute!important;left:50%!important;bottom:30px!important;transform:translateX(-50%)!important;width:min(850px,78vw)!important;margin:0!important;padding:12px 18px!important;border-radius:14px!important;background:#fffdf1e8!important;color:#222!important;box-shadow:0 8px 30px #0005!important;backdrop-filter:blur(7px)!important}
    .reader.reader-clean-started .nav-side{position:relative!important;z-index:4!important;background:transparent!important;color:#fff!important;border:0!important;opacity:.16!important;transition:opacity .18s ease,background .18s ease!important}
    .reader.reader-clean-started.clean-awake .nav-side,.reader.reader-clean-started .nav-side:hover{opacity:.72!important;background:#0002!important}

    .clean-reader-controls{position:fixed;top:12px;left:12px;right:12px;z-index:24000;display:flex;justify-content:space-between;align-items:center;gap:10px;opacity:0;transform:translateY(-8px);pointer-events:none;transition:opacity .2s ease,transform .2s ease}
    .reader.reader-clean-started.clean-awake .clean-reader-controls{opacity:1;transform:translateY(0);pointer-events:auto}
    .clean-reader-controls .clean-left,.clean-reader-controls .clean-right{display:flex;align-items:center;gap:8px}
    .clean-reader-controls button{border:0!important;border-radius:999px!important;background:#171714d9!important;color:#fff!important;padding:9px 14px!important;font-size:.8rem!important;font-weight:850!important;box-shadow:0 5px 20px #0004!important;backdrop-filter:blur(8px)}
    .clean-reader-controls button:hover{background:#26241fe8!important}
    .reader.reader-clean-started:not(.clean-awake){cursor:none}

    .reader.clean-fullscreen{position:fixed!important;inset:0!important;z-index:23000!important;width:100vw!important;height:100vh!important}
    .reader.clean-fullscreen .reader-page img{max-height:96vh!important}

    .clean-reader-setup{position:fixed;inset:0;z-index:40000;display:grid;place-items:center;padding:22px;background:linear-gradient(135deg,#181713f3,#27251ff2);color:#222;overflow:auto}
    .clean-reader-setup-card{width:min(920px,96vw);display:grid;grid-template-columns:minmax(230px,.78fr) minmax(310px,1.22fr);gap:24px;background:#f7f2e8;border:1px solid #ffffff33;border-radius:26px;padding:22px;box-shadow:0 28px 100px #000b}
    .clean-setup-preview{min-height:360px;border-radius:18px;overflow:hidden;background:#282722;display:grid;place-items:center;padding:16px}
    .clean-setup-preview img{display:block;max-width:100%;max-height:430px;object-fit:contain;border-radius:8px;box-shadow:0 15px 45px #0007}
    .clean-setup-copy{display:flex;flex-direction:column;justify-content:center}
    .clean-setup-eyebrow{margin:0;color:#66746c;font-size:.72rem;font-weight:950;letter-spacing:.16em;text-transform:uppercase}
    .clean-setup-copy h2{margin:5px 0 8px;font-size:clamp(1.6rem,3vw,2.5rem);line-height:1.05}.clean-setup-copy>p{margin:0 0 20px;color:#71695e}
    .clean-setup-fields{display:grid;gap:13px}.clean-setup-fields label{display:grid;gap:6px;font-size:.82rem;font-weight:900;color:#4f4a42}.clean-setup-fields select{width:100%;padding:11px 12px;border:1px solid #d2c8b8;border-radius:12px;background:#fff;color:#222}
    .clean-volume-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center}.clean-volume-row input{width:100%;padding:0}.clean-volume-value{min-width:38px;text-align:right;color:#777}
    .clean-setup-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:18px}.clean-setup-actions button{padding:12px 14px!important}.clean-start{background:#2f5d50!important;color:#fff!important;border-color:#2f5d50!important}.clean-start-full{background:#2b3f57!important;color:#fff!important;border-color:#2b3f57!important}.clean-library{grid-column:1/-1;background:transparent!important}
    .clean-setup-note{margin-top:11px!important;font-size:.78rem;color:#8a8175!important}

    body.clean-reader-active{overflow:hidden!important}
    body.clean-reader-active .page-carousel-shell{z-index:24500!important}
    body.clean-reader-active .page-carousel-trigger{opacity:.3!important}
    body.clean-reader-active:has(.reader.clean-awake) .page-carousel-trigger{opacity:.8!important}

    @media(max-width:760px){
      .reader.reader-clean-started .reader-stage{grid-template-columns:40px minmax(0,1fr) 40px!important}.reader.reader-clean-started .reader-page{width:calc(100vw - 82px)!important;padding:1vh 0!important}.reader.reader-clean-started .reader-page img{max-height:94vh!important}.reader.reader-clean-started .reader-page figcaption{width:84vw!important;bottom:20px!important}
      .clean-reader-setup{padding:0}.clean-reader-setup-card{width:100%;min-height:100vh;border-radius:0;grid-template-columns:1fr;padding:15px}.clean-setup-preview{min-height:220px;max-height:38vh}.clean-setup-preview img{max-height:34vh}.clean-setup-copy{justify-content:flex-start}.clean-setup-actions{grid-template-columns:1fr}.clean-library{grid-column:auto}.clean-reader-controls{top:8px;left:8px;right:8px}.clean-reader-controls button{padding:8px 11px!important;font-size:.74rem!important}
    }
  `
  document.head.appendChild(style)
}

async function fetchCleanBook(bookId) {
  const rawFetch = window.__ambientOriginalFetch || window.fetch.bind(window)
  const response = await rawFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
  if (!response.ok) throw new Error('Could not load this book.')
  const data = await response.json()
  return data.book
}

function cleanCoverUrl(book) {
  const page = book?.pages?.[book.coverIndex || 0] || book?.pages?.[0]
  if (!page) return ''
  const qs = new URLSearchParams({ bookId: book.id, pageId: page.id, v: book.updatedAt || '' })
  return `/.netlify/functions/page?${qs}`
}

function currentHiddenSoundBar() {
  const bars = cqa('.ambient-toolbar')
  return bars.find(bar => bar.dataset.bothSoundSets === '1') || bars[0] || null
}

async function waitForHiddenSoundBar(timeout = 2200) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const bar = currentHiddenSoundBar()
    if (bar?.querySelector('select') && bar?.querySelector('button')) return bar
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  return currentHiddenSoundBar()
}

async function applyCleanSound(soundId, volume) {
  const safeSound = normalizeCleanSound(soundId)
  const bar = await waitForHiddenSoundBar()
  if (!bar) return
  const select = cq('select', bar)
  const button = cq('button', bar)
  const slider = cq('input[type="range"]', bar)
  if (!select || !button) return

  if (/^pause/i.test(button.textContent || '')) button.click()
  if (slider) {
    slider.value = String(volume)
    slider.dispatchEvent(new Event('input', { bubbles:true }))
  }
  select.value = safeSound
  select.dispatchEvent(new Event('change', { bubbles:true }))
  await new Promise(resolve => setTimeout(resolve, 40))
  if (safeSound !== 'off' && /^play/i.test(button.textContent || '')) button.click()
}

function applyCleanBackdrop(bookId, backdrop) {
  const safe = normalizeCleanBackdrop(backdrop)
  localStorage.setItem(`ebook-backdrop:${bookId}`, safe)
  const reader = cq('.reader')
  if (reader) reader.dataset.backdrop = safe
  const dockSelect = cq('.reader-backdrop-dock select')
  if (dockSelect) {
    dockSelect.value = safe
    dockSelect.dispatchEvent(new Event('change', { bubbles:true }))
  }
}

function wakeCleanReader() {
  const reader = cq('.reader.reader-clean-started')
  if (!reader) return
  reader.classList.add('clean-awake')
  clearTimeout(cleanWakeTimer)
  cleanWakeTimer = setTimeout(() => reader.classList.remove('clean-awake'), 1900)
}

function ensureCleanControls() {
  const reader = cq('.reader.reader-clean-started')
  if (!reader || cq('.clean-reader-controls', reader)) return
  const controls = document.createElement('div')
  controls.className = 'clean-reader-controls'
  controls.innerHTML = `
    <div class="clean-left"><button type="button" data-clean="library">← Library</button></div>
    <div class="clean-right"><button type="button" data-clean="settings">⚙ Settings</button><button type="button" data-clean="fullscreen">Full screen</button></div>`
  reader.appendChild(controls)

  cq('[data-clean="library"]', controls).onclick = () => {
    const original = cqa('.reader-top button').find(button => /library/i.test(button.textContent || ''))
    if (original) original.click()
    else { history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) }
  }
  cq('[data-clean="settings"]', controls).onclick = () => showCleanSetup(true)
  cq('[data-clean="fullscreen"]', controls).onclick = async () => {
    const target = cq('.reader')
    if (!target) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await target.requestFullscreen?.()
    } catch {
      target.classList.toggle('clean-fullscreen')
    }
    wakeCleanReader()
  }
  wakeCleanReader()
}

function updateCleanFullscreenState() {
  const reader = cq('.reader.reader-clean-started')
  if (!reader) return
  const active = document.fullscreenElement === reader
  reader.classList.toggle('clean-fullscreen', active)
  const button = cq('[data-clean="fullscreen"]', reader)
  if (button) button.textContent = active ? 'Exit full screen' : 'Full screen'
  wakeCleanReader()
}

document.addEventListener('fullscreenchange', updateCleanFullscreenState)
;['mousemove','pointermove','touchstart','click','keydown'].forEach(type => document.addEventListener(type, event => {
  if (type === 'keydown' && event.key === 'Escape' && cq('.clean-reader-setup')) return
  wakeCleanReader()
}, { passive:true }))

async function startCleanReading({ sound, backdrop, volume, fullscreen }) {
  if (cleanSetupBusy) return
  cleanSetupBusy = true
  const reader = cq('.reader')
  if (!reader) { cleanSetupBusy = false; return }

  if (fullscreen && !document.fullscreenElement) {
    try { await reader.requestFullscreen?.() } catch {}
  }

  applyCleanBackdrop(cleanBookId, backdrop)
  localStorage.setItem(`ebook-volume:${cleanBookId}`, String(volume))
  localStorage.setItem(`ebook-session-sound:${cleanBookId}`, sound)
  await applyCleanSound(sound, volume)

  cleanStarted = true
  reader.classList.add('reader-clean-started')
  reader.classList.toggle('clean-fullscreen', document.fullscreenElement === reader)
  document.body.classList.add('clean-reader-active')
  cq('.clean-reader-setup')?.remove()
  ensureCleanControls()
  wakeCleanReader()
  cleanSetupBusy = false
}

async function showCleanSetup(isSettings = false) {
  if (!cleanBookId || cq('.clean-reader-setup')) return
  try {
    if (!cleanBook || cleanBook.id !== cleanBookId) cleanBook = await fetchCleanBook(cleanBookId)
  } catch {
    return
  }

  const savedSound = normalizeCleanSound(localStorage.getItem(`ebook-session-sound:${cleanBookId}`) || cleanBook.soundscapeId || 'off')
  const savedBackdrop = normalizeCleanBackdrop(localStorage.getItem(`ebook-backdrop:${cleanBookId}`) || cleanBook.readerBackdrop || 'dark')
  const savedVolume = Math.max(0, Math.min(1, Number(localStorage.getItem(`ebook-volume:${cleanBookId}`) || 0.26)))
  const overlay = document.createElement('div')
  overlay.className = 'clean-reader-setup'
  const cover = cleanCoverUrl(cleanBook)
  overlay.innerHTML = `
    <div class="clean-reader-setup-card">
      <div class="clean-setup-preview">${cover ? `<img src="${cover}" alt="Book cover">` : '<span style="font-size:4rem">📖</span>'}</div>
      <div class="clean-setup-copy">
        <p class="clean-setup-eyebrow">${isSettings ? 'READING SETTINGS' : 'READY TO READ?'}</p>
        <h2>${String(cleanBook.title || 'Book').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</h2>
        <p>Choose the reading atmosphere first. Once you start, the controls disappear so the book gets all the attention.</p>
        <div class="clean-setup-fields">
          <label><span>Background sound</span><select class="clean-setup-sound">${cleanSoundMarkup(savedSound)}</select></label>
          <label><span>Book backdrop</span><select class="clean-setup-backdrop">${cleanBackdropMarkup(savedBackdrop)}</select></label>
          <label><span>Sound volume</span><div class="clean-volume-row"><span>Quiet</span><input class="clean-setup-volume" type="range" min="0" max="1" step="0.01" value="${savedVolume}"><span class="clean-volume-value">${Math.round(savedVolume*100)}%</span></div></label>
        </div>
        <div class="clean-setup-actions">
          <button type="button" class="clean-start">${isSettings ? 'Apply & return to book' : 'Start reading'}</button>
          <button type="button" class="clean-start-full">${isSettings ? 'Apply & go full screen' : 'Start full screen'}</button>
          <button type="button" class="clean-library">← Back to library</button>
        </div>
        <p class="clean-setup-note">You can reopen these choices later from the small Settings button.</p>
      </div>
    </div>`
  document.body.appendChild(overlay)

  const sound = cq('.clean-setup-sound', overlay)
  const backdrop = cq('.clean-setup-backdrop', overlay)
  const volume = cq('.clean-setup-volume', overlay)
  const volumeValue = cq('.clean-volume-value', overlay)
  volume.oninput = () => { volumeValue.textContent = `${Math.round(Number(volume.value)*100)}%` }
  cq('.clean-start', overlay).onclick = () => startCleanReading({ sound:sound.value, backdrop:backdrop.value, volume:Number(volume.value), fullscreen:false })
  cq('.clean-start-full', overlay).onclick = () => startCleanReading({ sound:sound.value, backdrop:backdrop.value, volume:Number(volume.value), fullscreen:true })
  cq('.clean-library', overlay).onclick = () => {
    overlay.remove()
    const original = cqa('.reader-top button').find(button => /library/i.test(button.textContent || ''))
    if (original) original.click()
    else { history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) }
  }
}

function resetCleanReader() {
  clearTimeout(cleanWakeTimer)
  cleanBookId = ''
  cleanBook = null
  cleanStarted = false
  cleanWasReader = false
  cleanSetupBusy = false
  cq('.clean-reader-setup')?.remove()
  document.body.classList.remove('clean-reader-active')
}

function syncCleanReader() {
  addCleanReaderStyles()
  const reader = cq('.reader')
  const bookId = cleanReaderBookId()
  if (!reader || !bookId) {
    if (cleanWasReader) resetCleanReader()
    return
  }
  cleanWasReader = true

  if (cleanBookId !== bookId) {
    cleanBookId = bookId
    cleanBook = null
    cleanStarted = false
    cleanSetupBusy = false
    cq('.clean-reader-setup')?.remove()
  }

  // Old controls stay hidden once reading begins, including any duplicates re-injected by older scripts.
  if (cleanStarted) {
    reader.classList.add('reader-clean-started')
    document.body.classList.add('clean-reader-active')
    ensureCleanControls()
  } else if (!cq('.clean-reader-setup')) {
    setTimeout(() => showCleanSetup(false), 80)
  }
}

addCleanReaderStyles()
const cleanObserver = new MutationObserver(syncCleanReader)
cleanObserver.observe(document.documentElement, { childList:true, subtree:true })
window.addEventListener('popstate', () => setTimeout(syncCleanReader, 0))
setInterval(syncCleanReader, 700)
syncCleanReader()
