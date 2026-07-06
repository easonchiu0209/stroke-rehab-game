'use client'

// 場中心流控制器 + AI 建議難度取得。
//
// useFlowDda：遊戲在每次命中/漏接時回報，控制器以「最近 10 次嘗試的命中率」
// 調整難度係數 factor（0.72–1.30，>1 = 更難）。遊戲在生成目標時套用：
//   打地鼠：displayMs / factor（存在越短越難）
//   切切樂：速度 × factor
// 命中率 > 85% 慢慢變難、< 60% 快速變簡單（挫折要快救，成就感慢慢加）。
//
// useDdaRecommendation：讀 /api/dda 的場末升降級建議，用於開場預選難度。

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Difficulty } from '@/lib/dda'

const WINDOW = 10          // 滾動窗口：最近 N 次嘗試
const MIN_SAMPLES = 4      // 至少 N 次才開始調整
const FACTOR_MIN = 0.72
const FACTOR_MAX = 1.30
const STEP_UP = 0.05       // 變難步幅（慢）
const STEP_DOWN = 0.09     // 變簡單步幅（快）

export function useFlowDda(active: boolean) {
  const eventsRef = useRef<boolean[]>([])   // true = hit
  const factorRef = useRef(1)

  useEffect(() => {
    if (active) { eventsRef.current = []; factorRef.current = 1 }
  }, [active])

  const evaluate = useCallback(() => {
    const ev = eventsRef.current
    if (ev.length < MIN_SAMPLES) return
    const recent = ev.slice(-WINDOW)
    const rate = recent.filter(Boolean).length / recent.length
    if (rate > 0.85)      factorRef.current = Math.min(FACTOR_MAX, factorRef.current + STEP_UP)
    else if (rate < 0.6)  factorRef.current = Math.max(FACTOR_MIN, factorRef.current - STEP_DOWN)
  }, [])

  const reportHit  = useCallback(() => { eventsRef.current.push(true);  evaluate() }, [evaluate])
  const reportMiss = useCallback(() => { eventsRef.current.push(false); evaluate() }, [evaluate])
  const getFactor  = useCallback(() => factorRef.current, [])

  return { reportHit, reportMiss, getFactor }
}

/** 讀取 AI 建議的開場難度（無資料或未登入回 null，頁面保持原預設） */
export function useDdaRecommendation(gameType: string) {
  const [recommended, setRecommended] = useState<Difficulty | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/dda?game_type=${encodeURIComponent(gameType)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!cancelled && d?.difficulty) setRecommended(d.difficulty as Difficulty)
      })
      .catch(() => { /* 未登入/離線：沿用預設 */ })
    return () => { cancelled = true }
  }, [gameType])

  return { recommended }
}
