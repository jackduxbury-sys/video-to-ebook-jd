// Cross-browser reliability helpers for the Create eBook workflow.
// Keeps the current UI/logic intact while making video preparation safer on slower/older devices.

(function () {
  // Older Safari/Edge may not expose crypto.randomUUID().
  try {
    if (window.crypto && typeof window.crypto.randomUUID !== 'function') {
      window.crypto.randomUUID = function () {
        const bytes = new Uint8Array(16)
        window.crypto.getRandomValues(bytes)
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'))
        return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10).join('')}`
      }
    }
  } catch {}

  // Very old Safari fallback for canvas.toBlob().
  if (window.HTMLCanvasElement && !HTMLCanvasElement.prototype.toBlob) {
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      try {
        const dataURL = this.toDataURL(type || 'image/png', quality)
        const parts = dataURL.split(',')
        const binary = atob(parts[1] || '')
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        callback(new Blob([bytes], { type: type || 'image/png' }))
      } catch {
        callback(null)
      }
    }
  }

  if (!String.prototype.replaceAll) {
    // eslint-disable-next-line no-extend-native
    String.prototype.replaceAll = function (search, replacement) {
      return this.split(search).join(replacement)
    }
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

  function creatorVideo() {
    return document.querySelector('.video-box video')
  }

  function generateButton() {
    return [...document.querySelectorAll('.video-box button')]
      .find(button => /generate frames/i.test(button.textContent || '')) || null
  }

  function removeNotice() {
    document.querySelector('.creator-compat-notice')?.remove()
  }

  function showNotice(message, isError = false) {
    removeNotice()
    const box = document.querySelector('.video-box')
    if (!box) return
    const notice = document.createElement('div')
    notice.className = 'creator-compat-notice'
    notice.style.cssText = `margin-top:10px;padding:11px 13px;border-radius:12px;font-size:.85rem;line-height:1.4;font-weight:700;${isError ? 'background:#fff0ed;color:#8d332b;border:1px solid #efc7c1' : 'background:#eef6f1;color:#35574b;border:1px solid #cfe2d8'}`
    notice.textContent = message
    box.appendChild(notice)
  }

  function waitForFrame(video, timeout = 12000) {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve(true)

    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => finish(false, new Error('Video frame timed out')), timeout)

      const cleanup = () => {
        clearTimeout(timer)
        video.removeEventListener('loadeddata', ready)
        video.removeEventListener('canplay', ready)
        video.removeEventListener('playing', ready)
        video.removeEventListener('error', failed)
      }
      const finish = (ok, error) => {
        if (settled) return
        settled = true
        cleanup()
        ok ? resolve(true) : reject(error || new Error('Video could not be decoded'))
      }
      const ready = () => {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) finish(true)
      }
      const failed = () => finish(false, new Error('Video could not be decoded'))

      video.addEventListener('loadeddata', ready)
      video.addEventListener('canplay', ready)
      video.addEventListener('playing', ready)
      video.addEventListener('error', failed)

      try {
        video.preload = 'auto'
        video.muted = true
        video.playsInline = true
        video.load()
        const playResult = video.play()
        if (playResult?.then) {
          playResult.then(async () => {
            await sleep(80)
            video.pause()
            ready()
          }).catch(() => {})
        }
      } catch {}
    })
  }

  async function prepareForExtraction(video, button) {
    removeNotice()
    const oldText = button.textContent
    button.textContent = 'Preparing video…'
    button.style.pointerEvents = 'none'
    button.setAttribute('aria-busy', 'true')

    try {
      await waitForFrame(video)
      // Nudge away from an undecoded exact-zero frame on browsers that need an initial seek.
      if (video.currentTime === 0 && Number.isFinite(video.duration) && video.duration > 0.02) {
        try {
          video.currentTime = Math.min(0.01, video.duration / 10)
          await Promise.race([
            new Promise(resolve => video.addEventListener('seeked', resolve, { once:true })),
            sleep(500),
          ])
        } catch {}
      }
      showNotice('Video ready — generating frames…')
      return true
    } catch {
      showNotice('This device could not decode that video. MP4 (H.264) is the most reliable format across school laptops and iPads. If the video came from an iPhone, exporting it as “Most Compatible” can also help.', true)
      return false
    } finally {
      button.textContent = oldText
      button.style.pointerEvents = ''
      button.removeAttribute('aria-busy')
    }
  }

  // React's creator can begin at time 0 before some browsers have decoded a frame.
  // Intercept only that first click, prepare the video, then replay the click once ready.
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('.video-box button')
    if (!button || !/generate frames/i.test(button.textContent || '')) return
    if (button.dataset.creatorCompatPass === '1') {
      delete button.dataset.creatorCompatPass
      return
    }

    const video = creatorVideo()
    if (!video) return
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()

    const ok = await prepareForExtraction(video, button)
    if (!ok) return
    button.dataset.creatorCompatPass = '1'
    setTimeout(() => button.click(), 0)
  }, true)

  // Proactively preload the selected video as soon as React mounts it.
  const observer = new MutationObserver(() => {
    const video = creatorVideo()
    if (!video || video.dataset.creatorCompatPrepared === '1') return
    video.dataset.creatorCompatPrepared = '1'
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    try { video.load() } catch {}
  })
  observer.observe(document.documentElement, { childList:true, subtree:true })
})()
