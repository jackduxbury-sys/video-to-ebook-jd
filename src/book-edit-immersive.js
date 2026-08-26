const EBOOKS_API = '/.netlify/functions/books'
const EPAGE_API = '/.netlify/functions/page'
const eq = (selector, root = document) => root.querySelector(selector)
const eqa = (selector, root = document) => [...root.querySelectorAll(selector)]
const directFetch = (...args) => (window.__ambientOriginalFetch || window.fetch)(...args)

const EDIT_SOUND_GROUPS = [
  { label: 'Off', options: [{ id: 'off', label: 'Off' }] },
  { label: 'Nature ambience', options: [
    { id: 'rain', label: 'Gentle rain' },
    { id: 'forest', label: 'Forest' },
    { id: 'ocean', label: 'Ocean waves' },
    { id: 'night', label: 'Night crickets' },
    { id: 'fireplace', label: 'Cosy fireplace' },
    { id: 'dreamy', label: 'Soft dreamy ambience' },
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

let editState = null
let editDragIndex = null
let immersiveTimer = null

function editPageUrl(bookId, pageId, cache = '') {
  const qs = new URLSearchParams({ bookId, pageId })
  if (cache) qs.set('v', cache)
  return `${EPAGE_API}?${qs}`
}

function escapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function normalizeCrop(crop) {
  const result = {
    left: Math.max(0, Math.min(45, Number(crop?.left) || 0)),
    right: Math.max(0, Math.min(45, Number(crop?.right) || 0)),
    top: Math.max(0, Math.min(45, Number(crop?.top) || 0)),
    bottom: Math.max(0, Math.min(45, Number(crop?.bottom) || 0)),
  }
  if (result.left + result.right > 85) result.right = Math.max(0, 85 - result.left)
  if (result.top + result.bottom > 85) result.bottom = Math.max(0, 85 - result.top)
  return result
}

function hasCrop(crop) {
  return !!crop && (crop.left > 0 || crop.right > 0 || crop.top > 0 || crop.bottom > 0)
}

function soundMarkup(selected = 'off') {
  return EDIT_SOUND_GROUPS.map(group => {
    if (group.label === 'Off') {
      const option = group.options[0]
      return `<option value="${option.id}" ${selected === option.id ? 'selected' : ''}>${option.label}</option>`
    }
    return `<optgroup label="${group.label}">${group.options.map(option => `<option value="${option.id}" ${selected === option.id ? 'selected' : ''}>${option.label}</option>`).join('')}</optgroup>`
  }).join('')
}

function addEditStyles() {
  if (eq('#ebook-edit-immersive-styles')) return
  const style = document.createElement('style')
  style.id = 'ebook-edit-immersive-styles'
  style.textContent = `
    .book-edit-button{color:#355e78!important}
    .book-edit-backdrop{position:fixed;inset:0;z-index:26000;background:#171612ee;overflow:auto;padding:20px}
    .book-edit-shell{width:min(1240px,100%);min-height:calc(100vh - 40px);margin:auto;background:#f6f1e7;color:#25241f;border-radius:25px;overflow:hidden;box-shadow:0 30px 100px #0009}
    .book-edit-head{position:sticky;top:0;z-index:4;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 22px;background:#fffdf8f2;border-bottom:1px solid #ded5c9;backdrop-filter:blur(12px)}
    .book-edit-head p{margin:0;color:#66746c;font-size:.75rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.book-edit-head h2{margin:3px 0 0;font-size:1.55rem}
    .book-edit-head-actions{display:flex;gap:8px}.book-edit-save{background:#2f5d50!important;color:#fff!important;border-color:#2f5d50!important}
    .book-edit-body{padding:22px}.book-edit-settings{display:grid;grid-template-columns:minmax(240px,1fr) minmax(240px,.75fr);gap:14px;margin-bottom:20px}
    .book-edit-settings label{display:grid;gap:7px;font-weight:850}.book-edit-settings input,.book-edit-settings select{width:100%;padding:11px 12px;border:1px solid #d4cabb;border-radius:12px;background:#fff}
    .book-edit-summary{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:12px}.book-edit-summary h3{margin:0}.book-edit-summary span{color:#746d63}
    .book-edit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.book-edit-card{position:relative;padding:10px;border:1px solid #ddd4c8;border-radius:16px;background:#fff}.book-edit-card.dragging{opacity:.45}
    .book-edit-card>img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:10px;background:#ddd}.book-edit-crop-tag{position:absolute;top:16px;right:16px;padding:4px 7px;border-radius:999px;background:#e7f0f4;color:#355e78;font-size:.65rem;font-weight:900}
    .book-edit-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:8px 1px}.book-edit-num{font-weight:900;color:#655e54}.book-edit-cover{display:flex;align-items:center;gap:5px;font-size:.75rem;font-weight:850;color:#696258}.book-edit-cover input{width:auto}
    .book-edit-caption{width:100%;padding:9px 10px;border:1px solid #d6cdbf;border-radius:10px}.book-edit-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.book-edit-actions button{padding:7px 8px;font-size:.78rem}.book-edit-delete{color:#a43c30!important}.book-edit-drag{text-align:center;color:#9b9287;font-size:.72rem;margin-top:7px}
    .book-edit-status{min-height:22px;margin-top:15px;font-size:.86rem;font-weight:800;color:#496052}.book-edit-status.error{color:#a43c30}
    .edit-crop-backdrop{position:fixed;inset:0;z-index:27000;background:#000a;display:grid;place-items:center;padding:18px}.edit-crop-modal{width:min(900px,96vw);max-height:94vh;overflow:auto;padding:18px;border-radius:22px;background:#fffdf8;color:#222}
    .edit-crop-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.edit-crop-head h3{margin:0}.edit-crop-preview{position:relative;width:min(760px,100%);margin:14px auto 0;background:#111;border-radius:14px;overflow:hidden;line-height:0}.edit-crop-preview img{display:block;width:100%;height:auto;max-height:58vh;object-fit:contain}
    .edit-crop-shade{position:absolute;background:#0009;pointer-events:none}.edit-crop-box{position:absolute;border:3px solid #fff;box-shadow:0 0 0 1px #0008;pointer-events:none}.edit-crop-controls{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:15px}.edit-crop-controls label{display:grid;gap:6px;font-size:.8rem;font-weight:850}.edit-crop-controls input{width:100%;padding:0}.edit-crop-actions{display:flex;justify-content:space-between;gap:10px;margin-top:16px}.edit-crop-actions>div{display:flex;gap:8px}.edit-crop-apply{background:#2f5d50!important;color:#fff!important;border-color:#2f5d50!important}

    .reader.is-fullscreen{background:#070706!important;display:block!important;overflow:hidden!important}
    .reader.is-fullscreen .reader-stage{position:absolute!important;inset:0!important;display:grid!important;grid-template-columns:70px minmax(0,1fr) 70px!important;align-items:stretch!important;background:#070706!important}
    .reader.is-fullscreen .reader-page{position:relative!important;width:100%!important;height:100%!important;margin:0!important;padding:1.2vh 4vw!important;display:grid!important;place-items:center!important;overflow:hidden!important}
    .reader.is-fullscreen .reader-page img{max-width:100%!important;max-height:97.5vh!important;border-radius:3px!important;box-shadow:0 30px 100px #000!important}
    .reader.is-fullscreen .reader-page figcaption{position:absolute!important;left:50%!important;bottom:24px!important;transform:translateX(-50%)!important;width:min(900px,82vw)!important;margin:0!important;background:#fffef2e8!important;backdrop-filter:blur(8px)!important;box-shadow:0 8px 32px #0007!important}
    .reader.is-fullscreen .reader-top,.reader.is-fullscreen .ambient-toolbar,.reader.is-fullscreen .reader-footer{position:fixed!important;left:0!important;right:0!important;z-index:18000!important;opacity:0!important;pointer-events:none!important;transition:opacity .22s ease,transform .22s ease!important}
    .reader.is-fullscreen .reader-top{top:0!important;transform:translateY(-110%)!important}.reader.is-fullscreen .ambient-toolbar{top:58px!important;transform:translateY(-125%)!important}.reader.is-fullscreen .reader-footer{bottom:0!important;transform:translateY(110%)!important}
    .reader.is-fullscreen.immersive-awake .reader-top,.reader.is-fullscreen.immersive-awake .ambient-toolbar,.reader.is-fullscreen.immersive-awake .reader-footer{opacity:1!important;pointer-events:auto!important;transform:translateY(0)!important}
    .reader.is-fullscreen .nav-side{opacity:.1!important;background:transparent!important;transition:opacity .2s ease,background .2s ease!important;z-index:4!important}.reader.is-fullscreen.immersive-awake .nav-side,.reader.is-fullscreen .nav-side:hover{opacity:.8!important;background:#ffffff08!important}
    .reader.is-fullscreen:not(.immersive-awake){cursor:none}.reader.is-fullscreen .page-carousel-trigger{opacity:.22!important}.reader.is-fullscreen.immersive-awake .page-carousel-trigger,.reader.is-fullscreen .page-carousel-shell:hover .page-carousel-trigger{opacity:.9!important}
    .immersive-hint{position:fixed;top:15px;left:50%;z-index:18500;transform:translateX(-50%);padding:7px 12px;border-radius:999px;background:#0009;color:#ddd;font-size:.73rem;font-weight:800;opacity:0;pointer-events:none;transition:opacity .2s}.reader.is-fullscreen.immersive-awake .immersive-hint{opacity:.75}

    @media(max-width:760px){.book-edit-backdrop{padding:0}.book-edit-shell{min-height:100vh;border-radius:0}.book-edit-head{align-items:flex-start;flex-direction:column}.book-edit-head-actions{width:100%}.book-edit-head-actions button{flex:1}.book-edit-body{padding:14px}.book-edit-settings{grid-template-columns:1fr}.book-edit-grid{grid-template-columns:1fr 1fr}.edit-crop-controls{grid-template-columns:1fr 1fr}.reader.is-fullscreen .reader-stage{grid-template-columns:40px minmax(0,1fr) 40px!important}.reader.is-fullscreen .reader-page{padding:1vh 1vw!important}.reader.is-fullscreen .reader-page figcaption{width:88vw!important}}
    @media(max-width:520px){.book-edit-grid{grid-template-columns:1fr}}
  `
  document.head.appendChild(style)
}

function getBookIdFromCard(card) {
  const cover = eq('.book-cover', card)
  if (!cover?.src) return ''
  try { return new URL(cover.src).searchParams.get('bookId') || '' } catch { return '' }
}

function injectEditButtons() {
  eqa('.book-card').forEach(card => {
    const actions = eq('.card-actions', card)
    if (!actions || eq('.book-edit-button', actions)) return
    const bookId = getBookIdFromCard(card)
    if (!bookId) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'book-edit-button'
    button.textContent = 'Edit'
    button.onclick = event => {
      event.preventDefault()
      event.stopPropagation()
      openBookEditor(bookId)
    }
    actions.insertBefore(button, eq('.danger-ghost', actions) || null)
  })
}

async function loadBook(bookId) {
  const response = await directFetch(`${EBOOKS_API}?id=${encodeURIComponent(bookId)}`)
  if (!response.ok) throw new Error(`Could not load this book (${response.status}).`)
  const data = await response.json()
  if (!data?.book) throw new Error('Book not found.')
  return data.book
}

async function cropBlobFromSource(source, crop) {
  const response = await directFetch(source)
  if (!response.ok) throw new Error('Could not load this page image.')
  const blob = await response.blob()
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
  if (!out) throw new Error('Could not create the cropped image.')
  return out
}

function renderEditPages() {
  const grid = eq('.book-edit-grid')
  if (!grid || !editState) return
  grid.innerHTML = ''
  editState.pages.forEach((page, index) => {
    const source = page.previewUrl || editPageUrl(editState.book.id, page.id, editState.book.updatedAt)
    const card = document.createElement('article')
    card.className = 'book-edit-card'
    card.draggable = true
    card.innerHTML = `
      ${hasCrop(page.crop) ? '<span class="book-edit-crop-tag">Cropped</span>' : ''}
      <img src="${source}" alt="Page ${index + 1}">
      <div class="book-edit-card-top"><span class="book-edit-num">Page ${index + 1}</span><label class="book-edit-cover"><input type="radio" name="edit-cover" ${editState.coverPageId === page.id ? 'checked' : ''}> Cover</label></div>
      <input class="book-edit-caption" value="${escapeAttr(page.caption || '')}" placeholder="Optional page caption…">
      <div class="book-edit-actions"><button type="button" data-action="crop">Crop</button><button type="button" class="book-edit-delete" data-action="delete">Delete page</button></div>
      <div class="book-edit-drag">⋮⋮ drag to reorder</div>`

    eq('.book-edit-caption', card).oninput = event => { page.caption = event.target.value }
    eq('input[type="radio"]', card).onchange = () => { editState.coverPageId = page.id }
    eq('[data-action="crop"]', card).onclick = () => openEditCrop(page, card)
    eq('[data-action="delete"]', card).onclick = () => {
      if (editState.pages.length <= 1) return alert('A book needs at least one page.')
      if (!confirm(`Delete page ${index + 1} from this book?`)) return
      editState.deletedPageIds.add(page.id)
      if (page.previewUrl) URL.revokeObjectURL(page.previewUrl)
      editState.pages.splice(index, 1)
      if (editState.coverPageId === page.id) editState.coverPageId = editState.pages[0]?.id || ''
      renderEditPages()
    }

    card.ondragstart = () => { editDragIndex = index; card.classList.add('dragging') }
    card.ondragend = () => { editDragIndex = null; card.classList.remove('dragging') }
    card.ondragover = event => event.preventDefault()
    card.ondrop = event => {
      event.preventDefault()
      if (editDragIndex == null || editDragIndex === index) return
      const [moved] = editState.pages.splice(editDragIndex, 1)
      editState.pages.splice(index, 0, moved)
      editDragIndex = null
      renderEditPages()
    }
    grid.appendChild(card)
  })
  const count = eq('.book-edit-count')
  if (count) count.textContent = `${editState.pages.length} pages`
}

function updateCropOverlay(modal, crop) {
  const x = crop.left
  const y = crop.top
  const w = 100 - crop.left - crop.right
  const h = 100 - crop.top - crop.bottom
  Object.assign(eq('.edit-crop-box', modal).style, { left:`${x}%`, top:`${y}%`, width:`${w}%`, height:`${h}%` })
  Object.assign(eq('.edit-crop-shade.top', modal).style, { left:'0', top:'0', width:'100%', height:`${y}%` })
  Object.assign(eq('.edit-crop-shade.bottom', modal).style, { left:'0', bottom:'0', width:'100%', height:`${crop.bottom}%` })
  Object.assign(eq('.edit-crop-shade.left', modal).style, { left:'0', top:`${y}%`, width:`${x}%`, height:`${h}%` })
  Object.assign(eq('.edit-crop-shade.right', modal).style, { right:'0', top:`${y}%`, width:`${crop.right}%`, height:`${h}%` })
  eqa('input[type="range"]', modal).forEach(input => {
    const strong = eq(`strong[data-value="${input.dataset.side}"]`, modal)
    if (strong) strong.textContent = `${input.value}%`
  })
}

function openEditCrop(page, card) {
  if (!editState) return
  const source = page.previewUrl || editPageUrl(editState.book.id, page.id, editState.book.updatedAt)
  let crop = normalizeCrop(page.crop)
  const backdrop = document.createElement('div')
  backdrop.className = 'edit-crop-backdrop'
  backdrop.innerHTML = `<div class="edit-crop-modal">
    <div class="edit-crop-head"><div><h3>Crop page</h3><p>Trim away anything you do not want to show.</p></div><button type="button" class="edit-crop-close">✕</button></div>
    <div class="edit-crop-preview"><img src="${source}" alt=""><div class="edit-crop-shade top"></div><div class="edit-crop-shade right"></div><div class="edit-crop-shade bottom"></div><div class="edit-crop-shade left"></div><div class="edit-crop-box"></div></div>
    <div class="edit-crop-controls">${['left','right','top','bottom'].map(side => `<label><span>${side[0].toUpperCase()+side.slice(1)} <strong data-value="${side}">${crop[side]}%</strong></span><input type="range" min="0" max="45" step="1" data-side="${side}" value="${crop[side]}"></label>`).join('')}</div>
    <div class="edit-crop-actions"><button type="button" class="edit-crop-reset">Reset</button><div><button type="button" class="edit-crop-cancel">Cancel</button><button type="button" class="edit-crop-apply">Apply crop</button></div></div>
  </div>`
  document.body.appendChild(backdrop)
  const modal = eq('.edit-crop-modal', backdrop)
  const close = () => backdrop.remove()
  eq('.edit-crop-close', modal).onclick = close
  eq('.edit-crop-cancel', modal).onclick = close
  backdrop.onclick = event => { if (event.target === backdrop) close() }
  eqa('input[type="range"]', modal).forEach(input => {
    input.oninput = () => {
      crop[input.dataset.side] = Number(input.value)
      crop = normalizeCrop(crop)
      eqa('input[type="range"]', modal).forEach(control => { control.value = crop[control.dataset.side] })
      updateCropOverlay(modal, crop)
    }
  })
  eq('.edit-crop-reset', modal).onclick = () => {
    crop = { left:0, right:0, top:0, bottom:0 }
    eqa('input[type="range"]', modal).forEach(control => { control.value = 0 })
    updateCropOverlay(modal, crop)
  }
  eq('.edit-crop-apply', modal).onclick = async () => {
    const button = eq('.edit-crop-apply', modal)
    button.disabled = true
    button.textContent = 'Applying…'
    try {
      if (page.previewUrl) URL.revokeObjectURL(page.previewUrl)
      if (hasCrop(crop)) {
        const blob = await cropBlobFromSource(source, crop)
        page.modifiedBlob = blob
        page.previewUrl = URL.createObjectURL(blob)
        page.crop = crop
      } else {
        page.modifiedBlob = null
        page.previewUrl = null
        page.crop = { left:0, right:0, top:0, bottom:0 }
      }
      close()
      renderEditPages()
    } catch (error) {
      button.disabled = false
      button.textContent = 'Apply crop'
      alert(error.message)
    }
  }
  updateCropOverlay(modal, crop)
}

async function openBookEditor(bookId) {
  if (editState) return
  addEditStyles()
  const backdrop = document.createElement('div')
  backdrop.className = 'book-edit-backdrop'
  backdrop.innerHTML = `<div class="book-edit-shell"><div class="book-edit-body"><div class="book-edit-status">Loading book…</div></div></div>`
  document.body.appendChild(backdrop)
  document.body.style.overflow = 'hidden'
  try {
    const book = await loadBook(bookId)
    const cover = book.pages?.[book.coverIndex || 0]
    editState = {
      book,
      backdrop,
      pages: (book.pages || []).map(page => ({ ...page, crop: normalizeCrop(page.crop) })),
      coverPageId: cover?.id || book.pages?.[0]?.id || '',
      deletedPageIds: new Set(),
    }
    backdrop.innerHTML = `<div class="book-edit-shell">
      <header class="book-edit-head"><div><p>Edit published book</p><h2>${escapeAttr(book.title)}</h2></div><div class="book-edit-head-actions"><button type="button" class="book-edit-cancel">Cancel</button><button type="button" class="book-edit-save">Save changes</button></div></header>
      <div class="book-edit-body">
        <div class="book-edit-settings"><label><span>Book title</span><input class="book-edit-title" value="${escapeAttr(book.title)}"></label><label><span>Reader sound</span><select class="book-edit-sound">${soundMarkup(book.soundscapeId || 'off')}</select></label></div>
        <div class="book-edit-summary"><div><h3>Pages</h3><span>Drag to reorder, crop or delete pages.</span></div><strong class="book-edit-count">${book.pages?.length || 0} pages</strong></div>
        <div class="book-edit-grid"></div><div class="book-edit-status"></div>
      </div></div>`
    eq('.book-edit-cancel', backdrop).onclick = closeBookEditor
    eq('.book-edit-save', backdrop).onclick = saveBookEditor
    renderEditPages()
  } catch (error) {
    backdrop.innerHTML = `<div class="book-edit-shell"><div class="book-edit-body"><h2>Could not edit book</h2><p>${escapeAttr(error.message)}</p><button type="button" class="book-edit-cancel">Close</button></div></div>`
    eq('.book-edit-cancel', backdrop).onclick = closeBookEditor
  }
}

function closeBookEditor() {
  if (!editState) {
    eq('.book-edit-backdrop')?.remove()
    document.body.style.overflow = ''
    return
  }
  editState.pages.forEach(page => { if (page.previewUrl) URL.revokeObjectURL(page.previewUrl) })
  editState.backdrop?.remove()
  editState = null
  document.body.style.overflow = ''
}

async function saveBookEditor() {
  if (!editState) return
  const saveButton = eq('.book-edit-save', editState.backdrop)
  const status = eq('.book-edit-status', editState.backdrop)
  const title = eq('.book-edit-title', editState.backdrop)?.value.trim()
  const soundscapeId = eq('.book-edit-sound', editState.backdrop)?.value || 'off'
  if (!title) return alert('Add a book title.')
  if (!editState.pages.length) return alert('A book needs at least one page.')
  saveButton.disabled = true
  saveButton.textContent = 'Saving…'
  status.classList.remove('error')
  try {
    const changedImages = editState.pages.filter(page => page.modifiedBlob)
    for (let i = 0; i < changedImages.length; i++) {
      status.textContent = `Saving cropped page ${i + 1} of ${changedImages.length}…`
      const page = changedImages[i]
      const response = await directFetch(`${EPAGE_API}?bookId=${encodeURIComponent(editState.book.id)}&pageId=${encodeURIComponent(page.id)}`, {
        method: 'POST',
        headers: { 'content-type': page.modifiedBlob.type || 'image/jpeg' },
        body: page.modifiedBlob,
      })
      if (!response.ok) throw new Error(`Could not save page ${i + 1}.`)
    }

    const deleted = [...editState.deletedPageIds]
    for (let i = 0; i < deleted.length; i++) {
      status.textContent = `Deleting page ${i + 1} of ${deleted.length}…`
      const response = await directFetch(`${EPAGE_API}?bookId=${encodeURIComponent(editState.book.id)}&pageId=${encodeURIComponent(deleted[i])}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete a removed page.')
    }

    status.textContent = 'Saving book…'
    const now = new Date().toISOString()
    const coverIndex = Math.max(0, editState.pages.findIndex(page => page.id === editState.coverPageId))
    const manifest = {
      ...editState.book,
      title,
      soundscapeId,
      updatedAt: now,
      coverIndex,
      pages: editState.pages.map((page, index) => ({
        id: page.id,
        order: index,
        timestamp: page.timestamp,
        caption: String(page.caption || '').trim(),
        ...(hasCrop(page.crop) && !page.modifiedBlob ? { crop: page.crop } : {}),
      })),
    }
    const response = await directFetch(EBOOKS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(manifest),
    })
    if (!response.ok) throw new Error('Could not save the updated book.')
    status.textContent = 'Saved!'
    closeBookEditor()
    location.reload()
  } catch (error) {
    status.textContent = `Save failed: ${error.message}`
    status.classList.add('error')
    saveButton.disabled = false
    saveButton.textContent = 'Save changes'
  }
}

function readerFullscreenButton() {
  const reader = eq('.reader')
  if (!reader) return null
  return eqa('.reader-top button', reader).find(button => /full screen/i.test(button.textContent || '')) || null
}

function wakeImmersive() {
  const reader = eq('.reader.is-fullscreen')
  if (!reader) return
  reader.classList.add('immersive-awake')
  clearTimeout(immersiveTimer)
  immersiveTimer = setTimeout(() => reader.classList.remove('immersive-awake'), 2300)
}

function syncImmersive() {
  const reader = eq('.reader')
  if (!reader) return
  let hint = eq('.immersive-hint', reader)
  if (!hint) {
    hint = document.createElement('div')
    hint.className = 'immersive-hint'
    hint.textContent = 'Move or tap for controls'
    reader.appendChild(hint)
  }
  if (reader.classList.contains('is-fullscreen')) wakeImmersive()
}

function setupFullscreenInteractions() {
  if (window.__immersiveFullscreenReady) return
  window.__immersiveFullscreenReady = true
  document.addEventListener('click', event => {
    const button = event.target.closest?.('.reader-top button')
    if (!button || !/full screen/i.test(button.textContent || '')) return
    const reader = eq('.reader')
    if (!reader) return
    if (!reader.classList.contains('is-fullscreen')) {
      document.documentElement.requestFullscreen?.().catch?.(() => {})
      setTimeout(wakeImmersive, 80)
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch?.(() => {})
    }
  }, true)
  ;['mousemove','pointermove','touchstart','click'].forEach(type => document.addEventListener(type, () => wakeImmersive(), { passive:true }))
}

function syncBookEditImmersive() {
  addEditStyles()
  injectEditButtons()
  syncImmersive()
}

addEditStyles()
setupFullscreenInteractions()
const editObserver = new MutationObserver(syncBookEditImmersive)
editObserver.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] })
window.addEventListener('popstate', () => setTimeout(syncBookEditImmersive, 0))
setInterval(syncBookEditImmersive, 900)
syncBookEditImmersive()
