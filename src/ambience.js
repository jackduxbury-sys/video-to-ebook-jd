const AMBIENCE_OPTIONS = [
  { id: 'off', label: 'Off' },
  { id: 'rain', label: 'Gentle rain' },
  { id: 'forest', label: 'Forest' },
  { id: 'ocean', label: 'Ocean waves' },
  { id: 'night', label: 'Night crickets' },
  { id: 'fireplace', label: 'Cosy fireplace' },
  { id: 'dreamy', label: 'Soft dreamy ambience' },
]

const $ = (selector, root = document) => root.querySelector(selector)

class AmbientEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.cleanup = null
    this.current = 'off'
    this.volume = 0.32
  }

  async ensure() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) throw new Error('Ambient audio is not supported in this browser.')
      this.ctx = new AudioContextClass()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0))
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08)
  }

  noiseBuffer(seconds = 12, tint = 'white') {
    const length = Math.floor(this.ctx.sampleRate * seconds)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let a = 0
    let b = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      if (tint === 'brown') {
        a = (a + 0.02 * white) / 1.02
        data[i] = a * 3.5
      } else if (tint === 'pink') {
        a = 0.985 * a + 0.15 * white
        b = 0.85 * b + 0.08 * white
        data[i] = (a + b) * 1.5
      } else {
        data[i] = white
      }
    }
    return buffer
  }

  noiseLoop({ tint = 'white', gain = 0.08, lowpass, highpass } = {}) {
    const source = this.ctx.createBufferSource()
    source.buffer = this.noiseBuffer(18 + Math.random() * 7, tint)
    source.loop = true
    let tail = source
    const nodes = [source]

    if (highpass) {
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = highpass
      tail.connect(filter)
      tail = filter
      nodes.push(filter)
    }
    if (lowpass) {
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = lowpass
      tail.connect(filter)
      tail = filter
      nodes.push(filter)
    }

    const amp = this.ctx.createGain()
    amp.gain.value = gain
    tail.connect(amp)
    amp.connect(this.master)
    nodes.push(amp)
    source.start(0, Math.random() * 5)
    return {
      gain: amp.gain,
      stop: () => {
        try { source.stop() } catch {}
        nodes.forEach(node => { try { node.disconnect() } catch {} })
      },
    }
  }

  noiseBurst({ duration = 0.08, gain = 0.03, highpass = 1200, lowpass = 7000 } = {}) {
    const source = this.ctx.createBufferSource()
    source.buffer = this.noiseBuffer(Math.max(0.12, duration), 'white')
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = highpass
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = lowpass
    const amp = this.ctx.createGain()
    const now = this.ctx.currentTime
    amp.gain.setValueAtTime(0.0001, now)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), now + 0.008)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    source.connect(hp)
    hp.connect(lp)
    lp.connect(amp)
    amp.connect(this.master)
    source.start(now)
    source.stop(now + duration + 0.04)
  }

  chirp({ start = 1600, end = 2400, duration = 0.16, gain = 0.02, type = 'sine' } = {}) {
    const osc = this.ctx.createOscillator()
    const amp = this.ctx.createGain()
    const now = this.ctx.currentTime
    osc.type = type
    osc.frequency.setValueAtTime(start, now)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), now + duration)
    amp.gain.setValueAtTime(0.0001, now)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), now + 0.02)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(amp)
    amp.connect(this.master)
    osc.start(now)
    osc.stop(now + duration + 0.03)
  }

  stop() {
    if (this.cleanup) this.cleanup()
    this.cleanup = null
    this.current = 'off'
  }

  async play(id) {
    if (id === 'off') return this.stop()
    await this.ensure()
    if (this.current === id) return
    this.stop()
    this.current = id
    this.cleanup = this.startSound(id)
  }

  startSound(id) {
    const timers = []
    const parts = []
    const later = (fn, delay) => timers.push(setTimeout(fn, delay))
    const every = (fn, delay) => timers.push(setInterval(fn, delay))

    if (id === 'rain') {
      parts.push(this.noiseLoop({ tint: 'pink', gain: 0.14, highpass: 650, lowpass: 7200 }))
      parts.push(this.noiseLoop({ tint: 'brown', gain: 0.045, highpass: 70, lowpass: 1000 }))
      every(() => this.noiseBurst({
        duration: 0.07 + Math.random() * 0.14,
        gain: 0.012 + Math.random() * 0.025,
        highpass: 1800,
        lowpass: 9000,
      }), 190)
    }

    if (id === 'forest') {
      parts.push(this.noiseLoop({ tint: 'pink', gain: 0.045, highpass: 160, lowpass: 2600 }))
      const birds = () => {
        this.chirp({
          start: 1300 + Math.random() * 1000,
          end: 2200 + Math.random() * 1200,
          duration: 0.12 + Math.random() * 0.18,
          gain: 0.012 + Math.random() * 0.02,
        })
        if (Math.random() > 0.45) later(() => this.chirp({
          start: 1600 + Math.random() * 900,
          end: 2500 + Math.random() * 900,
          duration: 0.1 + Math.random() * 0.15,
          gain: 0.01 + Math.random() * 0.017,
        }), 120 + Math.random() * 260)
      }
      every(birds, 2600 + Math.random() * 1300)
      later(birds, 700)
    }

    if (id === 'ocean') {
      const surf = this.noiseLoop({ tint: 'brown', gain: 0.09, highpass: 45, lowpass: 1500 })
      const foam = this.noiseLoop({ tint: 'pink', gain: 0.018, highpass: 900, lowpass: 6000 })
      parts.push(surf, foam)
      const lfo = this.ctx.createOscillator()
      const depth = this.ctx.createGain()
      lfo.frequency.value = 0.07
      depth.gain.value = 0.055
      lfo.connect(depth)
      depth.connect(surf.gain)
      lfo.start()
      parts.push({ stop: () => { try { lfo.stop() } catch {}; try { lfo.disconnect() } catch {}; try { depth.disconnect() } catch {} } })
    }

    if (id === 'night') {
      parts.push(this.noiseLoop({ tint: 'brown', gain: 0.026, highpass: 90, lowpass: 1200 }))
      const cluster = () => {
        const base = 3150 + Math.random() * 900
        for (let i = 0; i < 4; i++) later(() => this.chirp({
          start: base,
          end: base * 0.94,
          duration: 0.045,
          gain: 0.008 + Math.random() * 0.008,
          type: 'triangle',
        }), i * (85 + Math.random() * 35))
      }
      every(cluster, 1200 + Math.random() * 600)
      later(cluster, 400)
    }

    if (id === 'fireplace') {
      parts.push(this.noiseLoop({ tint: 'brown', gain: 0.055, highpass: 45, lowpass: 950 }))
      parts.push(this.noiseLoop({ tint: 'pink', gain: 0.018, highpass: 500, lowpass: 3200 }))
      every(() => this.noiseBurst({
        duration: 0.025 + Math.random() * 0.075,
        gain: 0.015 + Math.random() * 0.055,
        highpass: 700 + Math.random() * 900,
        lowpass: 4200,
      }), 230)
    }

    if (id === 'dreamy') {
      const makePad = (frequency, detune, gain) => {
        const osc = this.ctx.createOscillator()
        const amp = this.ctx.createGain()
        const lfo = this.ctx.createOscillator()
        const depth = this.ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = frequency
        osc.detune.value = detune
        amp.gain.value = gain
        lfo.frequency.value = 0.05 + Math.random() * 0.05
        depth.gain.value = gain * 0.28
        lfo.connect(depth)
        depth.connect(amp.gain)
        osc.connect(amp)
        amp.connect(this.master)
        osc.start()
        lfo.start()
        return { stop: () => {
          try { osc.stop() } catch {}
          try { lfo.stop() } catch {}
          ;[osc, amp, lfo, depth].forEach(node => { try { node.disconnect() } catch {} })
        }}
      }
      parts.push(this.noiseLoop({ tint: 'pink', gain: 0.009, highpass: 600, lowpass: 4200 }))
      parts.push(makePad(110, -5, 0.022), makePad(164.81, 3, 0.017), makePad(220, -2, 0.014), makePad(329.63, 5, 0.009))
      every(() => this.chirp({
        start: [660, 783, 880][Math.floor(Math.random() * 3)],
        end: [880, 988, 1108][Math.floor(Math.random() * 3)],
        duration: 0.55 + Math.random() * 0.4,
        gain: 0.004 + Math.random() * 0.004,
      }), 5600 + Math.random() * 3000)
    }

    return () => {
      timers.forEach(timer => { clearTimeout(timer); clearInterval(timer) })
      parts.forEach(part => part?.stop?.())
    }
  }
}

const engine = new AmbientEngine()
let selectedForNewBook = 'off'
let readerBookId = ''

function addStyles() {
  if ($('#ambient-styles')) return
  const style = document.createElement('style')
  style.id = 'ambient-styles'
  style.textContent = `
    .ambient-create-label{min-width:190px}
    .ambient-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 16px;background:#201f1bea;border-top:1px solid #ffffff10;color:#fff}
    .ambient-left,.ambient-controls{display:flex;align-items:center;gap:12px}
    .ambient-copy strong{display:block;font-size:.76rem;letter-spacing:.13em;text-transform:uppercase;color:#d6ded6}
    .ambient-copy span{display:block;font-size:.8rem;color:#aaa79f;margin-top:2px}
    .ambient-toolbar select{min-width:190px;border:1px solid #4f4d47;background:#383631;color:#fff;border-radius:11px;padding:9px 10px;font:inherit}
    .ambient-toolbar button{background:#f4efe5;color:#222;border:0;border-radius:11px;padding:9px 12px;font-weight:800}
    .ambient-volume{display:flex;align-items:center;gap:8px;font-size:.78rem;color:#d5d1c8;font-weight:700}
    .ambient-volume input{width:120px;padding:0}
    @media(max-width:760px){
      .ambient-toolbar,.ambient-left,.ambient-controls{align-items:stretch;flex-direction:column}
      .ambient-toolbar select,.ambient-volume input{width:100%;min-width:0}
      .ambient-volume{width:100%}
    }
  `
  document.head.appendChild(style)
}

function optionMarkup(selected = 'off') {
  return AMBIENCE_OPTIONS.map(option => `<option value="${option.id}" ${option.id === selected ? 'selected' : ''}>${option.label}</option>`).join('')
}

function injectCreatorControl() {
  const row = $('.upload-panel .field-row')
  if (!row || $('.ambient-create-label', row)) return
  const label = document.createElement('label')
  label.className = 'ambient-create-label'
  label.innerHTML = `<span>Reader ambience</span><select aria-label="Default reader ambience">${optionMarkup(selectedForNewBook)}</select>`
  const select = $('select', label)
  select.addEventListener('change', () => { selectedForNewBook = select.value })
  row.appendChild(label)
}

async function loadBookSound(bookId) {
  try {
    const res = await window.__ambientOriginalFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
    if (!res.ok) return 'off'
    const data = await res.json()
    return data?.book?.soundscapeId || 'off'
  } catch {
    return 'off'
  }
}

async function injectReaderToolbar() {
  const reader = $('.reader')
  const top = $('.reader-top', reader || document)
  if (!reader || !top || $('.ambient-toolbar', reader)) return
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  const bookId = match ? decodeURIComponent(match[1]) : ''
  readerBookId = bookId
  const saved = bookId ? await loadBookSound(bookId) : 'off'
  if (!document.body.contains(reader) || readerBookId !== bookId) return

  const bar = document.createElement('div')
  bar.className = 'ambient-toolbar'
  bar.innerHTML = `
    <div class="ambient-left">
      <div class="ambient-copy"><strong>Reading ambience</strong><span>Calm background sound while you read.</span></div>
      <select aria-label="Reading ambience">${optionMarkup(saved)}</select>
    </div>
    <div class="ambient-controls">
      <button type="button">Play ambience</button>
      <label class="ambient-volume"><span>Volume</span><input type="range" min="0" max="1" value="0.32" step="0.01"></label>
    </div>
  `

  const select = $('select', bar)
  const button = $('button', bar)
  const volume = $('input[type="range"]', bar)
  let playing = false

  const stop = () => {
    engine.stop()
    playing = false
    button.textContent = 'Play ambience'
  }

  select.addEventListener('change', async () => {
    if (select.value === 'off') return stop()
    if (playing) {
      await engine.play(select.value)
      button.textContent = 'Pause ambience'
    }
  })

  button.addEventListener('click', async () => {
    if (playing) return stop()
    if (select.value === 'off') select.value = saved !== 'off' ? saved : 'rain'
    try {
      engine.setVolume(volume.value)
      await engine.play(select.value)
      playing = true
      button.textContent = 'Pause ambience'
    } catch {
      button.textContent = 'Audio unavailable'
    }
  })

  volume.addEventListener('input', () => engine.setVolume(volume.value))
  top.insertAdjacentElement('afterend', bar)
}

function patchFetch() {
  if (window.__ambientOriginalFetch) return
  window.__ambientOriginalFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || ''
      const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
      if (method === 'POST' && url.includes('/.netlify/functions/books') && typeof init?.body === 'string') {
        const body = JSON.parse(init.body)
        body.soundscapeId = selectedForNewBook
        init = { ...init, body: JSON.stringify(body) }
      }
    } catch {}
    return window.__ambientOriginalFetch(input, init)
  }
}

function syncUi() {
  addStyles()
  injectCreatorControl()
  injectReaderToolbar()
  if (!$('.reader') && engine.current !== 'off') engine.stop()
}

patchFetch()
addStyles()
const observer = new MutationObserver(syncUi)
observer.observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('popstate', () => setTimeout(syncUi, 0))
setInterval(syncUi, 1200)
syncUi()
