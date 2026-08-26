// Gives the generated reader audio more useful headroom without making
// the quiet end of the volume slider jump too aggressively.
//
// The music and nature engines each route their final master GainNode
// directly to the AudioContext destination. We mark that final gain node
// when it connects, then reshape only its setTargetAtTime volume changes.

(() => {
  if (window.__ebookVolumeBoostInstalled) return
  window.__ebookVolumeBoostInstalled = true

  const AudioNodeClass = window.AudioNode
  const AudioParamClass = window.AudioParam
  const GainNodeClass = window.GainNode
  if (!AudioNodeClass || !AudioParamClass || !GainNodeClass) return

  const originalConnect = AudioNodeClass.prototype.connect
  const originalSetTargetAtTime = AudioParamClass.prototype.setTargetAtTime

  // Keep low values restrained, but progressively add headroom near the top.
  // 0.25 -> ~0.275, 0.50 -> 0.70, 0.75 -> ~1.43, 1.00 -> 2.60.
  const louderCurve = value => {
    const v = Math.max(0, Math.min(1, Number(value) || 0))
    return v * (1 + 1.6 * v * v)
  }

  AudioNodeClass.prototype.connect = function(destination, ...rest) {
    try {
      if (this instanceof GainNodeClass && this.context && destination === this.context.destination) {
        this.gain.__ebookReaderMasterVolume = true
      }
    } catch {}
    return originalConnect.call(this, destination, ...rest)
  }

  AudioParamClass.prototype.setTargetAtTime = function(target, startTime, timeConstant) {
    if (this.__ebookReaderMasterVolume) {
      return originalSetTargetAtTime.call(this, louderCurve(target), startTime, timeConstant)
    }
    return originalSetTargetAtTime.call(this, target, startTime, timeConstant)
  }
})()
