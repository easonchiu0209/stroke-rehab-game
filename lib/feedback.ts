// 全平台共用的即時回饋：聲音（Web Audio，免音檔）＋ 震動 ＋ 語音鼓勵（TTS）。
// 可由設定開關（localStorage）。所有遊戲都可呼叫。

const KEY_SOUND = 'lmxr_sound'
const KEY_VOICE = 'lmxr_voice'
const KEY_HAPTIC = 'lmxr_haptic'

function on(key: string): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(key) !== 'off'   // 預設開
}
export const fbSettings = {
  sound:  () => on(KEY_SOUND),
  voice:  () => on(KEY_VOICE),
  haptic: () => on(KEY_HAPTIC),
  set: (k: 'sound' | 'voice' | 'haptic', v: boolean) => {
    if (typeof window === 'undefined') return
    localStorage.setItem(k === 'sound' ? KEY_SOUND : k === 'voice' ? KEY_VOICE : KEY_HAPTIC, v ? 'on' : 'off')
  },
}

let _ctx: AudioContext | null = null
function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!_ctx) _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (_ctx.state === 'suspended') _ctx.resume()
    return _ctx
  } catch { return null }
}

function tone(freq: number, durMs: number, type: OscillatorType = 'sine', gain = 0.15) {
  if (!fbSettings.sound()) return
  const c = ctx(); if (!c) return
  const osc = c.createOscillator(), g = c.createGain()
  osc.type = type; osc.frequency.value = freq
  g.gain.setValueAtTime(gain, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000)
  osc.connect(g); g.connect(c.destination)
  osc.start(); osc.stop(c.currentTime + durMs / 1000)
}

function buzz(ms: number | number[]) {
  if (!fbSettings.haptic()) return
  try { navigator.vibrate?.(ms) } catch { /* ignore */ }
}

// ── 對外 ─────────────────────────────────────────────
export function feedbackHit() {
  tone(880, 110, 'triangle'); setTimeout(() => tone(1320, 90, 'triangle'), 70)  // 清脆上行雙音
  buzz(35)
}
export function feedbackMiss() {
  tone(200, 180, 'sawtooth', 0.1)
  buzz([0])  // 不震，避免負向觸覺；保留 API
}
export function feedbackCombo(n: number) {
  tone(660, 80, 'square'); setTimeout(() => tone(990, 80, 'square'), 60); setTimeout(() => tone(1320, 120, 'square'), 120)
  buzz([30, 40, 30])
  if (n % 5 === 0) speak('太棒了，連續命中！')
}

let _voices: SpeechSynthesisVoice[] = []
export function speak(text: string) {
  if (!fbSettings.voice() || typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    if (!_voices.length) _voices = window.speechSynthesis.getVoices()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-TW'
    const zh = _voices.find(v => v.lang?.startsWith('zh'))
    if (zh) u.voice = zh
    u.rate = 1; u.pitch = 1.05
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch { /* ignore */ }
}
