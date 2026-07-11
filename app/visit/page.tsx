'use client'

// 串門子：看鄰居列表 → 參觀農場 → 偷成熟的菜 😏
// 保護欄在後端（每田 1 次/每日 3 次/主人保底 70%），這裡只做溫暖的呈現。

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { SPECIES, isRipe, type Plot, type Species } from '@/lib/farm'

interface Neighbor { id: string; name: string; picture_url: string | null; farm_level: number }
interface VisitData {
  owner: { name: string; picture_url: string | null }
  plots: Plot[]
  aquarium: { fish: { emoji: string; name: string; stage: number }[]; treasures: number } | null
  stealsLeft: number
  pickupsLeft: number
}

export default function VisitPage() {
  const router = useRouter()
  const { status } = useSession()
  const [neighbors, setNeighbors] = useState<Neighbor[] | null>(null)
  const [stealsLeft, setStealsLeft] = useState(0)
  const [target, setTarget] = useState<Neighbor | null>(null)
  const [visit, setVisit] = useState<VisitData | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (status === 'unauthenticated') signIn('line') }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/visit').then(r => r.json()).then(d => {
      setNeighbors(d.neighbors ?? [])
      setStealsLeft(d.stealsLeft ?? 0)
    }).catch(() => setNeighbors([]))
  }, [status])

  const openFarm = useCallback((n: Neighbor) => {
    setTarget(n); setVisit(null)
    fetch(`/api/visit?userId=${n.id}`).then(r => r.json()).then(d => {
      if (d.plots) setVisit(d)
      else { showToast(d.error ?? '進不去這個農場'); setTarget(null) }
    })
  }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  async function pickup() {
    if (!target || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/visit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pickup', target: target.id }),
      })
      const d = await res.json()
      if (res.ok) {
        showToast(`${d.emoji} 撿到一個寶物，得到 🫧 珍珠 ×1！`)
        window.dispatchEvent(new CustomEvent('lmx:drop', { detail: { coins: 0, pearls: 1, rare: false } }))
        setVisit(v => v ? { ...v, pickupsLeft: d.pickupsLeft } : v)
      } else showToast(d.error ?? '撿不到')
    } finally { setBusy(false) }
  }

  async function steal(idx: number) {
    if (!target || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/visit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'steal', target: target.id, idx }),
      })
      const d = await res.json()
      if (res.ok) {
        showToast(`😏 偷到 ${d.species_emoji} ${d.species_name}，得到 🪙${d.coins}！`)
        window.dispatchEvent(new CustomEvent('lmx:drop', { detail: { coins: d.coins, pearls: 0, rare: false } }))
        openFarm(target)   // 重新載入（田變成已偷）
      } else showToast(d.error ?? '偷不到')
    } finally { setBusy(false) }
  }

  if (status !== 'authenticated') return <div className="min-h-screen flex items-center justify-center text-slate-400">載入中…</div>

  return (
    <main className="min-h-screen bg-gradient-to-b from-lime-50 to-slate-50 flex flex-col items-center px-4 py-8 gap-5">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-slate-800 text-white font-semibold shadow-xl max-w-sm text-center">{toast}</div>
      )}

      <div className="w-full max-w-lg flex items-center justify-between">
        <button onClick={() => (target ? (setTarget(null), setVisit(null)) : router.push('/'))}
          className="text-slate-500 font-semibold">← {target ? '鄰居列表' : '首頁'}</button>
        <h1 className="text-xl font-extrabold text-slate-800">🏡 串門子</h1>
        <span className="text-xs font-bold text-amber-600">今日可偷 {visit?.stealsLeft ?? stealsLeft} 次</span>
      </div>

      {!target ? (
        /* ── 鄰居列表 ── */
        <div className="w-full max-w-lg flex flex-col gap-2">
          {neighbors === null ? <p className="text-center text-slate-400 py-10 animate-pulse">找鄰居中…</p>
            : neighbors.length === 0 ? <p className="text-center text-slate-400 py-10">還沒有鄰居有農場，揪朋友一起玩吧！</p>
            : neighbors.map(n => (
              <button key={n.id} onClick={() => openFarm(n)}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 hover:shadow-md transition-all text-left active:scale-[0.98]">
                <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-200 shrink-0">
                  {n.picture_url ? <img src={n.picture_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🙂</div>}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{n.name} 的農場</p>
                  <p className="text-xs text-slate-400">農場 Lv.{n.farm_level}</p>
                </div>
                <span className="text-2xl">🌻</span>
              </button>
            ))}
        </div>
      ) : !visit ? (
        <p className="text-center text-slate-400 py-10 animate-pulse">走進 {target.name} 的農場…</p>
      ) : (
        /* ── 參觀農場 ── */
        <div className="w-full max-w-lg flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-200 shrink-0">
              {visit.owner.picture_url ? <img src={visit.owner.picture_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🙂</div>}
            </div>
            <div>
              <p className="font-bold text-slate-800">{visit.owner.name} 的農場</p>
              <p className="text-xs text-slate-400">成熟的作物可以偷偷拿一點 😏（動物不能偷）</p>
            </div>
          </div>

          <div className="rounded-[24px] p-4 shadow-inner" style={{ background: 'linear-gradient(#d8f3ad, #b6e487)', border: '5px solid #b07d45' }}>
            <div className="grid grid-cols-3 gap-2">
              {visit.plots.map(p => {
                const sp = p.species ? SPECIES[p.species as Species] : null
                const ripe = !!(sp && isRipe(p))
                const stealable = ripe && p.kind === 'crop' && !p.stolen && (visit.stealsLeft > 0)
                return (
                  <button key={p.idx} onClick={() => stealable && steal(p.idx)} disabled={!stealable || busy}
                    className={`aspect-square rounded-2xl flex flex-col items-center justify-center text-4xl relative transition-all ${
                      stealable ? 'bg-amber-50/90 ring-2 ring-amber-400 active:scale-90 cursor-pointer' : 'bg-white/50'
                    }`}>
                    <span className={p.stolen ? 'opacity-40' : ''}>{sp ? sp.stages[Math.min(p.stage, sp.stages.length - 1)] : '🟫'}</span>
                    {p.stolen && <span className="absolute bottom-1 text-[10px] font-bold text-slate-400">被偷過了</span>}
                    {stealable && <span className="absolute bottom-1 text-[10px] font-bold text-amber-600">偷一點 😏</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center">偷菜拿 3 成金幣，主人還是保有 7 成收成，大家開心 🌱</p>

          {/* 鄰居的魚缸（撿寶） */}
          {visit.aquarium && (
            <div className="rounded-[24px] p-4 shadow-inner" style={{ background: 'linear-gradient(#2a7ab5, #0b3a5e)', border: '5px solid #5a93c4' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-white">🐠 {visit.owner.name} 的魚缸</p>
                <span className="text-xs font-bold text-sky-200">今日可撿 {visit.pickupsLeft} 個</span>
              </div>
              <div className="flex gap-2 flex-wrap mb-3">
                {visit.aquarium.fish.slice(0, 12).map((f, i) => (
                  <span key={i} className="text-3xl" title={f.name}>{f.emoji}</span>
                ))}
              </div>
              <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
                <span className="text-sm text-sky-100">缸底的寶物：{'🐚'.repeat(Math.min(3, visit.aquarium.treasures))}{'💎'.repeat(Math.max(0, Math.min(3, visit.aquarium.treasures - 3)))}{visit.aquarium.treasures === 0 && '（還沒有）'}</span>
                <button onClick={pickup} disabled={busy || visit.pickupsLeft <= 0}
                  className="px-4 py-1.5 rounded-full bg-sky-400 text-white text-sm font-bold active:scale-95 disabled:opacity-40">
                  撿一個 🐚
                </button>
              </div>
              <p className="text-[10px] text-sky-200/70 mt-2">魚缸的寶物很多，撿走不會影響主人的收藏 😊</p>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
