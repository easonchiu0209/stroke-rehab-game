// 鏡頭校正：記錄使用者「中立點」相對畫面中央的偏移（原始相機座標 0–1）。
// 偏移套用在偵測引擎讀到 landmark 的第一時間（鏡像/繪圖之前），
// 因此命中判定、游標、繪製都會自動一致。

const KEY = 'lmxr_calib'

export interface Calib { dx: number; dy: number }

export function getCalib(): Calib {
  if (typeof window === 'undefined') return { dx: 0, dy: 0 }
  try {
    const s = localStorage.getItem(KEY)
    if (s) { const o = JSON.parse(s); return { dx: Number(o.dx) || 0, dy: Number(o.dy) || 0 } }
  } catch { /* ignore */ }
  return { dx: 0, dy: 0 }
}

export function setCalib(dx: number, dy: number) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY, JSON.stringify({ dx, dy })) } catch { /* ignore */ }
}

export function clearCalib() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export function hasCalib(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(KEY) != null
}

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v

/** 套用校正到原始相機座標 (wrist.x/.y 或 index tip)。回傳校正後 x,y。 */
export function applyCalib(x: number, y: number, c: Calib): [number, number] {
  return [clamp01(x + c.dx), clamp01(y + c.dy)]
}
