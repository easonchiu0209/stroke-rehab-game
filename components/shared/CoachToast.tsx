'use client'

// 場末 AI 教練泡泡：掛在 root layout，監聽 lib/saveSession 廣播的 'lmx:coach'，
// 任何遊戲結算都會顯示個人化鼓勵並語音朗讀（走 lib/feedback 的語音開關）。

import { useEffect, useState } from 'react'
import { speak } from '@/lib/feedback'

interface Coach { text: string; generated_by: 'llm' | 'rules' }

export default function CoachToast() {
  const [coach, setCoach] = useState<Coach | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onCoach = (e: Event) => {
      const d = (e as CustomEvent<Coach>).detail
      if (!d?.text) return
      setCoach(d)
      try { speak(d.text) } catch { /* 無語音支援時只顯示 */ }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setCoach(null), 8000)
    }
    window.addEventListener('lmx:coach', onCoach)
    return () => {
      window.removeEventListener('lmx:coach', onCoach)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!coach) return null

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[90] pointer-events-none px-4 w-full max-w-md">
      <div
        className="flex items-start gap-3 rounded-2xl bg-white/97 border-2 border-sky-200 shadow-xl px-4 py-3"
        style={{ animation: 'juicePopIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <span className="text-3xl shrink-0">🤗</span>
        <div className="min-w-0">
          <p className="text-slate-800 font-bold leading-relaxed">{coach.text}</p>
          <p className="text-[10px] text-slate-300 mt-0.5">{coach.generated_by === 'llm' ? 'AI 教練' : '教練'}</p>
        </div>
      </div>
    </div>
  )
}
