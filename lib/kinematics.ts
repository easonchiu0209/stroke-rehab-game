// 從手部軌跡 [[t_ms, nx, ny], ...] 算出復健常用的運動學特徵。
// 這些既能在治療師後台呈現「動作品質」，也是未來訓練 ML 模型的輸入特徵。

export interface Kinematics {
  samples:         number
  durationS:       number
  pathLength:      number   // 總移動距離（normalized 單位）
  pathEfficiency:  number   // 0–1，起點→終點直線 / 實際路徑（越高越直接）
  meanSpeed:       number   // 平均速度（單位/秒）
  peakSpeed:       number   // 最高速度
  numSubmovements: number   // 速度峰值數（越少＝動作越連貫流暢）
  jerkIndex:       number   // 抖動指數（相對值，越低＝越平滑）
  romX:            number   // 水平活動範圍 0–1
  romY:            number   // 垂直活動範圍 0–1
}

function movingAvg(a: number[], w: number): number[] {
  if (a.length <= w) return a.slice()
  const out: number[] = []
  for (let i = 0; i < a.length; i++) {
    let s = 0, c = 0
    for (let k = Math.max(0, i - w); k <= Math.min(a.length - 1, i + w); k++) { s += a[k]; c++ }
    out.push(s / c)
  }
  return out
}

export function computeKinematics(traj?: number[][] | null): Kinematics | null {
  if (!traj || traj.length < 5) return null
  const pts = traj
    .filter(p => Array.isArray(p) && p.length >= 3)
    .map(p => ({ t: p[0] / 1000, x: p[1], y: p[2] }))
    .sort((a, b) => a.t - b.t)
  if (pts.length < 5) return null

  let pathLength = 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const speeds: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    const dt = Math.max(1e-3, pts[i].t - pts[i - 1].t)
    const d = Math.hypot(dx, dy)
    pathLength += d
    speeds.push(d / dt)
  }
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }

  const durationS = pts[pts.length - 1].t - pts[0].t
  const straight = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y)
  const meanSpeed = speeds.reduce((s, v) => s + v, 0) / Math.max(1, speeds.length)
  const peakSpeed = Math.max(0, ...speeds)
  const pathEfficiency = pathLength > 0 ? Math.min(1, straight / pathLength) : 0

  // 流暢度：平滑後的速度曲線局部峰值數（submovements）
  const sm = movingAvg(speeds, 2)
  let numSubmovements = 0
  const thr = 0.2 * peakSpeed
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] > sm[i - 1] && sm[i] >= sm[i + 1] && sm[i] > thr) numSubmovements++
  }

  // 抖動指數：平滑速度的二階差分 RMS，以平均速度正規化
  let js = 0, cnt = 0
  for (let i = 2; i < sm.length; i++) {
    const j = sm[i] - 2 * sm[i - 1] + sm[i - 2]
    js += j * j; cnt++
  }
  const jerkIndex = cnt > 0 ? Math.sqrt(js / cnt) / (meanSpeed || 1) : 0

  return {
    samples: pts.length, durationS: Math.round(durationS * 10) / 10,
    pathLength: Math.round(pathLength * 100) / 100,
    pathEfficiency: Math.round(pathEfficiency * 100) / 100,
    meanSpeed: Math.round(meanSpeed * 100) / 100,
    peakSpeed: Math.round(peakSpeed * 100) / 100,
    numSubmovements,
    jerkIndex: Math.round(jerkIndex * 100) / 100,
    romX: Math.round((maxX - minX) * 100) / 100,
    romY: Math.round((maxY - minY) * 100) / 100,
  }
}

/** 多場平均（給後台顯示趨勢/摘要） */
export function averageKinematics(list: Kinematics[]): Kinematics | null {
  if (!list.length) return null
  const k = list.length
  const sum = (f: (x: Kinematics) => number) => list.reduce((s, x) => s + f(x), 0)
  return {
    samples: Math.round(sum(x => x.samples) / k),
    durationS: Math.round(sum(x => x.durationS) / k * 10) / 10,
    pathLength: Math.round(sum(x => x.pathLength) / k * 100) / 100,
    pathEfficiency: Math.round(sum(x => x.pathEfficiency) / k * 100) / 100,
    meanSpeed: Math.round(sum(x => x.meanSpeed) / k * 100) / 100,
    peakSpeed: Math.round(sum(x => x.peakSpeed) / k * 100) / 100,
    numSubmovements: Math.round(sum(x => x.numSubmovements) / k),
    jerkIndex: Math.round(sum(x => x.jerkIndex) / k * 100) / 100,
    romX: Math.round(sum(x => x.romX) / k * 100) / 100,
    romY: Math.round(sum(x => x.romY) / k * 100) / 100,
  }
}
