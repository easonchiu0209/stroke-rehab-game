'use client'

// 佈景主題 hook：農場/水族箱 hub 共用。讀取啟用主題、提供 🎨 循環切換。

import { useCallback, useEffect, useState } from 'react'
import { THEMES } from '@/lib/themes'

export function useHubTheme(scope: 'farm' | 'aquarium') {
  const [active, setActive] = useState('default')
  const [owned, setOwned] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/theme')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.active && THEMES[d.active]) setActive(d.active)
        if (Array.isArray(d?.owned)) setOwned(d.owned.filter((t: string) => THEMES[t]))
      })
      .catch(() => { /* 未登入/欄位未建：用預設 */ })
  }, [])

  const cycle = useCallback(async () => {
    const order = ['default', ...owned]
    const next = order[(order.indexOf(active) + 1) % order.length]
    setActive(next)   // 樂觀更新
    try { await fetch('/api/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: next }) }) } catch { /* ignore */ }
  }, [active, owned])

  const theme = THEMES[active] ?? THEMES.default
  return {
    background: theme[scope],
    themeEmoji: theme.emoji,
    canSwitch: owned.length > 0,
    cycle,
  }
}
