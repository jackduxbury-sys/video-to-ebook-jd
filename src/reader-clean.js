const READER_SOUND_GROUPS = [
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

const READER_BACKDROPS = [
  { id: 'dark', label: 'Simple dark' },
  { id: 'woodland', label: 'Woodland' },
  { id: 'night-sky', label: 'Night sky' },
  { id: 'cosy-room', label: 'Cosy room' },
  { id: 'classroom', label: 'Playful classroom' },
  { id: 'clouds', label: 'Cloudy sky' },
  { id: 'pastel', label: 'Soft pastel' },
]

const rq = (selector, root = document) => root.querySelector(selector)
const rqa = (selector, root = document) => [...root.querySelectorAll(selector)]

let readerBookId = ''
let readerBook = null
let readerSound = 'off'
let readerBackdrop = 'dark'
let readerVolume = 0.26
let readerSoundPlaying = false
let readerWakeTimer = null
let readerWasOpen = false
let readerLoadingBook = false

function routeBookId() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function normalizeSound(value) {
  const legacy = {
    rain: 'nature-rain', forest: 'nature-forest', ocean: 'nature-ocean',
    night: 'nature-night', fireplace: 'nature-fireplace', dreamy: 'nature-dreamy',
  }
  const mapped = legacy[value] || value || 'off'
  const valid = READER_SOUND_GROUPS.flatMap(group => group.options).some(option => option.id === mapped)
  return valid ? mapped : 'off'
}

function normalizeBackdrop(value) {
  return READER_BACKDROPS.some(option => option.id === value) ? value : 'dark'
}

function soundOptions(selected) {
  const safe = normalizeSound(selected)
  return READER_SOUND_GROUPS.map(group => {
    if (group.label === 'No sound') {
      const option = group.options[0]
      return `<option value="${option.id}" ${safe === option.id ? 'selected' : ''}>${option.label}</option>`
    }
    return `<optgroup label="${group.label}">${group.options.map(option => `<option value="${option.id}" ${safe === option.id ? 'selected' : ''}>${option.label}</option>`).join('')}</optgroup>`
  }).join('')
}

function backdropOptions(selected) {
  const safe = normalizeBackdrop(selected)
  return READER_BACKDROPS.map(option => `<option value="${option.id}" ${safe === option.id ? 'selected' : ''}>${option.label}</option>`).join('')
}

function addReaderStyles() {
  if (rq('#simple-reader-styles')) return
  const style = document.createElement('style')
  style.id = 'simple-reader-styles'
  style.textContent = `
    /* The book is the interface. Older controls remain available behind the scenes only. */
    .reader.reader-simple .reader-top,
    .reader.reader-simple .reader-footer,
    .reader.reader-simple .ambient-toolbar,
    .reader.reader-simple .clean-reader-controls{display:none!important}
    body.simple-reader-active .reader-backdrop-dock{display:none!important}
    body.simple-reader-active .clean-reader-setup{display:none!important}

    .reader.reader-simple{position:relative!important;min-height:100vh!important;height:100vh!important;display:block!important;overflow:hidden!important;background:#111!important}
    .reader.reader-simple .reader-stage{position:absolute!important;inset:0!important;min-height:100vh!important;height:100vh!important;display:grid!important;grid-template-columns:58px minmax(0,1fr) 58px!important;align-items:center!important}
    .reader.reader-simple .reader-page{position:relative!important;width:min(1180px,calc(100vw - 132px))!important;height:100vh!important;margin:0 auto!important;padding:2vh 0!important;display:grid!important;place-items:center!important;align-content:center!important;overflow:hidden!important}
    .reader.reader-simple .reader-page img{display:block!important;max-width:100%!important;max-height:93vh!important;width:auto!important;height:auto!important;object-fit:contain!important;border-radius:8px!important;box-shadow:0 20px 65px #0008!important}
    .reader.reader-simple .reader-page figcaption{position:absolute!important;left:50%!important;bottom:24px!important;transform:translateX(-50%)!important;width:min(820px,76vw)!important;margin:0!important;padding:11px 16px!important;border-radius:13px!important;background:#fffdf1e8!important;color:#222!important;box-shadow:0 8px 28px #0005!important;backdrop-filter:blur(7px)!important}
    .reader.reader-simple .nav-side{position:relative!important;z-index:4!important;height:100%!important;background:transparent!important;color:#fff!important;border:0!important;border-radius:0!important;opacity:.12!important;transition:opacity .18s ease,background .18s ease!important}
    .reader.reader-simple.reader-awake .nav-side,.reader.reader-simple .nav-side:hover{opacity:.68!important;background:#0002!important}

    .simple-reader-tools{position:fixed;top:12px;left:12px;right:12px;z-index:26000;display:flex;justify-content:space-between;align-items:center;pointer-events:none}
    .simple-reader-tools .tool-group{display:flex;gap:7px;pointer-events:auto}
    .simple-reader-tools button{display:grid!important;place-items:center!important;width:40px!important;height:40px!important;padding:0!important;border:1px solid #ffffff20!important;border-radius:999px!important;background:#171714b8!important;color:#fff!important;font-size:1rem!important;font-weight:900!important;box-shadow:0 5px 18px #0003!important;backdrop-filter:blur(8px)!important;opacity:.38;transition:opacity .18s ease,transform .18s ease,background .18s ease!important}
    .reader.reader-simple.reader-awake .simple-reader-tools button,.simple-reader-tools button:hover,.simple-reader-tools button:focus-visible{opacity:.96;transform:translateY(-1px);background:#24221de8!important}

    .simple-reader-settings{position:fixed;top:60px;right:12px;z-index:26500;width:min(310px,calc(100vw - 24px));padding:14px;background:#f8f4ebf8;color:#292720;border:1px solid #ffffff80;border-radius:18px;box-shadow:0 18px 55px #0008;backdrop-filter:blur(15px);transform-origin:top right;animation:readerPanelIn .14s ease-out}
    @keyframes readerPanelIn{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
    .simple-settings-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.simple-settings-head strong{font-size:.9rem}.simple-settings-close{width:30px!important;height:30px!important;padding:0!important;border:0!important;border-radius:999px!important;background:#ebe4d8!important;color:#444!important}
    .simple-setting{display:grid;gap:6px;margin-top:10px}.simple-setting>span{font-size:.72rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#70695f}.simple-setting select{width:100%;padding:9px 10px;border:1px solid #d1c7b8;border-radius:11px;background:#fff;color:#25231f;font:inherit}
    .simple-sound-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.simple-sound-toggle{min-width:72px;padding:8px 10px!important;border:0!important;border-radius:11px!important;background:#2f5d50!important;color:#fff!important;font-size:.78rem!important;font-weight:850!important}
    .simple-volume-row{display:grid;grid-template-columns:1fr 38px;gap:9px;align-items:center}.simple-volume-row input{width:100%;padding:0}.simple-volume-value{text-align:right;font-size:.75rem;font-weight:800;color:#746d63}
    .simple-settings-note{margin:11px 0 0;color:#8a8175;font-size:.72rem;line-height:1.35}

    .reader.reader-simple.reader-focus{position:fixed!important;inset:0!important;z-index:25000!important;width:100vw!important;height:100vh!important}
    .reader.reader-simple.reader-focus .reader-page img{max-height:97vh!important}

    body.simple-reader-active{overflow:hidden!important}
    body.simple-reader-active .page-carousel-shell{z-index:25500!important}
    body.simple-reader-active .page-carousel-trigger{opacity:.22!important}
    body.simple-reader-active:has(.reader.reader-awake) .page-carousel-trigger{opacity:.75!important}

    @media(max-width:760px){
      .reader.reader-simple .reader-stage{grid-template-columns:38px minmax(0,1fr) 38px!important}.reader.reader-simple .reader-page{width:calc(100vw - 78px)!important;padding:1vh 0!important}.reader.reader-simple .reader-page img{max-height:95vh!important}.reader.reader-simple .reader-page figcaption{width:84vw!important;bottom:18px!important}
      .simple-reader-tools{top:8px;left:8px;right:8px}.simple-reader-tools button{width:38px!important;height:38px!important}.simple-reader-settings{top:54px;right:8px;width:min(310px,calc(100vw - 16px))}
    }
  `
  document.head.appendChild(style)
}

async function fetchBook(bookId) {
  const rawFetch = window.__ambientOriginalFetch || window.fetch.bind(window)
  const response = await rawFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
  if (!response.ok) throw new Error('Could not load book settings.')
  const data = await response.json()
  return data.book || null
}

function hiddenSoundBar(soundId = readerSound) {
  const bars = rqa('.ambient-toolbar')
  for (let i = bars.length - 1; i >= 0; i--) {
    const select = rq('select', bars[i])
    if (!select) continue
    const values = [...select.options].map(option => option.value)
    if (values.includes(soundId) || bars[i].dataset.bothSoundSets === '1') return bars[i]
  }
  return bars[bars.length - 1] || null
}

async function waitForSoundBar(soundId = readerSound, timeout = 2600) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const bar = hiddenSoundBar(soundId)
    const select = rq('select', bar || document)
    if (bar && select && [...select.options].some(option => option.value === soundId || soundId === 'off')) return bar
    await new Promise(resolve => setTimeout(resolve, 90))
  }
  return hiddenSoundBar(soundId)
}

function stopHiddenSoundBars() {
  rqa('.ambient-toolbar').forEach(bar => {
    const button = rq('button', bar)
    if (button && /^pause/i.test(button.textContent || '')) {
      try { button.click() } catch {}
    }
  })
  readerSoundPlaying = false
}

async function syncSound({ play = readerSoundPlaying } = {}) {
  const sound = normalizeSound(readerSound)
  const bar = await waitForSoundBar(sound)
  if (!bar) return false
  const select = rq('select', bar)
  const button = rq('button', bar)
  const slider = rq('input[type="range"]', bar)
  if (!select || !button) return false

  if (/^pause/i.test(button.textContent || '')) {
    try { button.click() } catch {}
    await new Promise(resolve => setTimeout(resolve, 30))
  }

  if (slider) {
    slider.value = String(readerVolume)
    slider.dispatchEvent(new Event('input', { bubbles:true }))
  }

  select.value = sound
  select.dispatchEvent(new Event('change', { bubbles:true }))
  await new Promise(resolve => setTimeout(resolve, 35))

  if (play && sound !== 'off' && /^play/i.test(button.textContent || '')) {
    try { button.click() } catch {}
    readerSoundPlaying = /^pause/i.test(button.textContent || '')
  } else {
    readerSoundPlaying = false
  }
  updateSettingsSoundButton()
  return true
}

function applyBackdrop(value) {
  readerBackdrop = normalizeBackdrop(value)
  if (readerBookId) localStorage.setItem(`ebook-backdrop:${readerBookId}`, readerBackdrop)
  const reader = rq('.reader')
  if (reader) reader.dataset.backdrop = readerBackdrop
  const hidden = rq('.reader-backdrop-dock select')
  if (hidden) {
    hidden.value = readerBackdrop
    hidden.dispatchEvent(new Event('change', { bubbles:true }))
  }
}

function updateSettingsSoundButton() {
  const button = rq('.simple-sound-toggle')
  if (!button) return
  if (readerSound === 'off') {
    button.textContent = 'Off'
    button.disabled = true
  } else {
    button.disabled = false
    button.textContent = readerSoundPlaying ? 'Pause' : 'Play'
  }
}

function closeSettings() {
  rq('.simple-reader-settings')?.remove()
}

function openSettings() {
  closeSettings()
  const panel = document.createElement('div')
  panel.className = 'simple-reader-settings'
  panel.innerHTML = `
    <div class="simple-settings-head"><strong>Reading settings</strong><button type="button" class="simple-settings-close" aria-label="Close settings">×</button></div>
    <label class="simple-setting"><span>Sound</span><div class="simple-sound-row"><select class="simple-sound-select">${soundOptions(readerSound)}</select><button type="button" class="simple-sound-toggle">Play</button></div></label>
    <label class="simple-setting"><span>Volume</span><div class="simple-volume-row"><input class="simple-volume" type="range" min="0" max="1" step="0.01" value="${readerVolume}"><span class="simple-volume-value">${Math.round(readerVolume * 100)}%</span></div></label>
    <label class="simple-setting"><span>Backdrop</span><select class="simple-backdrop-select">${backdropOptions(readerBackdrop)}</select></label>
    <p class="simple-settings-note">Changes happen straight away. Close this panel whenever you are ready to keep reading.</p>`
  document.body.appendChild(panel)

  const soundSelect = rq('.simple-sound-select', panel)
  const soundButton = rq('.simple-sound-toggle', panel)
  const volume = rq('.simple-volume', panel)
  const volumeValue = rq('.simple-volume-value', panel)
  const backdropSelect = rq('.simple-backdrop-select', panel)

  soundSelect.onchange = async () => {
    readerSound = normalizeSound(soundSelect.value)
    if (readerBookId) localStorage.setItem(`ebook-session-sound:${readerBookId}`, readerSound)
    if (readerSound === 'off') {
      stopHiddenSoundBars()
      await syncSound({ play:false })
    } else {
      await syncSound({ play:readerSoundPlaying })
    }
    updateSettingsSoundButton()
  }

  soundButton.onclick = async () => {
    if (readerSound === 'off') return
    readerSoundPlaying = !readerSoundPlaying
    await syncSound({ play:readerSoundPlaying })
    updateSettingsSoundButton()
  }

  volume.oninput = () => {
    readerVolume = Math.max(0, Math.min(1, Number(volume.value) || 0))
    volumeValue.textContent = `${Math.round(readerVolume * 100)}%`
    if (readerBookId) localStorage.setItem(`ebook-volume:${readerBookId}`, String(readerVolume))
    const bar = hiddenSoundBar(readerSound)
    const hiddenSlider = rq('input[type="range"]', bar || document)
    if (hiddenSlider) {
      hiddenSlider.value = String(readerVolume)
      hiddenSlider.dispatchEvent(new Event('input', { bubbles:true }))
    }
  }

  backdropSelect.onchange = () => applyBackdrop(backdropSelect.value)
  rq('.simple-settings-close', panel).onclick = closeSettings
  updateSettingsSoundButton()
  wakeReader()
}

function wakeReader() {
  const reader = rq('.reader.reader-simple')
  if (!reader) return
  reader.classList.add('reader-awake')
  clearTimeout(readerWakeTimer)
  readerWakeTimer = setTimeout(() => {
    if (!rq('.simple-reader-settings')) reader.classList.remove('reader-awake')
  }, 2200)
}

function goLibrary() {
  stopHiddenSoundBars()
  closeSettings()
  const original = rqa('.reader-top button').find(button => /library/i.test(button.textContent || ''))
  if (original) original.click()
  else {
    history.pushState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

function toggleFocusMode() {
  const reader = rq('.reader.reader-simple')
  if (!reader) return
  reader.classList.toggle('reader-focus')
  const button = rq('[data-reader-tool="focus"]')
  if (button) {
    const active = reader.classList.contains('reader-focus')
    button.textContent = active ? '×' : '⛶'
    button.title = active ? 'Exit full screen view' : 'Full screen view'
    button.setAttribute('aria-label', button.title)
  }
  wakeReader()
}

function ensureReaderTools() {
  const reader = rq('.reader.reader-simple')
  if (!reader || rq('.simple-reader-tools', reader)) return
  const tools = document.createElement('div')
  tools.className = 'simple-reader-tools'
  tools.innerHTML = `
    <div class="tool-group"><button type="button" data-reader-tool="library" title="Back to library" aria-label="Back to library">←</button></div>
    <div class="tool-group"><button type="button" data-reader-tool="settings" title="Reading settings" aria-label="Reading settings">⚙</button><button type="button" data-reader-tool="focus" title="Full screen view" aria-label="Full screen view">⛶</button></div>`
  reader.appendChild(tools)
  rq('[data-reader-tool="library"]', tools).onclick = goLibrary
  rq('[data-reader-tool="settings"]', tools).onclick = event => {
    event.stopPropagation()
    if (rq('.simple-reader-settings')) closeSettings()
    else openSettings()
    wakeReader()
  }
  rq('[data-reader-tool="focus"]', tools).onclick = toggleFocusMode
}

async function loadReaderPreferences(bookId) {
  if (readerLoadingBook) return
  readerLoadingBook = true
  try {
    readerBook = await fetchBook(bookId)
  } catch {
    readerBook = null
  }

  readerSound = normalizeSound(localStorage.getItem(`ebook-session-sound:${bookId}`) || readerBook?.soundscapeId || 'off')
  readerBackdrop = normalizeBackdrop(localStorage.getItem(`ebook-backdrop:${bookId}`) || readerBook?.readerBackdrop || 'dark')
  readerVolume = Math.max(0, Math.min(1, Number(localStorage.getItem(`ebook-volume:${bookId}`) || 0.26)))
  readerSoundPlaying = false
  applyBackdrop(readerBackdrop)
  await syncSound({ play:false })
  readerLoadingBook = false
}

function resetReader() {
  clearTimeout(readerWakeTimer)
  stopHiddenSoundBars()
  closeSettings()
  readerBookId = ''
  readerBook = null
  readerSound = 'off'
  readerBackdrop = 'dark'
  readerVolume = 0.26
  readerSoundPlaying = false
  readerLoadingBook = false
  readerWasOpen = false
  document.body.classList.remove('simple-reader-active')
  rq('.reader')?.classList.remove('reader-simple', 'reader-awake', 'reader-focus', 'reader-clean-started', 'clean-fullscreen')
}

function syncReader() {
  addReaderStyles()
  const reader = rq('.reader')
  const bookId = routeBookId()

  if (!reader || !bookId) {
    if (readerWasOpen) resetReader()
    return
  }

  readerWasOpen = true
  reader.classList.add('reader-simple', 'reader-clean-started')
  document.body.classList.add('simple-reader-active')
  rq('.clean-reader-setup')?.remove()
  ensureReaderTools()

  if (readerBookId !== bookId) {
    readerBookId = bookId
    readerBook = null
    readerSoundPlaying = false
    closeSettings()
    loadReaderPreferences(bookId)
  } else {
    applyBackdrop(readerBackdrop)
  }
}

addReaderStyles()
const readerObserver = new MutationObserver(syncReader)
readerObserver.observe(document.documentElement, { childList:true, subtree:true })
window.addEventListener('popstate', () => setTimeout(syncReader, 0))

;['mousemove','pointermove','touchstart','keydown'].forEach(type => {
  document.addEventListener(type, () => wakeReader(), { passive:true })
})

document.addEventListener('click', event => {
  const panel = rq('.simple-reader-settings')
  if (panel && !panel.contains(event.target) && !event.target.closest?.('[data-reader-tool="settings"]')) closeSettings()
})

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  if (rq('.simple-reader-settings')) {
    closeSettings()
    return
  }
  const reader = rq('.reader.reader-focus')
  if (reader) toggleFocusMode()
})

setInterval(syncReader, 800)
syncReader()
