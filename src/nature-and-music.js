const NATURE_OPTIONS = [
  { id: 'nature-rain', legacy: 'rain', label: 'Gentle rain' },
  { id: 'nature-forest', legacy: 'forest', label: 'Forest' },
  { id: 'nature-ocean', legacy: 'ocean', label: 'Ocean waves' },
  { id: 'nature-night', legacy: 'night', label: 'Night crickets' },
  { id: 'nature-fireplace', legacy: 'fireplace', label: 'Cosy fireplace' },
  { id: 'nature-dreamy', legacy: 'dreamy', label: 'Soft dreamy ambience' },
]

const MUSIC_OPTIONS = [
  { id: 'happy', label: 'Jolly plucked strings' },
  { id: 'xylophone', label: 'Sunny xylophone' },
  { id: 'bells', label: 'Magic storybook bells' },
  { id: 'story', label: 'Gentle storytime' },
  { id: 'adventure', label: 'Little adventure' },
  { id: 'lullaby', label: 'Soft lullaby' },
]

const natureIdFromSaved = value => {
  const direct = NATURE_OPTIONS.find(option => option.id === value)
  if (direct) return direct.id
  const legacy = NATURE_OPTIONS.find(option => option.legacy === value)
  return legacy?.id || null
}

class NatureEngine {
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
      if (!AudioContextClass) throw new Error('Nature audio is not supported in this browser.')
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

  noiseBuffer(seconds = 18, tint = 'white') {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds))
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

  loop({ tint = 'white', gain = 0.08, highpass, lowpass } = {}) {
    const source = this.ctx.createBufferSource()
    source.buffer = this.noiseBuffer(20 + Math.random() * 9, tint)
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
    source.start(0, Math.random() * 7)
    nodes.push(amp)

    return {
      gain: amp.gain,
      stop: () => {
        try { source.stop() } catch {}
        nodes.forEach(node => { try { node.disconnect() } catch {} })
      },
    }
  }

  burst({ duration = 0.08, gain = 0.025, highpass = 1200, lowpass = 7000 } = {}) {
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
    if (!id?.startsWith('nature-')) return this.stop()
    await this.ensure()
    if (this.current === id) return
    this.stop()
    this.current = id
    this.cleanup = this.start(id)
  }

  start(id) {
    const timers = []
    const parts = []
    let stopped = false
    const later = (fn, delay) => timers.push(setTimeout(() => { if (!stopped) fn() }, delay))
    const every = (fn, delay) => timers.push(setInterval(() => { if (!stopped) fn() }, delay))

    if (id === 'nature-rain') {
      parts.push(this.loop({ tint: 'pink', gain: 0.14, highpass: 650, lowpass: 7200 }))
      parts.push(this.loop({ tint: 'brown', gain: 0.045, highpass: 70, lowpass: 1000 }))
      every(() => this.burst({ duration: 0.07 + Math.random() * 0.14, gain: 0.012 + Math.random() * 0.025, highpass: 1800, lowpass: 9000 }), 190)
    }

    if (id === 'nature-forest') {
      parts.push(this.loop({ tint: 'pink', gain: 0.045, highpass: 160, lowpass: 2600 }))
      const birds = () => {
        this.chirp({ start: 1300 + Math.random() * 1000, end: 2200 + Math.random() * 1200, duration: 0.12 + Math.random() * 0.18, gain: 0.012 + Math.random() * 0.02 })
        if (Math.random() > 0.45) later(() => this.chirp({ start: 1600 + Math.random() * 900, end: 2500 + Math.random() * 900, duration: 0.1 + Math.random() * 0.15, gain: 0.01 + Math.random() * 0.017 }), 150)
      }
      every(birds, 3100)
      later(birds, 700)
    }

    if (id === 'nature-ocean') {
      const surf = this.loop({ tint: 'brown', gain: 0.09, highpass: 45, lowpass: 1500 })
      const foam = this.loop({ tint: 'pink', gain: 0.018, highpass: 900, lowpass: 6000 })
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

    if (id === 'nature-night') {
      parts.push(this.loop({ tint: 'brown', gain: 0.026, highpass: 90, lowpass: 1200 }))
      const cluster = () => {
        const base = 3150 + Math.random() * 900
        for (let i = 0; i < 4; i++) later(() => this.chirp({ start: base, end: base * 0.94, duration: 0.045, gain: 0.008 + Math.random() * 0.008, type: 'triangle' }), i * 100)
      }
      every(cluster, 1500)
      later(cluster, 400)
    }

    if (id === 'nature-fireplace') {
      parts.push(this.loop({ tint: 'brown', gain: 0.055, highpass: 45, lowpass: 950 }))
      parts.push(this.loop({ tint: 'pink', gain: 0.018, highpass: 500, lowpass: 3200 }))
      every(() => this.burst({ duration: 0.025 + Math.random() * 0.075, gain: 0.015 + Math.random() * 0.055, highpass: 700 + Math.random() * 900, lowpass: 4200 }), 230)
    }

    if (id === 'nature-dreamy') {
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
        return { stop: () => { try { osc.stop() } catch {}; try { lfo.stop() } catch {}; [osc, amp, lfo, depth].forEach(node => { try { node.disconnect() } catch {} }) } }
      }
      parts.push(this.loop({ tint: 'pink', gain: 0.009, highpass: 600, lowpass: 4200 }))
      parts.push(makePad(110, -5, 0.022), makePad(164.81, 3, 0.017), makePad(220, -2, 0.014), makePad(329.63, 5, 0.009))
      every(() => this.chirp({ start: [660, 783, 880][Math.floor(Math.random() * 3)], end: [880, 988, 1108][Math.floor(Math.random() * 3)], duration: 0.55 + Math.random() * 0.4, gain: 0.004 + Math.random() * 0.004 }), 6500)
    }

    return () => {
      stopped = true
      timers.forEach(timer => { clearTimeout(timer); clearInterval(timer) })
      parts.forEach(part => part?.stop?.())
    }
  }
}

const natureEngine = new NatureEngine()

function rebuildSelect(select, selected) {
  if (!select || select.dataset.bothSoundSets === '1') return
  const safeSelected = selected || select.value || 'off'
  select.innerHTML = ''

  const off = document.createElement('option')
  off.value = 'off'
  off.textContent = 'Off'
  select.appendChild(off)

  const natureGroup = document.createElement('optgroup')
  natureGroup.label = 'Nature ambience'
  NATURE_OPTIONS.forEach(option => {
    const el = document.createElement('option')
    el.value = option.id
    el.textContent = option.label
    natureGroup.appendChild(el)
  })
  select.appendChild(natureGroup)

  const musicGroup = document.createElement('optgroup')
  musicGroup.label = 'Jolly storybook music'
  MUSIC_OPTIONS.forEach(option => {
    const el = document.createElement('option')
    el.value = option.id
    el.textContent = option.label
    musicGroup.appendChild(el)
  })
  select.appendChild(musicGroup)

  const natureSaved = natureIdFromSaved(safeSelected)
  const validMusic = MUSIC_OPTIONS.some(option => option.id === safeSelected)
  select.value = natureSaved || (validMusic ? safeSelected : 'off')
  select.dataset.bothSoundSets = '1'
}

async function rawSavedSound() {
  const match = location.pathname.match(/^\/book\/([^/]+)/)
  const bookId = match ? decodeURIComponent(match[1]) : ''
  if (!bookId || !window.__ambientOriginalFetch) return 'off'
  try {
    const response = await window.__ambientOriginalFetch(`/.netlify/functions/books?id=${encodeURIComponent(bookId)}`)
    if (!response.ok) return 'off'
    const data = await response.json()
    return data?.book?.soundscapeId || 'off'
  } catch {
    return 'off'
  }
}

function patchCreator() {
  const label = document.querySelector('.ambient-create-label')
  const select = label?.querySelector('select')
  if (!label || !select) return
  const span = label.querySelector('span')
  if (span) span.textContent = 'Reader sound'
  rebuildSelect(select, select.value)
}

async function patchReader() {
  const bar = document.querySelector('.ambient-toolbar')
  if (!bar || bar.dataset.bothSoundSets === '1') return
  const select = bar.querySelector('select')
  const button = bar.querySelector('button')
  const volume = bar.querySelector('input[type="range"]')
  const title = bar.querySelector('.ambient-copy strong')
  const note = bar.querySelector('.ambient-copy span')
  if (!select || !button) return

  const saved = await rawSavedSound()
  if (!document.body.contains(bar)) return
  rebuildSelect(select, saved)
  if (title) title.textContent = 'Background sound'
  if (note) note.textContent = 'Nature ambience or jolly storybook music while you read.'
  button.textContent = 'Play sound'
  bar.dataset.bothSoundSets = '1'

  const syncNature = async () => {
    const isNature = select.value.startsWith('nature-')
    if (!isNature) {
      natureEngine.stop()
      return
    }
    natureEngine.setVolume(volume?.value ?? 0.26)
    const pausing = button.textContent.toLowerCase().startsWith('play')
    if (pausing) natureEngine.stop()
    else await natureEngine.play(select.value)
  }

  select.addEventListener('change', () => setTimeout(async () => {
    if (!select.value.startsWith('nature-')) natureEngine.stop()
    else if (button.textContent.toLowerCase().startsWith('pause')) await syncNature()
    button.textContent = button.textContent.toLowerCase().startsWith('pause') ? 'Pause sound' : 'Play sound'
  }, 0))

  button.addEventListener('click', () => setTimeout(async () => {
    if (select.value.startsWith('nature-')) await syncNature()
    else natureEngine.stop()
    button.textContent = button.textContent.toLowerCase().startsWith('pause') ? 'Pause sound' : 'Play sound'
  }, 0))

  volume?.addEventListener('input', () => natureEngine.setVolume(volume.value))
}

function syncBothSets() {
  patchCreator()
  patchReader()
  if (!document.querySelector('.reader')) natureEngine.stop()
}

const observer = new MutationObserver(syncBothSets)
observer.observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('popstate', () => setTimeout(syncBothSets, 0))
setInterval(syncBothSets, 1200)
syncBothSets()
