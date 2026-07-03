'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SPECIES, ALL_SPECIES, expandCost, isRipe, ripeStage, type FarmState } from '@/lib/farm'
import { FarmDefs, SoilTile, Tree, Bush, Flower, Sun } from '@/components/farm/FarmScene'

export function FarmHome({ state, onTend, onChanged }: {
  state: FarmState
  onTend: () => void
  onChanged: (s: FarmState) => void
}) {
  const router = useRouter()
  const [shopOpen, setShopOpen] = useState(false)
  const [plantIdx, setPlantIdx] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const ripeCount = state.plots.filter(isRipe).length

  async function shop(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    const r = await fetch('/api/farm/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
    setBusy(false)
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error ?? '操作失敗'); return false }
    const s = await fetch('/api/farm').then(x => x.json())
    onChanged(s)
    return true
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-3 py-4 gap-4"
      style={{ background: 'linear-gradient(#cdeffb, #d8f3ad 26%, #b6e487)' }}>
      <FarmDefs />

      {/* Top bar */}
      <div className="w-full max-w-lg flex items-center justify-between">
        <button onClick={() => router.push('/')} className="text-green-900/80 font-bold bg-white/70 rounded-full px-3 py-1 shadow-sm">← 首頁</button>
        <div className="flex items-center gap-2">
          <span className="bg-white rounded-full px-3 py-1 shadow font-bold text-amber-600">🪙 {state.coins}</span>
          <span className="bg-white rounded-full px-3 py-1 shadow font-bold text-green-700">Lv.{state.level}</span>
        </div>
      </div>

      <h1 className="text-2xl font-extrabold text-green-900 drop-shadow-sm">復能開心農場</h1>

      {/* ── 農場場景 ───────────────────────────────────────────── */}
      <div className="relative w-full max-w-lg rounded-[30px] overflow-hidden shadow-xl"
        style={{
          border: '6px solid #b07d45',
          background:
            'radial-gradient(circle at 78% 16%, rgba(255,255,255,0.3), transparent 38%),' +
            'radial-gradient(circle at 22% 84%, #9cd96a, transparent 55%),' +
            'linear-gradient(160deg, #a7df74, #7fc64c)',
          minHeight: 380,
        }}>

        {/* 裝飾層 */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <div className="absolute" style={{ top: 6, right: 8 }}><Sun /></div>
          <div className="absolute" style={{ top: -2, left: 2 }}><Tree s={1.05} /></div>
          <div className="absolute" style={{ top: 16, left: 70 }}><Tree s={0.7} /></div>
          <div className="absolute" style={{ bottom: 2, right: 0 }}><Tree s={0.95} /></div>
          <div className="absolute" style={{ bottom: 6, left: 6 }}><Bush /></div>
          <div className="absolute" style={{ top: '46%', left: 2 }}><Flower c="#ff6f91" /></div>
          <div className="absolute" style={{ top: '40%', right: 6 }}><Flower c="#ffd23f" /></div>
          <div className="absolute" style={{ bottom: 40, right: 12 }}><Flower c="#c78bff" /></div>
          <div className="absolute" style={{ bottom: 8, left: 64 }}><Flower c="#ff9f43" /></div>
        </div>

        {/* 田地 */}
        <div className="relative grid grid-cols-3 gap-2.5 p-9">
          {state.plots.map(plot => {
            const ripe = isRipe(plot)
            const empty = plot.kind === 'empty'
            return (
              <button key={plot.idx}
                onClick={() => { if (empty) setPlantIdx(plot.idx) }}
                className={`relative aspect-square transition-transform ${empty ? 'active:scale-95' : ''}`}
                style={ripe ? { filter: 'drop-shadow(0 0 6px rgba(255,221,77,0.9))' } : undefined}>
                <SoilTile plot={plot} ripe={ripe} />
                {ripe && <span className="absolute -top-1 -right-1 text-base" style={{ animation: 'tw 1.3s ease-in-out infinite' }}>✨</span>}
                {!empty && plot.species && (
                  <span className="absolute bottom-1 inset-x-2 text-center text-[10px] font-bold text-white py-0.5 rounded-full"
                    style={{ background: ripe ? 'rgba(76,175,80,0.9)' : 'rgba(0,0,0,0.4)' }}>
                    {ripe ? '✅ 可採收' : `🌱 ${plot.stage + 1}/${ripeStage(plot.species) + 1}`}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-lg flex flex-col gap-3">
        <button onClick={onTend}
          className="w-full py-4 rounded-2xl text-white font-extrabold text-xl shadow-lg active:scale-[0.97] transition-all"
          style={{ background: 'linear-gradient(90deg,#43a047,#2e7d32)' }}>
          🌾 去照顧農場 {ripeCount > 0 ? `（${ripeCount} 片成熟）` : '（讓作物再長一點）'}
        </button>
        <div className="flex gap-3">
          <button onClick={() => setShopOpen(true)} className="flex-1 py-3 rounded-2xl bg-white border-2 border-amber-200 text-amber-700 font-bold active:scale-95">🛒 商店</button>
          <button onClick={() => router.push('/prizes')} className="flex-1 py-3 rounded-2xl bg-white border-2 border-gray-200 text-gray-600 font-bold active:scale-95">🎁 獎品</button>
        </div>
      </div>

      {/* Plant picker */}
      {plantIdx !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-20 p-4" onClick={() => setPlantIdx(null)}>
          <div className="bg-white rounded-3xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <p className="text-xl font-bold text-gray-800 mb-3">種點什麼？</p>
            <div className="grid grid-cols-3 gap-3">
              {state.unlocked.map(spId => {
                const def = SPECIES[spId]
                return (
                  <button key={spId} disabled={busy}
                    onClick={async () => { const ok = await shop('plant', { idx: plantIdx, species: spId }); if (ok) setPlantIdx(null) }}
                    className="p-3 rounded-2xl border-2 border-gray-200 hover:border-green-400 flex flex-col items-center gap-1 active:scale-95">
                    <span className="text-3xl">{def.stages[def.stages.length - 1]}</span>
                    <span className="text-xs font-semibold text-gray-600">{def.name}</span>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setPlantIdx(null)} className="w-full mt-4 py-2 text-gray-400 font-semibold">取消</button>
          </div>
        </div>
      )}

      {/* Shop */}
      {shopOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-20 p-4" onClick={() => setShopOpen(false)}>
          <div className="bg-white rounded-3xl p-5 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xl font-bold text-gray-800">🛒 農場商店</p>
              <span className="font-bold text-amber-600">🪙 {state.coins}</span>
            </div>
            <p className="text-sm font-semibold text-gray-500 mb-2">擴建田地</p>
            <button disabled={busy} onClick={() => shop('expand')}
              className="w-full mb-4 p-3 rounded-2xl border-2 border-amber-200 flex items-center justify-between active:scale-[0.98]">
              <span className="font-semibold text-gray-700">➕ 增加 3 塊田（目前 {state.plot_count} 塊）</span>
              <span className="font-bold text-amber-600">🪙 {expandCost(state.plot_count)}</span>
            </button>
            <p className="text-sm font-semibold text-gray-500 mb-2">解鎖新物種</p>
            <div className="flex flex-col gap-2">
              {ALL_SPECIES.filter(s => !state.unlocked.includes(s.id)).map(def => (
                <button key={def.id} disabled={busy || state.coins < def.unlockCost}
                  onClick={() => shop('unlock', { species: def.id })}
                  className="p-3 rounded-2xl border-2 border-gray-200 flex items-center justify-between active:scale-[0.98] disabled:opacity-40">
                  <span className="flex items-center gap-2">
                    <span className="text-2xl">{def.stages[def.stages.length - 1]}</span>
                    <span className="font-semibold text-gray-700">{def.name}</span>
                    <span className="text-xs text-gray-400">{def.kind === 'animal' ? '動物' : '作物'}・收成 +{def.reward}</span>
                  </span>
                  <span className="font-bold text-amber-600">🪙 {def.unlockCost}</span>
                </button>
              ))}
              {ALL_SPECIES.filter(s => !state.unlocked.includes(s.id)).length === 0 && (
                <p className="text-center text-gray-400 py-3">全部解鎖完成 🎉</p>
              )}
            </div>
            <button onClick={() => setShopOpen(false)} className="w-full mt-4 py-2.5 rounded-2xl bg-gray-100 text-gray-600 font-semibold">關閉</button>
          </div>
        </div>
      )}

      <style>{`@keyframes tw { 0%,100%{ opacity:0.3; transform:scale(0.8) } 50%{ opacity:1; transform:scale(1.2) } }`}</style>
    </main>
  )
}
