import { jsPDF } from 'jspdf'

const pq = (selector, root = document) => root.querySelector(selector)
const pqa = (selector, root = document) => [...root.querySelectorAll(selector)]
const pdfFetch = (...args) => (window.__ambientOriginalFetch || window.fetch.bind(window))(...args)

let pdfBusy = false

function addPdfStyles() {
  if (pq('#ebook-pdf-export-styles')) return
  const style = document.createElement('style')
  style.id = 'ebook-pdf-export-styles'
  style.textContent = `
    .book-pdf-button{color:#695631!important}
    .pdf-export-progress{position:fixed;inset:0;z-index:40000;display:grid;place-items:center;padding:20px;background:#1119;backdrop-filter:blur(5px)}
    .pdf-export-card{width:min(390px,calc(100vw - 30px));padding:20px;border-radius:20px;background:#fffdf8;color:#292720;box-shadow:0 25px 80px #0008;text-align:center}
    .pdf-export-card h3{margin:0 0 7px;font-size:1.15rem}.pdf-export-card p{margin:0;color:#746d63;font-size:.85rem;line-height:1.45}
    .pdf-export-bar{height:8px;margin-top:15px;border-radius:999px;background:#e9e1d5;overflow:hidden}.pdf-export-bar span{display:block;height:100%;width:0;background:#4f7567;border-radius:inherit;transition:width .18s ease}
    .pdf-export-count{margin-top:8px!important;font-size:.75rem!important;font-weight:800!important;color:#82796d!important}
  `
  document.head.appendChild(style)
}

function pageUrl(bookId, pageId, version = '') {
  const qs = new URLSearchParams({ bookId, pageId })
  if (version) qs.set('v', version)
  return `/.netlify/functions/page?${qs}`
}

function bookIdFromCard(card) {
  const image = pq('.book-cover', card)
  if (!image?.src) return ''
  try { return new URL(image.src).searchParams.get('bookId') || '' } catch { return '' }
}

function routeBookId() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function safeFilename(title) {
  const cleaned = String(title || 'ebook')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  return `${cleaned || 'ebook'}.pdf`
}

async function loadBook(bookId) {
  const response = await pdfFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
  if (!response.ok) throw new Error('Could not load this book.')
  const data = await response.json()
  if (!data?.book) throw new Error('Book not found.')
  return data.book
}

function showProgress(title, total) {
  pq('.pdf-export-progress')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'pdf-export-progress'
  overlay.innerHTML = `<div class="pdf-export-card"><h3>Creating PDF</h3><p>${escapeHtml(title)}</p><div class="pdf-export-bar"><span></span></div><p class="pdf-export-count">Preparing ${total} page${total === 1 ? '' : 's'}…</p></div>`
  document.body.appendChild(overlay)
  return overlay
}

function updateProgress(overlay, current, total) {
  const percent = total ? Math.round((current / total) * 100) : 0
  const bar = pq('.pdf-export-bar span', overlay)
  const count = pq('.pdf-export-count', overlay)
  if (bar) bar.style.width = `${percent}%`
  if (count) count.textContent = `Page ${Math.min(current, total)} of ${total}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function normalizedCrop(crop) {
  const left = Math.max(0, Math.min(45, Number(crop?.left) || 0))
  const right = Math.max(0, Math.min(45, Number(crop?.right) || 0))
  const top = Math.max(0, Math.min(45, Number(crop?.top) || 0))
  const bottom = Math.max(0, Math.min(45, Number(crop?.bottom) || 0))
  return { left, right, top, bottom }
}

async function pageCanvas(book, page) {
  const response = await pdfFetch(pageUrl(book.id, page.id, book.updatedAt || ''))
  if (!response.ok) throw new Error('Could not load one of the book pages.')
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const crop = normalizedCrop(page.crop)
  const sx = Math.round(bitmap.width * crop.left / 100)
  const sy = Math.round(bitmap.height * crop.top / 100)
  const sw = Math.max(1, Math.round(bitmap.width * (100 - crop.left - crop.right) / 100))
  const sh = Math.max(1, Math.round(bitmap.height * (100 - crop.top - crop.bottom) / 100))

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { alpha:false })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sw, sh)
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  bitmap.close?.()
  return canvas
}

function addCanvasToCurrentPage(pdf, canvas) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 8
  const availableWidth = pageWidth - margin * 2
  const availableHeight = pageHeight - margin * 2
  const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height)
  const width = canvas.width * scale
  const height = canvas.height * scale
  const x = (pageWidth - width) / 2
  const y = (pageHeight - height) / 2
  pdf.addImage(canvas, 'JPEG', x, y, width, height, undefined, 'FAST')
}

async function exportBookPdf(bookId) {
  if (!bookId || pdfBusy) return
  pdfBusy = true
  let overlay = null
  try {
    const book = await loadBook(bookId)
    const pages = book.pages || []
    if (!pages.length) throw new Error('This book has no pages to export.')
    overlay = showProgress(book.title || 'eBook', pages.length)

    let pdf = null
    for (let index = 0; index < pages.length; index++) {
      const canvas = await pageCanvas(book, pages[index])
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait'
      if (!pdf) {
        pdf = new jsPDF({ orientation, unit:'mm', format:'a4', compress:true })
      } else {
        pdf.addPage('a4', orientation)
      }
      addCanvasToCurrentPage(pdf, canvas)
      canvas.width = 1
      canvas.height = 1
      updateProgress(overlay, index + 1, pages.length)
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    const count = pq('.pdf-export-count', overlay)
    if (count) count.textContent = 'Downloading PDF…'
    pdf.save(safeFilename(book.title))
    setTimeout(() => overlay?.remove(), 450)
  } catch (error) {
    overlay?.remove()
    alert(`Could not create PDF: ${error?.message || 'Unknown error'}`)
  } finally {
    pdfBusy = false
  }
}

function injectLibraryButtons() {
  pqa('.book-card').forEach(card => {
    const actions = pq('.card-actions', card)
    if (!actions || pq('.book-pdf-button', actions)) return
    const bookId = bookIdFromCard(card)
    if (!bookId) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'book-pdf-button'
    button.textContent = 'PDF'
    button.title = 'Save book as PDF'
    button.onclick = event => {
      event.preventDefault()
      event.stopPropagation()
      exportBookPdf(bookId)
    }
    actions.insertBefore(button, pq('.danger-ghost', actions) || null)
  })
}

function injectReaderButton() {
  const reader = pq('.reader.reader-simple')
  const tools = pq('.simple-reader-tools', reader || document)
  if (!reader || !tools || pq('[data-reader-tool="pdf"]', tools)) return
  const groups = pqa('.tool-group', tools)
  const right = groups[groups.length - 1]
  if (!right) return
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.readerTool = 'pdf'
  button.title = 'Save as PDF'
  button.setAttribute('aria-label', 'Save as PDF')
  button.textContent = 'PDF'
  button.style.fontSize = '.68rem'
  button.onclick = event => {
    event.preventDefault()
    event.stopPropagation()
    exportBookPdf(routeBookId())
  }
  right.insertBefore(button, right.firstChild)
}

function syncPdfExport() {
  addPdfStyles()
  injectLibraryButtons()
  injectReaderButton()
}

addPdfStyles()
const pdfObserver = new MutationObserver(syncPdfExport)
pdfObserver.observe(document.documentElement, { childList:true, subtree:true })
window.addEventListener('popstate', () => setTimeout(syncPdfExport, 0))
setInterval(syncPdfExport, 900)
syncPdfExport()
