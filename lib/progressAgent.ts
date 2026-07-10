// AI 進步追蹤 agent（AI 指引 L2：個人化基準、平原期偵測、異常退步偵測）
// 每週自動掃描所有活躍個案：近 28 天切前後兩半比較各維度平均 →
// 進步/持平/退步 + 旗標（平原期→建議換策略；異常退步→標紅通知治療師）。
// 設計原則（AI 指引 §6）：可解釋（附前後兩週數字當依據）、AI 只建議不決策。

import { supabaseAdmin } from '@/lib/supabase'

export type Dimension = 'accuracy' | 'reaction' | 'rom_y' | 'smoothness'
export type Trend = 'improving' | 'flat' | 'declining' | 'insufficient'

export interface Insight {
  dimension: Dimension
  trend: Trend
  delta: number | null
  flag: 'plateau' | 'decline_alert' | null
  detail: { half1: number | null; half2: number | null; activeDays: number }
}

const WINDOW_DAYS = 28

// 各維度判定：better = 值越大越好或越小越好；threshold = 有意義的變化量
const DIMS: Record<Dimension, { better: 'up' | 'down'; threshold: number }> = {
  accuracy:   { better: 'up',   threshold: 5 },      // 百分點
  reaction:   { better: 'down', threshold: 100 },    // ms
  rom_y:      { better: 'up',   threshold: 0.05 },   // normalized
  smoothness: { better: 'down', threshold: 0.15 },   // jerk_index
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)
const round2 = (x: number) => Math.round(x * 100) / 100

function classify(dim: Dimension, half1: number | null, half2: number | null): { trend: Trend; delta: number | null } {
  if (half1 == null || half2 == null) return { trend: 'insufficient', delta: null }
  const { better, threshold } = DIMS[dim]
  const delta = round2(half2 - half1)
  const improved = better === 'up' ? delta > threshold : delta < -threshold
  const declined = better === 'up' ? delta < -threshold : delta > threshold
  return { trend: improved ? 'improving' : declined ? 'declining' : 'flat', delta }
}

/** 分析單一個案（回傳四維度洞察；資料不足回 insufficient） */
export async function analyzeUser(userId: string, now = new Date()): Promise<Insight[]> {
  const from = new Date(now.getTime() - WINDOW_DAYS * 86400_000)
  const mid = new Date(now.getTime() - (WINDOW_DAYS / 2) * 86400_000)

  const [{ data: sessions }, { data: metrics }] = await Promise.all([
    supabaseAdmin.from('game_sessions')
      .select('created_at, accuracy, avg_reaction_ms')
      .eq('user_id', userId).gte('created_at', from.toISOString()),
    supabaseAdmin.from('quality_metrics')
      .select('created_at, rom_y, jerk_index')
      .eq('user_id', userId).gte('created_at', from.toISOString()),
  ])

  const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
  const activeDays = new Set((sessions ?? []).map(s => dayOf(s.created_at))).size

  function halves<T extends { created_at: string }>(rows: T[], pick: (r: T) => number | null) {
    const h1: number[] = [], h2: number[] = []
    for (const r of rows) {
      const v = pick(r)
      if (v == null) continue
      ;(new Date(r.created_at) < mid ? h1 : h2).push(v)
    }
    // 每半至少 3 筆才有統計意義
    return { half1: h1.length >= 3 ? round2(avg(h1)!) : null, half2: h2.length >= 3 ? round2(avg(h2)!) : null }
  }

  const src: Record<Dimension, { half1: number | null; half2: number | null }> = {
    accuracy:   halves(sessions ?? [], r => r.accuracy),
    reaction:   halves(sessions ?? [], r => r.avg_reaction_ms),
    rom_y:      halves(metrics ?? [], r => r.rom_y),
    smoothness: halves(metrics ?? [], r => r.jerk_index),
  }

  const insights: Insight[] = (Object.keys(DIMS) as Dimension[]).map(dim => {
    const { half1, half2 } = src[dim]
    const { trend, delta } = classify(dim, half1, half2)
    return { dimension: dim, trend, delta, flag: null, detail: { half1, half2, activeDays } }
  })

  // 平原期：練得夠勤（≥8 天）但所有可評維度都持平 → 建議治療師換訓練策略
  const evaluable = insights.filter(i => i.trend !== 'insufficient')
  if (activeDays >= 8 && evaluable.length >= 2 && evaluable.every(i => i.trend === 'flat')) {
    for (const i of evaluable) i.flag = 'plateau'
  }

  // 異常退步：近 3 個活躍日的命中率 < 前期平均的 70% → 標紅（可能生病/疼痛/狀態變化）
  const acc = (sessions ?? []).filter(s => s.accuracy != null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (acc.length >= 6) {
    const recentDays = Array.from(new Set(acc.map(s => dayOf(s.created_at)))).slice(-3)
    const recent = acc.filter(s => recentDays.includes(dayOf(s.created_at))).map(s => s.accuracy as number)
    const prior = acc.filter(s => !recentDays.includes(dayOf(s.created_at))).map(s => s.accuracy as number)
    const r = avg(recent), p = avg(prior)
    if (r != null && p != null && p > 0 && r < p * 0.7) {
      const a = insights.find(i => i.dimension === 'accuracy')
      if (a) a.flag = 'decline_alert'
    }
  }

  return insights
}

/** 全量掃描（cron 每週一執行）：活躍個案分析並落庫 */
export async function runProgressScan(now = new Date()) {
  const from = new Date(now.getTime() - WINDOW_DAYS * 86400_000)
  const { data: active } = await supabaseAdmin
    .from('game_sessions').select('user_id').gte('created_at', from.toISOString())
  const userIds = Array.from(new Set((active ?? []).map(r => r.user_id as string)))
  const computedAt = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)

  let scanned = 0, flagged = 0
  for (const userId of userIds) {
    try {
      const insights = await analyzeUser(userId, now)
      const rows = insights.map(i => ({
        user_id: userId, computed_at: computedAt,
        dimension: i.dimension, trend: i.trend, delta: i.delta, flag: i.flag, detail: i.detail,
      }))
      const { error } = await supabaseAdmin.from('progress_insights')
        .upsert(rows, { onConflict: 'user_id,computed_at,dimension' })
      if (error) { console.error('progress upsert failed:', error); continue }
      scanned++
      if (insights.some(i => i.flag)) flagged++
    } catch (e) { console.error('analyzeUser failed:', userId, e) }
  }
  return { computed_at: computedAt, users: userIds.length, scanned, flagged }
}
