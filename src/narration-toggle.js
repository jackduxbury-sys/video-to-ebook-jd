const ntq = (selector, root = document) => root.querySelector(selector)
const ntNarrationMedia = new Set()
const ntNativePlay = HTMLMediaElement.prototype.play

function ntBookId() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function ntStorageKey(bookId) {
  return `ebook-narration:${bookId}`
}

function ntIsEnabled(bookId = ntBookId()) {
  if (!bookId) return true
  return localStorage.getItem(ntStorageKey(bookId)) !== 'off'
}

function ntIsNarrationMedia(media) {
  const src = String(media?.currentSrc || media?.src || '')
  return src.includes('/.netlify/functions/narration')
}

function ntStopNarrationMedia() {
  ntNarrationMedia.forEach(media => {
    try {
      if (!media.paused) media.pause()
      media.currentTime = 0
      media.dispatchEvent(new Event('ended'))
    } catch {}
  })
  ntNarrationMedia.clear()
  ntq('.nv2-reader-hint')?.remove()
}

function ntSetEnabled(enabled) {
  const bookId = ntBookId()
  if (!bookId) return
  localStorage.setItem(ntStorageKey(bookId), enabled ? 'on' : 'off')
  window.__ebookNarrationEnabled = enabled
  if (!enabled) ntStopNarrationMedia()
  ntSyncSettings()
}

HTMLMediaElement.prototype.play = function (...args) {
  if (ntIsNarrationMedia(this) && ntBookId()) {
    ntNarrationMedia.add(this)
    if (!ntIsEnabled()) {
      queueMicrotask(() => {
        try { this.dispatchEvent(new Event('ended')) } catch {}
      })
      return Promise.resolve()
    }
    const result = ntNativePlay.apply(this, args)
    Promise.resolve(result).finally(() => {
      const cleanup = () => ntNarrationMedia.delete(this)
      this.addEventListener('ended', cleanup, { once:true })
      this.addEventListener('error', cleanup, { once:true })
    })
    return result
  }
  return ntNativePlay.apply(this, args)
}

function ntAddStyles() {
  if (ntq('#narration-toggle-styles')) return
  const style = document.createElement('style')
  style.id = 'narration-toggle-styles'
  style.textContent = `
    .simple-narration-setting select{width:100%;padding:9px 10px;border:1px solid #d1c7b8;border-radius:11px;background:#fff;color:#25231f;font:inherit}
    .simple-narration-help{font-size:.68rem;color:#8a8175;line-height:1.3;margin-top:1px}
  `
  document.head.appendChild(style)
}

function ntInjectSettings() {
  const panel = ntq('.simple-reader-settings')
  if (!panel || ntq('.simple-narration-setting', panel)) return

  const label = document.createElement('label')
  label.className = 'simple-setting simple-narration-setting'
  label.innerHTML = `
    <span>Narration</span>
    <select class="simple-narration-select" aria-label="Page narration">
      <option value="on">On – play page recordings</option>
      <option value="off">Off – no page recordings</option>
    </select>
    <small class="simple-narration-help">Recorded narration plays automatically when you turn the page.</small>`

  const note = ntq('.simple-settings-note', panel)
  if (note) panel.insertBefore(label, note)
  else panel.appendChild(label)

  const select = ntq('.simple-narration-select', label)
  select.value = ntIsEnabled() ? 'on' : 'off'
  select.onchange = () => ntSetEnabled(select.value === 'on')
}

function ntSyncSettings() {
  const bookId = ntBookId()
  window.__ebookNarrationEnabled = bookId ? ntIsEnabled(bookId) : true
  ntInjectSettings()
  const select = ntq('.simple-narration-select')
  if (select) select.value = ntIsEnabled() ? 'on' : 'off'
  if (bookId && !ntIsEnabled()) ntq('.nv2-reader-hint')?.remove()
}

ntAddStyles()
const ntObserver = new MutationObserver(() => ntSyncSettings())
ntObserver.observe(document.documentElement, { childList:true, subtree:true })
window.addEventListener('popstate', () => setTimeout(ntSyncSettings, 0))
setInterval(ntSyncSettings, 700)
ntSyncSettings()
