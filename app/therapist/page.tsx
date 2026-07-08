'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { computeKinematics, averageKinematics, type Kinematics } from '@/lib/kinematics'
import { GAME_INFO, DIFF_LABELS } from '@/lib/gameInfo'

const GAME_NAMES: Record<string, string> = {
  'whack-mole': '復能打地鼠', 'slash-fruit': '復能切切樂', 'farm': '復能開心農場',
  'space-shooter': '復能太空射擊', 'color-island': '彩球復能島', 'kitchen-catch': '復能小廚房',
  'touch-collect': '碰點收集', 'wipe-trace': '擦拭軌跡', 'grasp-place': '抓取放置',
  'fishing-king': '復能釣魚王', 'aquarium': '復能水族箱',
  'pinch-sort': '夾取分類', 'balance-shift': '重心平衡', 'wall-climb': '爬牆挑戰', 'rhythm-step': '節奏踏步',
}
const gname = (g: string) => GAME_NAMES[g] ?? g

interface Patient {
  id: string; display_name: string; picture_url: string | null
  total_points: number; session_count: number; last_active: string | null; avg_accuracy: number | null
  comp_week?: number
}

// 依從性燈號：<3 天內有練=綠、3–6 天未練=黃、≥7 天未練=紅、從未訓練=灰
function adherenceLight(p: Patient): { dot: string; label: string; cls: string } {
  if (!p.last_active) return { dot: 'bg-slate-300', label: '未開始', cls: 'text-slate-400' }
  const days = (Date.now() - new Date(p.last_active).getTime()) / 86400_000
  if (days < 3) return { dot: 'bg-green-500', label: '正常訓練中', cls: 'text-green-600' }
  if (days < 7) return { dot: 'bg-amber-400', label: `${Math.floor(days)} 天未訓練`, cls: 'text-amber-600' }
  return { dot: 'bg-red-500', label: `${Math.floor(days)} 天未訓練`, cls: 'text-red-600' }
}
const COMP_WARN_THRESHOLD = 15   // 本週代償事件數達此值 → 紅點註記
interface Sess {
  id: string; game_type: string; difficulty: string; score: number; hits: number; misses: number
  accuracy: number; avg_reaction_ms: number | null; highest_reach: number | null
  left_hits: number; right_hits: number; center_hits: number; zone_heatmap: number[][] | null
  trajectory: number[][] | null
  duration_secs: number; created_at: string
  pain_score?: number | null
}
interface WeeklyReport {
  week_start: string
  therapist_summary: string | null
  generated_by: 'llm' | 'rules'
}
interface RomRecord { joint: string; motion: string; angle_deg: number; measured_at: string }
const ROM_LABELS: Record<string, string> = { 'shoulder/flexion': '肩屈曲' }

export default function TherapistPage() {
  const { status } = useSession()
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [sel, setSel] = useState<Patient | null>(null)
  const [sessions, setSessions] = useState<Sess[] | null>(null)
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [rom, setRom] = useState<RomRecord[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') signIn('line')
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/therapist').then(async r => {
      if (r.status === 403) { setForbidden(true); return }
      const d = await r.json(); setPatients(d.patients ?? [])
    })
  }, [status])

  const openPatient = useCallback((p: Patient) => {
    setSel(p); setSessions(null); setReports([])
    fetch(`/api/therapist?userId=${p.id}`).then(r => r.json()).then(d => {
      setSessions(d.sessions ?? [])
      setReports(d.reports ?? [])
      setRom(d.rom ?? [])
    })
  }, [])

  function exportCsv() {
    if (!sessions || !sel) return
    const cols = ['date', 'game', 'difficulty', 'score', 'hits', 'misses', 'accuracy', 'avg_reaction_ms', 'highest_reach', 'left_hits', 'center_hits', 'right_hits', 'duration_secs',
      'path_length', 'path_efficiency', 'mean_speed', 'peak_speed', 'submovements', 'jerk_index', 'rom_x', 'rom_y']
    const rows = sessions.map(s => {
      const k = computeKinematics(s.trajectory)
      return [
        new Date(s.created_at).toLocaleString('zh-TW'), gname(s.game_type), s.difficulty, s.score, s.hits, s.misses,
        s.accuracy, s.avg_reaction_ms ?? '', s.highest_reach ?? '', s.left_hits, s.center_hits, s.right_hits, s.duration_secs,
        k?.pathLength ?? '', k?.pathEfficiency ?? '', k?.meanSpeed ?? '', k?.peakSpeed ?? '', k?.numSubmovements ?? '', k?.jerkIndex ?? '', k?.romX ?? '', k?.romY ?? '',
      ]
    })
    const csv = [cols.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${sel.display_name}_訓練記錄.csv`
    a.click()
  }

  if (status === 'loading') return <Center>載入中…</Center>
  if (forbidden) return <Center>🔒 此頁僅供治療師使用<br /><span className="text-sm text-gray-400">（你的帳號沒有治療師權限）</span></Center>
  if (!patients) return <Center>載入個案中…</Center>

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 flex flex-col items-center gap-5">
      <div className="w-full max-w-3xl flex items-center justify-between print-hide">
        <button onClick={() => router.push('/')} className="text-gray-500 font-semibold">← 首頁</button>
        <h1 className="text-xl font-extrabold text-slate-800">🩺 治療師後台</h1>
        <span className="text-sm text-gray-400">{patients.length} 位個案</span>
      </div>

      {!sel ? (
        <div className="w-full max-w-3xl flex flex-col gap-2">
          {patients.length === 0 && <p className="text-center text-gray-400 py-10">目前沒有個案訓練記錄</p>}
          {patients.map(p => (
            <button key={p.id} onClick={() => openPatient(p)}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 hover:shadow-md transition-all text-left">
              <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-200 shrink-0">
                {p.picture_url ? <img src={p.picture_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🙂</div>}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${adherenceLight(p).dot}`} />
                  <p className="font-bold text-slate-800">{p.display_name}</p>
                  {(p.comp_week ?? 0) >= COMP_WARN_THRESHOLD && (
                    <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">⚠️ 代償偏多</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {p.session_count} 場 · <span className={adherenceLight(p).cls}>{adherenceLight(p).label}</span>
                  {(p.comp_week ?? 0) > 0 && <span> · 本週代償 {p.comp_week} 次</span>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-blue-600">{p.avg_accuracy ?? '—'}%</p>
                <p className="text-[10px] text-gray-400">平均命中</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Detail patient={sel} sessions={sessions} reports={reports} rom={rom} onBack={() => { setSel(null); setSessions(null) }} onExport={exportCsv} />
      )}
    </main>
  )
}

// ── 訓練處方區塊（開立/列表/停用）────────────────────────────
interface RxRow {
  id: string; game_type: string
  difficulty_params: { difficulty?: string } | null
  sessions_per_week: number; note: string | null; active: boolean; created_at: string
}

function RxSection({ patientId }: { patientId: string }) {
  const [rxs, setRxs] = useState<RxRow[] | null>(null)
  const [game, setGame] = useState('whack-mole')
  const [diff, setDiff] = useState('easy')
  const [perWeek, setPerWeek] = useState(3)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/prescriptions?userId=${patientId}`)
      .then(r => r.json()).then(d => setRxs(d.prescriptions ?? []))
      .catch(() => setRxs([]))
  }, [patientId])
  useEffect(() => { load() }, [load])

  async function create() {
    setBusy(true)
    try {
      const res = await fetch('/api/prescriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: patientId, game_type: game, difficulty: diff, sessions_per_week: perWeek, note }),
      })
      if (res.ok) { setNote(''); load() }
      else alert((await res.json().catch(() => null))?.error ?? '開立失敗')
    } finally { setBusy(false) }
  }

  async function deactivate(id: string) {
    if (!confirm('停用這張處方？個案端將不再顯示。')) return
    await fetch('/api/prescriptions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  const actives = (rxs ?? []).filter(r => r.active)

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <p className="font-bold text-slate-800 mb-3">📋 訓練處方</p>

      {/* 開立表單 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 print-hide">
        <select value={game} onChange={e => setGame(e.target.value)} className="border border-slate-200 rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 bg-slate-50">
          {Object.entries(GAME_INFO).map(([id, g]) => <option key={id} value={id}>{g.emoji} {g.name}</option>)}
        </select>
        <select value={diff} onChange={e => setDiff(e.target.value)} className="border border-slate-200 rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 bg-slate-50">
          <option value="easy">Level 1（易）</option>
          <option value="medium">Level 2（中）</option>
          <option value="hard">Level 3（難）</option>
        </select>
        <select value={perWeek} onChange={e => setPerWeek(Number(e.target.value))} className="border border-slate-200 rounded-xl px-2 py-2 text-sm font-semibold text-slate-700 bg-slate-50">
          {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>每週 {n} 次</option>)}
        </select>
        <button onClick={create} disabled={busy}
          className="rounded-xl bg-emerald-600 text-white text-sm font-bold active:scale-95 disabled:opacity-50 py-2">
          {busy ? '開立中…' : '＋ 開立處方'}
        </button>
      </div>
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={200}
        placeholder="備註（選填，個案端會看到，例：用患側手、慢慢來）"
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-slate-50 mb-3 print-hide" />

      {/* 有效處方列表 */}
      {rxs === null ? <p className="text-sm text-slate-400">載入中…</p>
        : actives.length === 0 ? <p className="text-sm text-slate-400">尚無有效處方</p>
        : (
          <div className="flex flex-col gap-2">
            {actives.map(r => {
              const info = GAME_INFO[r.game_type]
              const d = r.difficulty_params?.difficulty ?? 'easy'
              return (
                <div key={r.id} className="flex items-center gap-3 border border-slate-100 rounded-xl p-3 bg-slate-50/60">
                  <span className="text-xl">{info?.emoji ?? '🎮'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">
                      {info?.name ?? r.game_type}
                      <span className="ml-1.5 text-xs text-slate-400">{DIFF_LABELS[d] ?? d} · 每週 {r.sessions_per_week} 次</span>
                    </p>
                    {r.note && <p className="text-xs text-slate-400">💬 {r.note}</p>}
                  </div>
                  <button onClick={() => deactivate(r.id)} className="text-xs font-bold text-red-400 hover:text-red-600 shrink-0 print-hide">停用</button>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-500 text-lg text-center px-6">{children}</div>
}

function Detail({ patient, sessions, reports, rom, onBack, onExport }: {
  patient: Patient; sessions: Sess[] | null; reports: WeeklyReport[]; rom: RomRecord[]; onBack: () => void; onExport: () => void
}) {
  if (!sessions) return <Center>載入記錄中…</Center>

  const n = sessions.length
  const avgAcc = n ? Math.round(sessions.reduce((s, r) => s + r.accuracy, 0) / n) : 0
  const rxn = sessions.filter(s => s.avg_reaction_ms != null)
  const avgRxn = rxn.length ? Math.round(rxn.reduce((s, r) => s + (r.avg_reaction_ms ?? 0), 0) / rxn.length) : null
  const reach = sessions.filter(s => s.highest_reach != null)
  const maxReach = reach.length ? Math.max(...reach.map(s => s.highest_reach ?? 0)) : null
  const totalL = sessions.reduce((s, r) => s + (r.left_hits ?? 0), 0)
  const totalC = sessions.reduce((s, r) => s + (r.center_hits ?? 0), 0)
  const totalR = sessions.reduce((s, r) => s + (r.right_hits ?? 0), 0)
  const sideTotal = totalL + totalC + totalR
  const lastHeatmap = [...sessions].reverse().find(s => s.zone_heatmap)?.zone_heatmap ?? null
  const maxCell = lastHeatmap ? Math.max(1, ...lastHeatmap.flat()) : 1

  // 動作品質（運動學特徵）
  const kins = sessions.map(s => computeKinematics(s.trajectory)).filter(Boolean) as Kinematics[]
  const avgK = averageKinematics(kins)

  // per game counts
  const gcount = new Map<string, number>()
  sessions.forEach(s => gcount.set(s.game_type, (gcount.get(s.game_type) ?? 0) + 1))

  const recent = [...sessions].reverse()
  const accMax = Math.max(1, ...sessions.map(s => s.accuracy))

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4">
      <div className="flex items-center gap-3 print-hide">
        <button onClick={onBack} className="text-gray-500 font-semibold">← 個案清單</button>
        <div className="flex-1" />
        <button onClick={() => window.print()} className="px-4 py-1.5 rounded-xl bg-sky-700 text-white text-sm font-bold">🖨 列印報告</button>
        <button onClick={onExport} className="px-4 py-1.5 rounded-xl bg-slate-800 text-white text-sm font-bold">⬇ 匯出 CSV</button>
      </div>

      {/* 列印版報告抬頭（僅列印時顯示） */}
      <div className="print-only">
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>LifeMotionXR 訓練進度報告</h1>
        <p style={{ fontSize: 12, color: '#64748b' }}>
          個案：{patient.display_name}　報告產出：{new Date().toLocaleDateString('zh-TW')}
          數據為鏡頭估算，僅供訓練參考，非醫療量測。AI 輔助生成內容需治療師審閱。
        </p>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-200 shrink-0">
          {patient.picture_url ? <img src={patient.picture_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">🙂</div>}
        </div>
        <div>
          <p className="text-xl font-extrabold text-slate-800">{patient.display_name}</p>
          <p className="text-sm text-gray-400">共 {n} 場訓練</p>
        </div>
      </div>

      {/* 訓練處方 */}
      <RxSection patientId={patient.id} />

      {/* ROM 活動度紀錄（骨科遊戲量測；表未建時自動隱藏） */}
      {rom.length > 0 && (() => {
        const byKey = new Map<string, RomRecord[]>()
        for (const r of rom) {
          const k = `${r.joint}/${r.motion}`
          byKey.set(k, [...(byKey.get(k) ?? []), r])
        }
        return (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="font-bold text-slate-800 mb-3">📐 活動度（ROM）紀錄 <span className="text-[10px] text-slate-400 font-normal">鏡頭估算，非醫療量測</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from(byKey.entries()).map(([k, recs]) => {
                const best = Math.max(...recs.map(r => r.angle_deg))
                const latest = recs[0]
                return (
                  <div key={k} className="border border-slate-100 rounded-xl p-3 bg-slate-50/60">
                    <p className="text-sm font-bold text-slate-700">{ROM_LABELS[k] ?? k}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      歷史最佳 <span className="font-black text-sky-700 text-base">{Math.round(best)}°</span>
                      　最近 {Math.round(latest.angle_deg)}°（{new Date(latest.measured_at).toLocaleDateString('zh-TW')}）
                      　共 {recs.length} 筆
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 每週摘要（LLM 週報治療師版草稿） */}
      {reports.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <p className="font-bold text-slate-800">📊 每週摘要</p>
            <span className="text-[10px] text-slate-400">草稿僅供參考，請審閱後再用於臨床溝通</span>
          </div>
          <div className="flex flex-col gap-3">
            {reports.map(r => (
              <div key={r.week_start} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold text-slate-700">{r.week_start} 起的一週</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    r.generated_by === 'llm' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {r.generated_by === 'llm' ? 'AI 輔助生成' : '規則式生成'}
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{r.therapist_summary ?? '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {n === 0 ? <p className="text-center text-gray-400 py-10">此個案尚無訓練記錄</p> : (<>
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '訓練場次', value: `${n}`, color: 'text-slate-800' },
            { label: '平均命中率', value: `${avgAcc}%`, color: 'text-blue-600' },
            { label: '平均反應', value: avgRxn != null ? `${avgRxn}ms` : '—', color: 'text-orange-600' },
            { label: '最高伸手', value: maxReach != null ? `${maxReach}%` : '—', color: 'text-green-600' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 text-center shadow-sm">
              <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-1">{c.label}</p>
            </div>
          ))}
        </div>

        {/* 進步曲線 (accuracy per session) */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-bold text-slate-700 mb-3">📈 命中率趨勢（每場）</p>
          <div className="flex items-end gap-1 h-32">
            {sessions.map((s, i) => (
              <div key={s.id} className="flex-1 flex flex-col justify-end items-center group" title={`${gname(s.game_type)} ${s.accuracy}%`}>
                <div className="w-full rounded-t bg-blue-400 group-hover:bg-blue-600 transition-colors"
                  style={{ height: `${(s.accuracy / accMax) * 100}%`, minHeight: 2 }} />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">左＝最早 → 右＝最近</p>
        </div>

        {/* 患側分析 */}
        {sideTotal > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="font-bold text-slate-700 mb-1">🧭 左右側使用分析</p>
            <p className="text-xs text-gray-400 mb-3">觀察個案是否偏用某一側（中風患側 vs 健側）</p>
            <div className="flex gap-3">
              {[
                { label: '左側', v: totalL, c: '#E65100' },
                { label: '中間', v: totalC, c: '#1565C0' },
                { label: '右側', v: totalR, c: '#2E7D32' },
              ].map(z => {
                const pct = Math.round((z.v / sideTotal) * 100)
                return (
                  <div key={z.label} className="flex-1 text-center">
                    <div className="h-24 bg-gray-100 rounded-lg relative overflow-hidden">
                      <div className="absolute bottom-0 inset-x-0 rounded-t transition-all" style={{ height: `${pct}%`, background: z.c, minHeight: z.v > 0 ? 4 : 0 }} />
                    </div>
                    <p className="text-lg font-bold mt-1" style={{ color: z.c }}>{pct}%</p>
                    <p className="text-xs text-gray-400">{z.label} ({z.v})</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 最近熱區 */}
        {lastHeatmap && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="font-bold text-slate-700 mb-3">🔥 最近一場觸碰熱區（上＝高位）</p>
            <div className="grid grid-cols-3 gap-1 max-w-[180px] mx-auto">
              {lastHeatmap.map((row, ri) => row.map((cnt, ci) => (
                <div key={`${ri}-${ci}`} className="aspect-square rounded-md flex items-center justify-center text-sm font-bold"
                  style={{ background: cnt > 0 ? `rgba(21,101,192,${0.15 + (cnt / maxCell) * 0.75})` : '#F3F4F6', color: cnt / maxCell > 0.45 ? '#fff' : '#9CA3AF' }}>
                  {cnt > 0 ? cnt : ''}
                </div>
              )))}
            </div>
          </div>
        )}

        {/* 動作品質（運動學） */}
        {avgK && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="font-bold text-slate-700 mb-1">🦾 動作品質分析（{kins.length} 場含軌跡）</p>
            <p className="text-xs text-gray-400 mb-3">由手部軌跡計算的平均值。可作為動作流暢度與控制力的客觀指標。</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: '動作流暢度', value: `${avgK.numSubmovements}`, hint: '速度峰值數，越少越連貫', color: 'text-green-600' },
                { label: '抖動指數', value: `${avgK.jerkIndex}`, hint: '越低越平滑', color: 'text-blue-600' },
                { label: '路徑直接度', value: `${Math.round(avgK.pathEfficiency * 100)}%`, hint: '越高越不繞路', color: 'text-indigo-600' },
                { label: '平均速度', value: `${avgK.meanSpeed}`, hint: '單位/秒', color: 'text-orange-600' },
                { label: '水平活動範圍', value: `${Math.round(avgK.romX * 100)}%`, hint: '左右伸展幅度', color: 'text-purple-600' },
                { label: '垂直活動範圍', value: `${Math.round(avgK.romY * 100)}%`, hint: '上下伸展幅度', color: 'text-rose-600' },
              ].map(m => (
                <div key={m.label} className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-black ${m.color}`}>{m.value}</p>
                  <p className="text-xs font-semibold text-gray-600 mt-0.5">{m.label}</p>
                  <p className="text-[10px] text-gray-400">{m.hint}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">💡 這些特徵就是日後訓練 ML 模型（動作品質評分、復原預測）的輸入。</p>
          </div>
        )}

        {/* 各遊戲次數 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="font-bold text-slate-700 mb-3">🎮 各遊戲訓練次數</p>
          <div className="flex flex-col gap-2">
            {Array.from(gcount.entries()).sort((a, b) => b[1] - a[1]).map(([g, c]) => (
              <div key={g} className="flex items-center gap-2">
                <span className="text-sm text-gray-600 w-28 shrink-0">{gname(g)}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(c / n) * 100}%` }} />
                </div>
                <span className="text-sm font-bold text-gray-500 w-8 text-right">{c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 記錄表 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm overflow-x-auto">
          <p className="font-bold text-slate-700 mb-3">📋 訓練記錄</p>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 text-left border-b">
              <th className="py-2 pr-2">日期</th><th className="pr-2">遊戲</th><th className="pr-2">難度</th>
              <th className="pr-2">命中</th><th className="pr-2">命中率</th><th className="pr-2">反應</th><th>伸手</th>
            </tr></thead>
            <tbody>
              {recent.map(s => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2 pr-2 text-gray-500 whitespace-nowrap">{new Date(s.created_at).toLocaleDateString('zh-TW')}</td>
                  <td className="pr-2 font-medium text-gray-700 whitespace-nowrap">
                    {gname(s.game_type)}
                    {s.pain_score != null && s.pain_score >= 4 && (
                      <span className="ml-1 text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">疼痛 {s.pain_score}</span>
                    )}
                  </td>
                  <td className="pr-2 text-gray-500">{s.difficulty}</td>
                  <td className="pr-2 text-gray-700">{s.hits}/{s.hits + s.misses}</td>
                  <td className="pr-2 font-bold text-blue-600">{s.accuracy}%</td>
                  <td className="pr-2 text-gray-500">{s.avg_reaction_ms != null ? `${s.avg_reaction_ms}ms` : '—'}</td>
                  <td className="text-gray-500">{s.highest_reach != null ? `${s.highest_reach}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  )
}
