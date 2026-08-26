const BACKDROP_OPTIONS = [
  { id: 'dark', label: 'Simple dark' },
  { id: 'woodland', label: 'Woodland' },
  { id: 'night-sky', label: 'Night sky' },
  { id: 'cosy-room', label: 'Cosy room' },
  { id: 'classroom', label: 'Playful classroom' },
  { id: 'clouds', label: 'Cloudy sky' },
  { id: 'pastel', label: 'Soft pastel' },
]

const bq = (selector, root = document) => root.querySelector(selector)
const bqa = (selector, root = document) => [...root.querySelectorAll(selector)]
const originalFetchForBackdrops = window.__ambientOriginalFetch || window.fetch.bind(window)
let activeEditBookId = ''
let lastReaderBookId = ''
let readerDefaultBackdrop = 'dark'
let createBackdrop = 'woodland'

function safeBackdrop(id) {
  return BACKDROP_OPTIONS.some(option => option.id === id) ? id : 'dark'
}

function backdropOptionsMarkup(selected = 'dark') {
  const safe = safeBackdrop(selected)
  return BACKDROP_OPTIONS.map(option => `<option value="${option.id}" ${option.id === safe ? 'selected' : ''}>${option.label}</option>`).join('')
}

function addBackdropStyles() {
  if (bq('#reader-backdrop-styles')) return
  const style = document.createElement('style')
  style.id = 'reader-backdrop-styles'
  style.textContent = `
    .reader-backdrop-control{display:flex;align-items:center;gap:8px;color:#d5d1c8;font-size:.78rem;font-weight:800}
    .reader-backdrop-control select{min-width:145px!important;width:auto!important}
    .creator-backdrop-label{min-width:180px}
    .book-edit-settings.has-backdrop{grid-template-columns:minmax(220px,1fr) minmax(210px,.7fr) minmax(210px,.7fr)!important}

    .reader[data-backdrop="dark"] .reader-stage{background:#151410!important}
    .reader[data-backdrop="woodland"] .reader-stage{
      background:
        radial-gradient(ellipse at 8% 93%,#20372a 0 11%,transparent 12%),
        radial-gradient(ellipse at 18% 90%,#2c4b37 0 14%,transparent 15%),
        radial-gradient(ellipse at 82% 92%,#294631 0 15%,transparent 16%),
        radial-gradient(ellipse at 94% 94%,#1f3828 0 13%,transparent 14%),
        linear-gradient(90deg,transparent 0 7%,#5e4932 7% 8%,transparent 8% 19%,#70583d 19% 20%,transparent 20% 81%,#674f37 81% 82%,transparent 82% 93%,#5a4530 93% 94%,transparent 94%),
        radial-gradient(circle at 20% 15%,#dce6b744 0 7%,transparent 8%),
        linear-gradient(#829d7f,#59775f 55%,#314b38 100%)!important;
    }
    .reader[data-backdrop="night-sky"] .reader-stage{
      background:
        radial-gradient(circle at 12% 18%,#fff 0 1px,transparent 2px),radial-gradient(circle at 27% 32%,#fff9 0 1px,transparent 2px),radial-gradient(circle at 43% 12%,#fff 0 1.2px,transparent 2px),radial-gradient(circle at 68% 24%,#fff9 0 1px,transparent 2px),radial-gradient(circle at 84% 12%,#fff 0 1.2px,transparent 2px),radial-gradient(circle at 92% 42%,#fff8 0 1px,transparent 2px),
        radial-gradient(circle at 78% 18%,#fff4b8 0 7%,#fff3a644 8% 11%,transparent 12%),
        linear-gradient(#111a3b,#1f3155 60%,#25394a 100%)!important;
    }
    .reader[data-backdrop="cosy-room"] .reader-stage{
      background:
        linear-gradient(90deg,transparent 0 12%,#5f422c 12% 13%,transparent 13% 87%,#5f422c 87% 88%,transparent 88%),
        linear-gradient(0deg,#6f4f33 0 16%,transparent 16%),
        radial-gradient(circle at 10% 76%,#f7c96d55 0 10%,transparent 11%),
        radial-gradient(circle at 90% 76%,#f7c96d44 0 10%,transparent 11%),
        linear-gradient(#b98f65,#8e694b 75%,#755338)!important;
    }
    .reader[data-backdrop="classroom"] .reader-stage{
      background:
        linear-gradient(0deg,#b88759 0 13%,transparent 13%),
        linear-gradient(90deg,transparent 0 6%,#f2e4b8 6% 26%,transparent 26% 74%,#dce9e1 74% 94%,transparent 94%),
        radial-gradient(circle at 16% 23%,#f0c45c 0 6%,transparent 6.5%),
        radial-gradient(circle at 85% 25%,#87a6bd 0 7%,transparent 7.5%),
        linear-gradient(#d6eadf,#edf3df 70%,#d8c7a4)!important;
    }
    .reader[data-backdrop="clouds"] .reader-stage{
      background:
        radial-gradient(ellipse at 12% 26%,#fffde8 0 10%,transparent 11%),
        radial-gradient(ellipse at 23% 28%,#fffde8 0 13%,transparent 14%),
        radial-gradient(ellipse at 76% 18%,#fffef0 0 12%,transparent 13%),
        radial-gradient(ellipse at 89% 21%,#fffef0 0 9%,transparent 10%),
        radial-gradient(ellipse at 52% 88%,#fff9 0 16%,transparent 17%),
        linear-gradient(#90c9e7,#c8e6ef 60%,#e7efe5)!important;
    }
    .reader[data-backdrop="pastel"] .reader-stage{
      background:
        radial-gradient(circle at 10% 20%,#f6c9c9aa 0 18%,transparent 19%),
        radial-gradient(circle at 90% 15%,#d3c4efaa 0 19%,transparent 20%),
        radial-gradient(circle at 80% 88%,#bcdccaaa 0 20%,transparent 21%),
        radial-gradient(circle at 18% 88%,#f1dfafaa 0 20%,transparent 21%),
        linear-gradient(135deg,#f4efe5,#e9eee6)!important;
    }
    .reader:not([data-backdrop="dark"]) .reader-page img{box-shadow:0 18px 60px #0008,0 0 0 1px #fff5!important}
    .reader.is-fullscreen[data-backdrop] .reader-stage{background-attachment:fixed!important;background-size:cover!important}

    .reader-backdrop-dock{position:fixed;right:16px;bottom:58px;z-index:15800;display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:12px;background:#171714d9;color:#fff;box-shadow:0 5px 22px #0005;transition:opacity .2s,transform .2s}
    .reader-backdrop-dock label{font-size:.72rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#d9d5ca}.reader-backdrop-dock select{border:1px solid #4d4a43;background:#34322d;color:#fff;border-radius:9px;padding:7px 8px;font:inherit;font-size:.78rem}
    .reader.is-fullscreen:not(.immersive-awake)~.reader-backdrop-dock{opacity:.12;transform:translateY(8px)}

    @media(max-width:760px){.reader-backdrop-dock{right:8px;bottom:52px}.reader-backdrop-dock label{display:none}.reader-backdrop-dock select{max-width:150px}.book-edit-settings.has-backdrop{grid-template-columns:1fr!important}.creator-backdrop-label{min-width:0}}
  `
  document.head.appendChild(style)
}

function currentReaderBookId() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function applyBackdrop(id) {
  const reader = bq('.reader')
  if (!reader) return
  reader.dataset.backdrop = safeBackdrop(id)
}

async function getBookBackdrop(bookId) {
  if (!bookId) return 'dark'
  try {
    const response = await originalFetchForBackdrops(`${EBOOKS_API}?id=${encodeURIComponent(bookId)}`)
    if (!response.ok) return 'dark'
    const data = await response.json()
    return safeBackdrop(data?.book?.readerBackdrop || 'dark')
  } catch {
    return 'dark'
  }
}

async function injectReaderBackdrop() {
  const reader = bq('.reader')
  const bookId = currentReaderBookId()
  if (!reader || !bookId) {
    bq('.reader-backdrop-dock')?.remove()
    lastReaderBookId = ''
    return
  }
  if (lastReaderBookId !== bookId) {
    lastReaderBookId = bookId
    readerDefaultBackdrop = await getBookBackdrop(bookId)
  }
  const stored = localStorage.getItem(`ebook-backdrop:${bookId}`)
  const selected = safeBackdrop(stored || readerDefaultBackdrop)
  applyBackdrop(selected)

  let dock = bq('.reader-backdrop-dock')
  if (!dock) {
    dock = document.createElement('div')
    dock.className = 'reader-backdrop-dock'
    dock.innerHTML = `<label for="reader-backdrop-select">Backdrop</label><select id="reader-backdrop-select">${backdropOptionsMarkup(selected)}</select>`
    document.body.appendChild(dock)
    const select = bq('select', dock)
    select.addEventListener('change', () => {
      const value = safeBackdrop(select.value)
      localStorage.setItem(`ebook-backdrop:${bookId}`, value)
      applyBackdrop(value)
    })
  } else {
    const select = bq('select', dock)
    if (select && select.value !== selected) select.value = selected
  }
}

function injectCreateBackdrop() {
  const row = bq('.upload-panel .field-row')
  if (!row || bq('.creator-backdrop-label', row)) return
  const label = document.createElement('label')
  label.className = 'creator-backdrop-label'
  label.innerHTML = `<span>Book backdrop</span><select aria-label="Default book backdrop">${backdropOptionsMarkup(createBackdrop)}</select>`
  const select = bq('select', label)
  select.onchange = () => { createBackdrop = safeBackdrop(select.value) }
  row.appendChild(label)
}

function bookIdFromLibraryEditButton(button) {
  const card = button.closest('.book-card')
  const image = bq('.book-cover', card || document)
  if (!image?.src) return ''
  try { return new URL(image.src).searchParams.get('bookId') || '' } catch { return '' }
}

async function injectEditBackdrop() {
  const settings = bq('.book-edit-settings')
  if (!settings || bq('.book-edit-backdrop-select', settings)) return
  settings.classList.add('has-backdrop')
  let selected = 'dark'
  if (activeEditBookId) selected = await getBookBackdrop(activeEditBookId)
  if (!document.body.contains(settings)) return
  const label = document.createElement('label')
  label.innerHTML = `<span>Book backdrop</span><select class="book-edit-backdrop-select">${backdropOptionsMarkup(selected)}</select>`
  settings.appendChild(label)
}

function installManifestBackdropPatch() {
  if (window.__backdropManifestPatch) return
  window.__backdropManifestPatch = true
  const previousOriginal = window.__ambientOriginalFetch || window.fetch.bind(window)
  const wrapper = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || ''
      const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
      if (method === 'POST' && url.includes('/.netlify/functions/books') && typeof init?.body === 'string') {
        const body = JSON.parse(init.body)
        const editSelect = bq('.book-edit-backdrop-select')
        const createSelect = bq('.creator-backdrop-label select')
        if (editSelect && activeEditBookId && body.id === activeEditBookId) body.readerBackdrop = safeBackdrop(editSelect.value)
        else if (createSelect) body.readerBackdrop = safeBackdrop(createSelect.value)
        init = { ...init, body: JSON.stringify(body) }
      }
    } catch {}
    return previousOriginal(input, init)
  }
  window.__ambientOriginalFetch = wrapper
}

function trackEditBook() {
  if (window.__backdropEditTracker) return
  window.__backdropEditTracker = true
  document.addEventListener('click', event => {
    const editButton = event.target.closest?.('.book-edit-button')
    if (editButton) activeEditBookId = bookIdFromLibraryEditButton(editButton)
    if (event.target.closest?.('.book-edit-cancel')) activeEditBookId = ''
  }, true)
}

function syncBackdrops() {
  addBackdropStyles()
  injectCreateBackdrop()
  injectReaderBackdrop()
  injectEditBackdrop()
  if (!bq('.book-edit-backdrop')) activeEditBookId = activeEditBookId || ''
}

addBackdropStyles()
installManifestBackdropPatch()
trackEditBook()
const backdropObserver = new MutationObserver(syncBackdrops)
backdropObserver.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] })
window.addEventListener('popstate', () => setTimeout(syncBackdrops, 0))
setInterval(syncBackdrops, 1000)
syncBackdrops()
