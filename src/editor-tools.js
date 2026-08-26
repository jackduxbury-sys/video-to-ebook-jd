const cropBySource = new Map()
const cropPreviewUrls = new Map()
let currentReaderBook = null
let currentReaderBookId = ''
let carouselOpen = false

const q = (selector, root = document) => root.querySelector(selector)
const qa = (selector, root = document) => [...root.querySelectorAll(selector)]

function addToolStyles() {
  if (q('#ebook-editor-tools-styles')) return
  const style = document.createElement('style')
  style.id = 'ebook-editor-tools-styles'
  style.textContent = `
    .crop-button{padding:5px 8px!important;border:0!important;background:transparent!important;color:#355e78!important;box-shadow:none!important}
    .crop-badge{display:inline-flex;align-items:center;margin-left:6px;padding:3px 7px;border-radius:999px;background:#e6f0f5;color:#355e78;font-size:.68rem;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
    .crop-modal-backdrop{position:fixed;inset:0;z-index:20000;background:#0009;display:grid;place-items:center;padding:18px}
    .crop-modal{width:min(900px,96vw);max-height:94vh;overflow:auto;background:#fffdf8;color:#222;border-radius:22px;padding:18px;box-shadow:0 24px 80px #0008}
    .crop-modal-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}
    .crop-modal-head h2{margin:0;font-size:1.4rem}.crop-modal-head p{margin:4px 0 0;color:#6d675f;font-size:.9rem}
    .crop-preview{position:relative;width:min(760px,100%);margin:0 auto;background:#171717;border-radius:14px;overflow:hidden;line-height:0}
    .crop-preview img{display:block;width:100%;height:auto;max-height:58vh;object-fit:contain;margin:auto}
    .crop-shade{position:absolute;background:#0008;pointer-events:none}
    .crop-box{position:absolute;border:3px solid #fff;box-shadow:0 0 0 1px #2228;pointer-events:none}
    .crop-controls{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin-top:16px}
    .crop-control{display:grid;gap:6px;font-size:.8rem;font-weight:850;color:#555}.crop-control input{width:100%;padding:0}
    .crop-actions{display:flex;justify-content:space-between;gap:10px;margin-top:16px}.crop-actions>div{display:flex;gap:8px}
    .crop-actions .apply-crop{background:#2f5d50;color:white;border-color:#2f5d50}
    .page-carousel-shell{position:fixed;left:0;right:0;bottom:0;z-index:15000;pointer-events:none;display:flex;justify-content:center}
    .page-carousel-trigger{position:absolute;bottom:0;left:50%;transform:translateX(-50%);pointer-events:auto;border:0!important;border-radius:12px 12px 0 0!important;padding:6px 18px!important;background:#171714e8!important;color:#fff!important;font-size:.78rem!important;box-shadow:0 -3px 14px #0004!important;opacity:.8}
    .page-carousel-panel{position:absolute;left:0;right:0;bottom:0;pointer-events:auto;transform:translateY(calc(100% - 4px));transition:transform .2s ease;background:#161512f2;border-top:1px solid #ffffff18;padding:12px 14px 14px;box-shadow:0 -12px 32px #0007}
    .page-carousel-shell:hover .page-carousel-panel,.page-carousel-shell.open .page-carousel-panel{transform:translateY(0)}
    .page-carousel-shell:hover .page-carousel-trigger,.page-carousel-shell.open .page-carousel-trigger{opacity:0;pointer-events:none}
    .page-carousel-head{display:flex;justify-content:space-between;align-items:center;color:#ddd;margin-bottom:8px;font-size:.78rem;font-weight:800}.page-carousel-close{display:none;background:#34322d!important;color:#fff!important;border-color:#4d4a43!important;padding:5px 9px!important}
    .page-carousel-track{display:flex;gap:10px;overflow-x:auto;overscroll-behavior-x:contain;padding:2px 2px 4px;scrollbar-width:thin}
    .page-thumb{position:relative;flex:0 0 128px;padding:0!important;border:2px solid transparent!important;border-radius:10px!important;background:#2e2c27!important;overflow:hidden;box-shadow:none!important;transform:none!important}
    .page-thumb.active{border-color:#fff!important;box-shadow:0 0 0 2px #6d826f!important}.page-thumb img{display:block;width:100%;height:78px;object-fit:cover}.page-thumb span{display:block;padding:5px 6px;color:#fff;font-size:.72rem;font-weight:850;text-align:center}
    @media(max-width:760px){
      .crop-controls{grid-template-columns:1fr 1fr}.crop-modal{padding:13px}.crop-actions{flex-direction:column}.crop-actions>div{width:100%}.crop-actions button{flex:1}
      .page-carousel-trigger{padding:8px 20px!important}.page-carousel-panel{padding:10px}.page-carousel-close{display:block}.page-thumb{flex-basis:104px}.page-thumb img{height:66px}
    }
  `
  document.head.appendChild(style)
}

function normalizeCrop(crop) {
  const c = {
    left: Math.max(0, Math.min(45, Number(crop?.left) || 0)),
    right: Math.max(0, Math.min(45, Number(crop?.right) || 0)),
    top: Math.max(0, Math.min(45, Number(crop?.top) || 0)),
    bottom: Math.max(0, Math.min(45, Number(crop?.bottom) || 0)),
  }
  if (c.left + c.right > 85) c.right = Math.max(0, 85 - c.left)
  if (c.top + c.bottom > 85) c.bottom = Math.max(0, 85 - c.top)
  return c
}

function hasCrop(crop) {
  return crop && (crop.left > 0 || crop.right > 0 || crop.top > 0 || crop.bottom > 0)
}

function updateCropPreview(modal, crop) {
  const box = q('.crop-box', modal)
  const top = q('.crop-shade.top', modal)
  const right = q('.crop-shade.right', modal)
  const bottom = q('.crop-shade.bottom', modal)
  const left = q('.crop-shade.left', modal)
  const x = crop.left
  const y = crop.top
  const w = 100 - crop.left - crop.right
  const h = 100 - crop.top - crop.bottom
  Object.assign(box.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` })
  Object.assign(top.style, { left: '0', top: '0', width: '100%', height: `${y}%` })
  Object.assign(bottom.style, { left: '0', bottom: '0', width: '100%', height: `${crop.bottom}%` })
  Object.assign(left.style, { left: '0', top: `${y}%`, width: `${x}%`, height: `${h}%` })
  Object.assign(right.style, { right: '0', top: `${y}%`, width: `${crop.right}%`, height: `${h}%` })
  qa('.crop-control', modal).forEach(control => {
    const input = q('input', control)
    const value = q('strong', control)
    if (input && value) value.textContent = `${input.value}%`
  })
}

async function makeCroppedPreview(source, crop) {
  const res = await fetch(source)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const sx = Math.round(bitmap.width * crop.left / 100)
  const sy = Math.round(bitmap.height * crop.top / 100)
  const sw = Math.max(1, Math.round(bitmap.width * (100 - crop.left - crop.right) / 100))
  const sh = Math.max(1, Math.round(bitmap.height * (100 - crop.top - crop.bottom) / 100))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  bitmap.close?.()
  const out = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  return out ? URL.createObjectURL(out) : source
}

function markCardCrop(card, source, crop) {
  cropBySource.set(source, crop)
  const meta = q('.frame-meta', card)
  let badge = q('.crop-badge', meta)
  if (!badge) {
    badge = document.createElement('span')
    badge.className = 'crop-badge'
    badge.textContent = 'Cropped'
    meta?.insertBefore(badge, q('.crop-button', meta) || q('.delete', meta))
  }
}

async function showCropModal(card) {
  const img = q('img', card)
  if (!img) return
  const originalSource = img.dataset.originalCropSource || img.src
  img.dataset.originalCropSource = originalSource
  let crop = normalizeCrop(cropBySource.get(originalSource) || {})

  const backdrop = document.createElement('div')
  backdrop.className = 'crop-modal-backdrop'
  backdrop.innerHTML = `
    <div class="crop-modal" role="dialog" aria-modal="true" aria-label="Crop page">
      <div class="crop-modal-head"><div><h2>Crop page</h2><p>Trim away anything you do not want to appear in the eBook.</p></div><button type="button" class="crop-x">✕</button></div>
      <div class="crop-preview">
        <img src="${originalSource}" alt="Crop preview">
        <div class="crop-shade top"></div><div class="crop-shade right"></div><div class="crop-shade bottom"></div><div class="crop-shade left"></div><div class="crop-box"></div>
      </div>
      <div class="crop-controls">
        ${['left','right','top','bottom'].map(side => `<label class="crop-control"><span>${side[0].toUpperCase()+side.slice(1)} <strong>${crop[side]}%</strong></span><input data-side="${side}" type="range" min="0" max="45" step="1" value="${crop[side]}"></label>`).join('')}
      </div>
      <div class="crop-actions"><button type="button" class="reset-crop">Reset crop</button><div><button type="button" class="cancel-crop">Cancel</button><button type="button" class="apply-crop">Apply crop</button></div></div>
    </div>`
  document.body.appendChild(backdrop)
  const modal = q('.crop-modal', backdrop)

  const close = () => backdrop.remove()
  q('.crop-x', modal).onclick = close
  q('.cancel-crop', modal).onclick = close
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close() })

  qa('input[type="range"]', modal).forEach(input => {
    input.addEventListener('input', () => {
      crop[input.dataset.side] = Number(input.value)
      crop = normalizeCrop(crop)
      qa('input[type="range"]', modal).forEach(control => { control.value = crop[control.dataset.side] })
      updateCropPreview(modal, crop)
    })
  })

  q('.reset-crop', modal).onclick = () => {
    crop = { left: 0, right: 0, top: 0, bottom: 0 }
    qa('input[type="range"]', modal).forEach(control => { control.value = 0 })
    updateCropPreview(modal, crop)
  }

  q('.apply-crop', modal).onclick = async () => {
    const button = q('.apply-crop', modal)
    button.disabled = true
    button.textContent = 'Applying…'
    const old = cropPreviewUrls.get(originalSource)
    if (old) URL.revokeObjectURL(old)
    cropBySource.set(originalSource, crop)
    if (hasCrop(crop)) {
      try {
        const previewUrl = await makeCroppedPreview(originalSource, crop)
        cropPreviewUrls.set(originalSource, previewUrl)
        img.src = previewUrl
        img.dataset.originalCropSource = originalSource
        markCardCrop(card, originalSource, crop)
      } catch {
        markCardCrop(card, originalSource, crop)
      }
    } else {
      img.src = originalSource
      q('.crop-badge', card)?.remove()
    }
    close()
  }

  updateCropPreview(modal, crop)
}

function injectCropButtons() {
  qa('.frame-card').forEach(card => {
    const meta = q('.frame-meta', card)
    if (!meta || q('.crop-button', meta)) return
    const del = q('.delete', meta)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'crop-button'
    button.textContent = 'Crop'
    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      showCropModal(card)
    })
    meta.insertBefore(button, del || null)
  })
}

function patchManifestFetch() {
  if (window.__cropCarouselFetchPatched) return
  window.__cropCarouselFetchPatched = true
  const previousFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || ''
      const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
      if (method === 'POST' && url.includes('/.netlify/functions/books') && typeof init?.body === 'string') {
        const manifest = JSON.parse(init.body)
        if (Array.isArray(manifest?.pages)) {
          const cards = qa('.frame-card')
          manifest.pages = manifest.pages.map((page, index) => {
            const img = q('img', cards[index] || document)
            const source = img?.dataset?.originalCropSource || img?.src
            const crop = source ? cropBySource.get(source) : null
            return hasCrop(crop) ? { ...page, crop } : page
          })
          init = { ...init, body: JSON.stringify(manifest) }
        }
      }
    } catch {}
    return previousFetch(input, init)
  }
}

async function getReaderBook() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  const bookId = match ? decodeURIComponent(match[1]) : ''
  if (!bookId) return null
  if (currentReaderBook && currentReaderBookId === bookId) return currentReaderBook
  try {
    const res = await fetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
    if (!res.ok) return null
    const data = await res.json()
    currentReaderBook = data.book || null
    currentReaderBookId = bookId
    return currentReaderBook
  } catch {
    return null
  }
}

function currentReaderIndex() {
  const value = Number(q('.page-count strong')?.textContent || 1)
  return Math.max(0, value - 1)
}

function jumpToPage(target) {
  const current = currentReaderIndex()
  const diff = target - current
  if (!diff) return
  const buttons = qa('.reader-footer button')
  const prev = buttons[0]
  const next = buttons[buttons.length - 1]
  const button = diff > 0 ? next : prev
  for (let i = 0; i < Math.abs(diff); i++) button?.click()
  setTimeout(syncCarouselActive, 60)
}

function syncCarouselActive() {
  const shell = q('.page-carousel-shell')
  if (!shell) return
  const index = currentReaderIndex()
  qa('.page-thumb', shell).forEach((thumb, i) => thumb.classList.toggle('active', i === index))
  const active = q('.page-thumb.active', shell)
  active?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

async function injectPageCarousel() {
  const reader = q('.reader')
  if (!reader || q('.page-carousel-shell')) return
  const book = await getReaderBook()
  if (!book || !Array.isArray(book.pages) || book.pages.length < 2 || !document.body.contains(reader)) return

  const shell = document.createElement('div')
  shell.className = `page-carousel-shell${carouselOpen ? ' open' : ''}`
  shell.innerHTML = `
    <button class="page-carousel-trigger" type="button">Pages ↑</button>
    <div class="page-carousel-panel">
      <div class="page-carousel-head"><span>Jump to a page</span><button class="page-carousel-close" type="button">Hide</button></div>
      <div class="page-carousel-track"></div>
    </div>`
  const track = q('.page-carousel-track', shell)
  book.pages.forEach((page, index) => {
    const thumb = document.createElement('button')
    thumb.type = 'button'
    thumb.className = 'page-thumb'
    thumb.innerHTML = `<img src="/.netlify/functions/page?bookId=${encodeURIComponent(book.id)}&pageId=${encodeURIComponent(page.id)}&v=${encodeURIComponent(book.updatedAt || '')}" alt=""><span>Page ${index + 1}</span>`
    thumb.onclick = () => { jumpToPage(index); if (matchMedia('(pointer:coarse)').matches) { carouselOpen = false; shell.classList.remove('open') } }
    track.appendChild(thumb)
  })

  q('.page-carousel-trigger', shell).onclick = () => {
    carouselOpen = true
    shell.classList.add('open')
  }
  q('.page-carousel-close', shell).onclick = () => {
    carouselOpen = false
    shell.classList.remove('open')
  }
  document.body.appendChild(shell)
  syncCarouselActive()
}

async function applyReaderCrop() {
  const reader = q('.reader')
  const img = q('.reader-page img', reader || document)
  if (!reader || !img) return
  const book = await getReaderBook()
  const index = currentReaderIndex()
  const page = book?.pages?.[index]
  if (!page?.crop || !hasCrop(page.crop)) return
  const key = `${book.id}:${page.id}:${JSON.stringify(page.crop)}`
  if (img.dataset.appliedCropKey === key) return
  const original = img.src
  img.dataset.appliedCropKey = key
  try {
    img.src = await makeCroppedPreview(original, normalizeCrop(page.crop))
  } catch {}
}

function cleanupReaderTools() {
  if (q('.reader')) return
  q('.page-carousel-shell')?.remove()
  currentReaderBook = null
  currentReaderBookId = ''
  carouselOpen = false
}

function syncTools() {
  addToolStyles()
  injectCropButtons()
  injectPageCarousel()
  applyReaderCrop()
  syncCarouselActive()
  cleanupReaderTools()
}

patchManifestFetch()
addToolStyles()
const toolsObserver = new MutationObserver(() => syncTools())
toolsObserver.observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('popstate', () => setTimeout(syncTools, 0))
setInterval(syncTools, 900)
syncTools()
