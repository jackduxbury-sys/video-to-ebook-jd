const AMBIENCE_OPTIONS = [
  { id: 'off', label: 'Off' },
  { id: 'happy', label: 'Jolly plucked strings' },
  { id: 'xylophone', label: 'Sunny xylophone' },
  { id: 'bells', label: 'Magic storybook bells' },
  { id: 'story', label: 'Gentle storytime' },
  { id: 'adventure', label: 'Little adventure' },
  { id: 'lullaby', label: 'Soft lullaby' },
]

const VALID_IDS = new Set(AMBIENCE_OPTIONS.map(option => option.id))
const LEGACY_MAP = {
  rain: 'happy',
  forest: 'story',
  ocean: 'xylophone',
  night: 'lullaby',
  fireplace: 'adventure',
  dreamy: 'bells',
}

const $ = (selector, root = document) => root.querySelector(selector)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

class MusicEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.cleanup = null
    this.current = 'off'
    this.volume = 0.26
  }

  async ensure() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) throw new Error('Background music is not supported in this browser.')
      this.ctx = new AudioContextClass()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  setVolume(value) {
    this.volume = clamp(Number(value) || 0, 0, 1)
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08)
    }
  }

  noteFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12)
  }

  playTone(note, when, duration, gain = 0.025, type = 'sine', bright = false) {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const amp = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()
    const frequency = this.noteFrequency(note)

    osc.type = type
    osc.frequency.setValueAtTime(frequency, when)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(bright ? 5200 : 2600, when)

    amp.gain.setValueAtTime(0.0001, when)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), when + 0.012)
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration)

    osc.connect(filter)
    filter.connect(amp)
    amp.connect(this.master)
    osc.start(when)
    osc.stop(when + duration + 0.04)
  }

  pluck(note, when, gain = 0.027, duration = 0.32) {
    this.playTone(note, when, duration, gain, 'triangle', true)
    this.playTone(note + 12, when + 0.004, duration * 0.55, gain * 0.22, 'sine', true)
  }

  bell(note, when, gain = 0.018, duration = 0.7) {
    this.playTone(note, when, duration, gain, 'sine', true)
    this.playTone(note + 12, when, duration * 0.7, gain * 0.34, 'sine', true)
    this.playTone(note + 19, when + 0.006, duration * 0.45, gain * 0.14, 'sine', true)
  }

  marimba(note, when, gain = 0.027, duration = 0.25) {
    this.playTone(note, when, duration, gain, 'sine', true)
    this.playTone(note + 12, when, duration * 0.45, gain * 0.18, 'triangle', true)
  }

  pad(notes, when, duration, gain = 0.009) {
    notes.forEach((note, index) => {
      this.playTone(note, when + index * 0.006, duration, gain, 'sine', false)
    })
  }

  stop() {
    if (this.cleanup) this.cleanup()
    this.cleanup = null
    this.current = 'off'
  }

  async play(id) {
    const safeId = LEGACY_MAP[id] || id
    if (safeId === 'off') return this.stop()
    await this.ensure()
    if (this.current === safeId) return
    this.stop()
    this.current = safeId
    this.cleanup = this.startTrack(safeId)
  }

  startTrack(id) {
    const timers = []
    let stopped = false
    const scheduleEvery = (fn, delay) => {
      const timer = setInterval(() => { if (!stopped) fn() }, delay)
      timers.push(timer)
    }

    const makePhraseScheduler = ({ bpm, bars = 4, phrase }) => {
      const beat = 60 / bpm
      const phraseSeconds = bars * 4 * beat
      let variation = 0
      const schedule = () => {
        if (stopped || !this.ctx) return
        const start = this.ctx.currentTime + 0.08
        phrase(start, beat, variation++)
      }
      schedule()
      scheduleEvery(schedule, phraseSeconds * 1000)
    }

    if (id === 'happy') {
      makePhraseScheduler({
        bpm: 92,
        bars: 4,
        phrase: (start, beat, variation) => {
          const chords = [
            [60, 64, 67],
            [65, 69, 72],
            [57, 60, 64],
            [67, 71, 74],
          ]
          const melodySets = [
            [72, 74, 76, 74, 72, 69, 67, 69],
            [72, 76, 79, 76, 74, 72, 69, 67],
          ]
          const melody = melodySets[variation % melodySets.length]
          chords.forEach((chord, bar) => {
            const barStart = start + bar * 4 * beat
            for (let i = 0; i < 4; i++) {
              const note = chord[i % chord.length] - 12
              this.pluck(note, barStart + i * beat, 0.017, beat * 0.62)
            }
            this.pad(chord, barStart, beat * 3.6, 0.0038)
          })
          melody.forEach((note, i) => {
            this.pluck(note, start + (i * 2 + 0.5) * beat, 0.012, beat * 0.5)
          })
        },
      })
    }

    if (id === 'xylophone') {
      makePhraseScheduler({
        bpm: 86,
        bars: 4,
        phrase: (start, beat, variation) => {
          const bass = [48, 53, 45, 55]
          const patterns = [
            [72, 76, 79, 76, 74, 77, 81, 77],
            [76, 79, 84, 79, 74, 77, 81, 79],
          ]
          const notes = patterns[variation % patterns.length]
          bass.forEach((note, bar) => {
            this.marimba(note, start + bar * 4 * beat, 0.013, beat * 0.5)
            this.marimba(note + 7, start + (bar * 4 + 2) * beat, 0.01, beat * 0.42)
          })
          notes.forEach((note, i) => {
            const offset = i * 2 * beat + (i % 2 ? 0.15 * beat : 0)
            this.marimba(note, start + offset, 0.018, beat * 0.42)
          })
        },
      })
    }

    if (id === 'bells') {
      makePhraseScheduler({
        bpm: 72,
        bars: 4,
        phrase: (start, beat, variation) => {
          const chords = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [55, 59, 62]]
          const melodies = [
            [79, 76, 72, 74, 76, 81, 79, 74],
            [76, 79, 84, 81, 79, 76, 74, 72],
          ]
          chords.forEach((chord, bar) => {
            this.pad(chord, start + bar * 4 * beat, beat * 3.8, 0.0045)
          })
          melodies[variation % 2].forEach((note, i) => {
            this.bell(note, start + i * 2 * beat, 0.011, beat * 0.9)
          })
        },
      })
    }

    if (id === 'story') {
      makePhraseScheduler({
        bpm: 76,
        bars: 4,
        phrase: (start, beat, variation) => {
          const chords = [[60, 64, 67], [62, 65, 69], [57, 60, 64], [55, 59, 62]]
          const melody = variation % 2
            ? [67, 69, 72, 69, 67, 64, 62, 64]
            : [64, 67, 69, 72, 69, 67, 64, 62]
          chords.forEach((chord, bar) => {
            const t = start + bar * 4 * beat
            this.pad(chord, t, beat * 3.9, 0.0048)
            this.pluck(chord[0] - 12, t, 0.009, beat * 0.6)
            this.pluck(chord[1] - 12, t + 2 * beat, 0.007, beat * 0.55)
          })
          melody.forEach((note, i) => {
            this.bell(note + 12, start + (i * 2 + 0.65) * beat, 0.006, beat * 0.6)
          })
        },
      })
    }

    if (id === 'adventure') {
      makePhraseScheduler({
        bpm: 98,
        bars: 4,
        phrase: (start, beat, variation) => {
          const roots = [48, 53, 57, 55]
          const motifs = [
            [72, 74, 76, 79, 76, 74, 72, 67],
            [72, 76, 79, 81, 79, 76, 74, 72],
          ]
          roots.forEach((root, bar) => {
            const barStart = start + bar * 4 * beat
            for (let i = 0; i < 8; i++) {
              const n = i % 2 === 0 ? root : root + 7
              this.pluck(n, barStart + i * beat * 0.5, 0.009, beat * 0.34)
            }
          })
          motifs[variation % 2].forEach((note, i) => {
            this.marimba(note, start + i * 2 * beat, 0.014, beat * 0.42)
          })
        },
      })
    }

    if (id === 'lullaby') {
      makePhraseScheduler({
        bpm: 62,
        bars: 4,
        phrase: (start, beat, variation) => {
          const chords = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [55, 59, 62]]
          const melodies = [
            [72, 76, 74, 72, 69, 72, 67, 69],
            [76, 74, 72, 69, 72, 74, 72, 67],
          ]
          chords.forEach((chord, bar) => {
            this.pad(chord, start + bar * 4 * beat, beat * 3.95, 0.0055)
          })
          melodies[variation % 2].forEach((note, i) => {
            this.bell(note, start + i * 2 * beat + 0.4 * beat, 0.007, beat * 1.15)
          })
        },
      })
    }

    return () => {
      stopped = true
      timers.forEach(timer => clearInterval(timer))
    }
  }
}

const engine = new MusicEngine()
let selectedForNewBook = 'off'
let readerBookId = ''

function normalizeSoundId(id) {
  const mapped = LEGACY_MAP[id] || id
  return VALID_IDS.has(mapped) ? mapped : 'off'
}

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
    .ambient-toolbar select{min-width:210px;border:1px solid #4f4d47;background:#383631;color:#fff;border-radius:11px;padding:9px 10px;font:inherit}
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
  const safeSelected = normalizeSoundId(selected)
  return AMBIENCE_OPTIONS.map(option => `<option value="${option.id}" ${option.id === safeSelected ? 'selected' : ''}>${option.label}</option>`).join('')
}

function injectCreatorControl() {
  const row = $('.upload-panel .field-row')
  if (!row || $('.ambient-create-label', row)) return
  const label = document.createElement('label')
  label.className = 'ambient-create-label'
  label.innerHTML = `<span>Reader music</span><select aria-label="Default reader music">${optionMarkup(selectedForNewBook)}</select>`
  const select = $('select', label)
  select.addEventListener('change', () => { selectedForNewBook = select.value })
  row.appendChild(label)
}

async function loadBookSound(bookId) {
  try {
    const res = await window.__ambientOriginalFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
    if (!res.ok) return 'off'
    const data = await res.json()
    return normalizeSoundId(data?.book?.soundscapeId || 'off')
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
      <div class="ambient-copy"><strong>Background music</strong><span>Light storybook music while you read.</span></div>
      <select aria-label="Background music">${optionMarkup(saved)}</select>
    </div>
    <div class="ambient-controls">
      <button type="button">Play music</button>
      <label class="ambient-volume"><span>Volume</span><input type="range" min="0" max="1" value="0.26" step="0.01"></label>
    </div>
  `

  const select = $('select', bar)
  const button = $('button', bar)
  const volume = $('input[type="range"]', bar)
  let playing = false

  const stop = () => {
    engine.stop()
    playing = false
    button.textContent = 'Play music'
  }

  select.addEventListener('change', async () => {
    if (select.value === 'off') return stop()
    if (playing) {
      await engine.play(select.value)
      button.textContent = 'Pause music'
    }
  })

  button.addEventListener('click', async () => {
    if (playing) return stop()
    if (select.value === 'off') select.value = saved !== 'off' ? saved : 'happy'
    try {
      engine.setVolume(volume.value)
      await engine.play(select.value)
      playing = true
      button.textContent = 'Pause music'
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