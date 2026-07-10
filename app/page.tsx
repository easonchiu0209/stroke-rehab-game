'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import DeviceTipBanner from '@/components/shared/DeviceTipBanner'
import WeeklyReportCard from '@/components/home/WeeklyReportCard'
import DailyQuestCard from '@/components/home/DailyQuestCard'
import PrescriptionCard from '@/components/home/PrescriptionCard'
import MonthlyBadgeCard from '@/components/home/MonthlyBadgeCard'

interface GameCardData {
  id: string; emoji: string; title: string; subtitle: string
  level: string; levelBadge: string; description: string; route: string; available: boolean
}

const GAMES: GameCardData[] = [
  { id: 'touch-collect', emoji: '🎯', title: '碰點收集', subtitle: '肩關節主動活動度', level: 'Level 1', levelBadge: 'bg-green-100 text-green-800', description: '移動手腕觸碰螢幕上的目標點，訓練肩關節外展與屈曲活動範圍', route: '/touch-collect', available: true },
  { id: 'whack-mole', emoji: '🏅', title: '復能打地鼠', subtitle: '反應速度與肩肘訓練', level: 'Level 1–3', levelBadge: 'bg-yellow-100 text-yellow-800', description: '隨機目標出現並計時消失，快速伸手觸碰，訓練肩肘反應與患側注意力', route: '/whack-mole', available: true },
  { id: 'slash-fruit', emoji: '🍎', title: '復能切切樂', subtitle: '肩肘活動度與手眼協調', level: 'Level 1–3', levelBadge: 'bg-orange-100 text-orange-800', description: '水果、氣球從四面八方飛來，快速伸手觸碰，閃避炸彈，訓練肩屈曲與外展', route: '/slash-fruit', available: true },
  { id: 'farm', emoji: '🌻', title: '復能開心農場', subtitle: '養成 × 肩外展前伸搆取', level: '養成', levelBadge: 'bg-lime-100 text-lime-800', description: '種植作物、養動物，成熟後伸手採收賺金幣，解鎖新物種、擴建農場。跨場次持久養成，越玩農場越大', route: '/farm', available: true },
  { id: 'space-shooter', emoji: '🚀', title: '復能太空射擊', subtitle: '瞄準控制 × 手指捏合', level: 'Level 1–3', levelBadge: 'bg-indigo-100 text-indigo-800', description: '移動手臂瞄準擊落隕石與外星人。三種難度＝碰到就爆、停留發射、捏手指發射，動作由粗到細', route: '/space-shooter', available: true },
  { id: 'aquarium', emoji: '🐠', title: '復能水族箱', subtitle: '養成 × 前伸向下搆取', level: '養成', levelBadge: 'bg-cyan-100 text-cyan-800', description: '伸手釣魚，釣到的魚養在你的水族箱裡會長大、產珍珠，用珍珠解鎖稀有魚種、擴大魚缸，集滿魚類圖鑑', route: '/aquarium', available: true },
  { id: 'color-island', emoji: '🎈', title: '彩球復能島', subtitle: '肩外展與手眼協調', level: 'Level 1–3', levelBadge: 'bg-sky-100 text-sky-700', description: '繽紛彩球從四面八方飄來，伸手觸碰收集，閃避炸彈，訓練肩外展與手眼協調', route: '/color-island', available: true },
  { id: 'kitchen-catch', emoji: '🍳', title: '復能小廚房', subtitle: '肩屈曲與接取', level: 'Level 1–3', levelBadge: 'bg-amber-100 text-amber-700', description: '食材從鍋邊飛來，快手接住，閃開火焰，訓練肩屈曲與手眼協調', route: '/kitchen-catch', available: true },
  { id: 'grasp-place', emoji: '🤲', title: '抓取放置', subtitle: '肩肘協調訓練', level: 'Level 2', levelBadge: 'bg-blue-100 text-blue-800', description: '將手移到指定位置並停留，訓練上肢空間定位與手臂控制穩定度', route: '/game/setup', available: true },
  { id: 'wipe-trace', emoji: '🧹', title: '擦拭軌跡', subtitle: '持續性動作控制', level: 'Level 3', levelBadge: 'bg-orange-100 text-orange-800', description: '沿著指定路徑移動手腕，訓練肩肘協調流暢度與連續動作控制', route: '/wipe-trace', available: true },
  { id: 'pinch-sort', emoji: '🤏', title: '夾取分類', subtitle: '指尖精細操作', level: 'Level 4', levelBadge: 'bg-purple-100 text-purple-800', description: '用拇指與食指捏取物件放入正確顏色的籃子，訓練三指捏握精細動作', route: '/pinch-sort', available: true },
  { id: 'balance-shift', emoji: '⚖️', title: '重心平衡', subtitle: '站姿重心控制', level: 'Level 5', levelBadge: 'bg-cyan-100 text-cyan-800', description: '站著左右轉移重心控制接籃，訓練站姿平衡、患側負重與軀幹控制（站立訓練，需注意安全）', route: '/balance-shift', available: true },
  { id: 'wall-climb', emoji: '🧗', title: '爬牆挑戰', subtitle: '肩關節活動度（骨科）', level: 'Level 1–3', levelBadge: 'bg-sky-100 text-sky-800', description: '抬手帶小登山者爬上山頂，即時估算肩關節角度，突破自己的紀錄。五十肩、肩部術後訓練導向', route: '/wall-climb', available: true },
  { id: 'rhythm-step', emoji: '🥁', title: '節奏踏步', subtitle: '下肢節奏與左右協調', level: 'Level 1–3', levelBadge: 'bg-orange-100 text-orange-800', description: '跟著鼓聲節拍左右抬腿踏步，訓練下肢力量、步態節奏與左右對稱（坐姿可玩，安全優先）', route: '/rhythm-step', available: true },
  { id: 'sit-to-stand', emoji: '🪑', title: '坐到站', subtitle: '下肢肌力（骨科）', level: '30 秒挑戰', levelBadge: 'bg-teal-100 text-teal-800', description: '30 秒內完成越多次坐站越好，訓練下肢肌力與起身能力（需穩固椅子，建議陪同）', route: '/sit-to-stand', available: true },
]

const BANNERS = [
  'linear-gradient(135deg,#34d399,#059669)', 'linear-gradient(135deg,#fbbf24,#d97706)',
  'linear-gradient(135deg,#fb7185,#e11d48)', 'linear-gradient(135deg,#a3e635,#65a30d)',
  'linear-gradient(135deg,#818cf8,#4f46e5)', 'linear-gradient(135deg,#22d3ee,#0891b2)',
  'linear-gradient(135deg,#38bdf8,#0284c7)', 'linear-gradient(135deg,#fbbf24,#ea580c)',
  'linear-gradient(135deg,#60a5fa,#2563eb)', 'linear-gradient(135deg,#fb923c,#c2410c)',
]

interface LbUser { display_name: string; picture_url: string | null; total_points: number }
interface Sess { accuracy: number; created_at: string }
interface FeedPost { id: string; content: string; visibility: string; author_name: string; author_pic: string | null; cheers: number }

export default function HomePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [lb, setLb] = useState<LbUser[]>([])
  const [sessions, setSessions] = useState<Sess[] | null>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])

  useEffect(() => { fetch('/api/leaderboard').then(r => r.json()).then(d => setLb(Array.isArray(d) ? d : (d.allTime ?? []))).catch(() => {}) }, [])
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/profile').then(r => r.json()).then(d => setSessions(d.sessions ?? [])).catch(() => {})
    fetch('/api/posts').then(r => r.json()).then(d => setPosts((d.posts ?? []).filter((p: FeedPost) => p.visibility === 'public').slice(0, 2))).catch(() => {})
  }, [status])

  const avail = GAMES.filter(g => g.available)
  const coming = GAMES.filter(g => !g.available)

  // 本週統計 + 連續天數
  const now = new Date()
  const weekAgo = now.getTime() - 7 * 864e5
  const weekSess = (sessions ?? []).filter(s => new Date(s.created_at).getTime() >= weekAgo)
  const weekCount = weekSess.length
  const weekAcc = weekSess.length ? Math.round(weekSess.reduce((a, s) => a + s.accuracy, 0) / weekSess.length) : 0
  const streak = (() => {
    if (!sessions || !sessions.length) return 0
    const days = new Set(sessions.map(s => new Date(s.created_at).toDateString()))
    let n = 0; const d = new Date()
    while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1) }
    return n
  })()

  const hour = now.getHours()
  const greet = hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安'
  const rec = avail[Math.floor((sessions?.length ?? 0)) % avail.length] ?? avail[0]

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── 頂部列 ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-xl mx-auto flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏥</span>
            <span className="font-extrabold text-lg" style={{ color: '#1769d6' }}>LifeMotionXR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => router.push('/community')} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-lg" title="社群">💬</button>
            <button onClick={() => router.push('/calibrate')} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-lg" title="校正">🎯</button>
            <button onClick={() => router.push('/therapist')} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-lg" title="治療師">🩺</button>
            {session ? (
              <button onClick={() => router.push('/profile')} className="flex items-center gap-1.5 bg-slate-100 rounded-full pl-1 pr-2.5 py-1">
                <span className="w-7 h-7 rounded-full overflow-hidden bg-slate-300 inline-block">
                  {session.user.image ? <img src={session.user.image} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full">🙂</span>}
                </span>
                <span className="text-sm font-bold text-amber-600">⭐{session.user.totalPoints}</span>
              </button>
            ) : (
              <button onClick={() => signIn('line')} className="px-3 py-1.5 rounded-full text-white text-sm font-bold" style={{ background: '#06C755' }}>LINE 登入</button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-3 py-3 flex flex-col gap-3">

        {/* ── 裝置引導（LINE 內建瀏覽器切換 / 鏡頭與裝置建議）── */}
        <DeviceTipBanner />

        {/* ── 治療師處方（優先於每日任務）── */}
        <PrescriptionCard />

        {/* ── 今日任務（每日輪替，完成領養成資源）── */}
        <DailyQuestCard />

        {/* ── 本月全勤挑戰（月度限定徽章）── */}
        <MonthlyBadgeCard />

        {/* ── 本週進步卡（LLM 週報個案版）── */}
        <WeeklyReportCard />

        {/* ── 家人分享卡入口 ── */}
        <button onClick={() => router.push('/share-card')}
          className="w-full bg-gradient-to-r from-amber-100 to-orange-100 rounded-2xl shadow-sm p-4 border border-amber-200 flex items-center gap-3 active:scale-[0.98] transition-all text-left">
          <span className="text-3xl">🎁</span>
          <span className="flex-1">
            <span className="block font-extrabold text-amber-900">做一張成績單給家人看</span>
            <span className="block text-xs text-amber-700">把這個月的努力變成卡片，一鍵傳 LINE</span>
          </span>
          <span className="text-amber-400 text-xl">›</span>
        </button>

        {/* ── 限時動態（快速開始）── */}
        <div className="bg-white rounded-2xl shadow-sm p-3">
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {avail.map((g, i) => (
              <button key={g.id} onClick={() => router.push(g.route)} className="flex flex-col items-center gap-1 shrink-0 w-16">
                <span className="w-15 h-15 rounded-full flex items-center justify-center text-3xl" style={{ width: 60, height: 60, background: BANNERS[i % BANNERS.length], boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                  <span style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }}>{g.emoji}</span>
                </span>
                <span className="text-[11px] text-slate-600 truncate w-full text-center leading-tight">{g.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 問候 / 連續天數 ── */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          {session ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 shrink-0">
                  {session.user.image ? <img src={session.user.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">🙂</div>}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{greet}，{session.user.displayName}！</p>
                  <p className="text-sm text-slate-500">{streak > 0 ? `🔥 已連續訓練 ${streak} 天，繼續保持！` : '今天來做一次復能訓練吧 💪'}</p>
                </div>
              </div>
              <button onClick={() => router.push(rec.route)} className="w-full mt-3 py-3 rounded-xl text-white font-extrabold text-lg shadow active:scale-[0.98]" style={{ background: 'linear-gradient(90deg,#2563eb,#1769d6)' }}>
                ▶ 快速開始：{rec.title}
              </button>
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-4xl mb-1">👋</p>
              <p className="font-bold text-slate-800">歡迎使用 LifeMotionXR</p>
              <p className="text-sm text-slate-500 mb-3">登入即可記錄進度、累積積分、兌換獎品</p>
              <button onClick={() => signIn('line')} className="px-6 py-2.5 rounded-xl text-white font-bold" style={{ background: '#06C755' }}>用 LINE 登入</button>
            </div>
          )}
        </div>

        {/* ── 本週進度 ── */}
        {session && sessions && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-bold text-slate-700 mb-3">📊 你的本週進度</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-blue-50 rounded-xl py-3"><p className="text-2xl font-black text-blue-700">{weekCount}</p><p className="text-xs text-slate-500">訓練次數</p></div>
              <div className="bg-green-50 rounded-xl py-3"><p className="text-2xl font-black text-green-700">{weekAcc}%</p><p className="text-xs text-slate-500">平均命中</p></div>
              <div className="bg-amber-50 rounded-xl py-3"><p className="text-2xl font-black text-amber-600">⭐{session.user.totalPoints}</p><p className="text-xs text-slate-500">總積分</p></div>
            </div>
          </div>
        )}

        {/* ── 排行榜卡 ── */}
        {lb.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-slate-700">🏆 排行榜</p>
              <button onClick={() => router.push('/leaderboard')} className="text-sm text-blue-600 font-semibold">查看完整 ›</button>
            </div>
            <div className="flex flex-col gap-2">
              {lb.slice(0, 3).map((u, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xl w-6 text-center">{['🥇', '🥈', '🥉'][i]}</span>
                  <span className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 inline-block shrink-0">
                    {u.picture_url ? <img src={u.picture_url} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full">🙂</span>}
                  </span>
                  <span className="flex-1 font-semibold text-slate-700 truncate">{u.display_name}</span>
                  <span className="font-bold text-amber-600">⭐{u.total_points}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 復能社群 ── */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-slate-700">💬 復能社群</p>
            <button onClick={() => router.push('/community')} className="text-sm text-blue-600 font-semibold">查看更多 ›</button>
          </div>
          {session ? (
            <button onClick={() => router.push('/community')} className="w-full flex items-center gap-3 bg-slate-50 rounded-full px-4 py-2.5 text-left">
              <span className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 inline-block shrink-0">
                {session.user.image ? <img src={session.user.image} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full">🙂</span>}
              </span>
              <span className="text-slate-400">分享今天的心情或訓練心得…</span>
            </button>
          ) : (
            <p className="text-sm text-slate-500">登入後可發文、為彼此加油 💪</p>
          )}
          {posts.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {posts.map(p => (
                <button key={p.id} onClick={() => router.push('/community')} className="text-left bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 inline-block">
                      {p.author_pic ? <img src={p.author_pic} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full text-xs">🙂</span>}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{p.author_name}</span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2">{p.content}</p>
                  {p.cheers > 0 && <p className="text-xs text-orange-500 mt-1">💪 {p.cheers} 人加油</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 遊戲貼文（交錯獎品卡）── */}
        {avail.map((g, i) => (
          <div key={g.id}>
            <article className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 pt-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-2xl shrink-0" style={{ background: BANNERS[i % BANNERS.length] }}>
                  <span style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }}>{g.emoji}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-slate-900 leading-tight">{g.title}</h3>
                  <div className="flex items-center gap-2"><span className="text-xs text-slate-500">{g.subtitle}</span><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${g.levelBadge}`}>{g.level}</span></div>
                </div>
              </div>
              <div className="mx-4 mt-3 rounded-xl h-24 flex items-center justify-center" style={{ background: BANNERS[i % BANNERS.length] }}>
                <span className="text-6xl" style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.35))' }}>{g.emoji}</span>
              </div>
              <p className="px-4 py-2.5 text-sm text-slate-600 leading-relaxed">{g.description}</p>
              <div className="px-4 pb-3">
                <button onClick={() => router.push(g.route)} className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-bold active:scale-[0.98] transition-transform">▶ 開始訓練</button>
              </div>
            </article>

            {/* 第 2 篇後插排行榜already above；第 4 篇後插獎品卡 */}
            {i === 3 && (
              <div className="mt-3 rounded-2xl shadow-sm overflow-hidden text-white" style={{ background: 'linear-gradient(135deg,#a855f7,#6d28d9)' }}>
                <div className="p-4 flex items-center gap-3">
                  <span className="text-4xl">🎁</span>
                  <div className="flex-1"><p className="font-extrabold text-lg">用積分兌換獎品</p><p className="text-sm opacity-90">徽章、稱號、實體小禮物等你來換</p></div>
                  <button onClick={() => router.push('/prizes')} className="bg-white/90 text-purple-700 font-bold px-4 py-2 rounded-xl shrink-0">去兌換</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ── 即將開放 ── */}
        {coming.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-bold text-slate-700 mb-3">🔜 即將開放</p>
            <div className="flex gap-3">
              {coming.map(g => (
                <div key={g.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 opacity-70">
                  <span className="text-2xl grayscale">{g.emoji}</span>
                  <div><p className="text-sm font-semibold text-slate-600">{g.title}</p><p className="text-[10px] text-slate-400">{g.subtitle}</p></div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 py-3">
          LifeMotionXR · 復能訓練平台（訓練輔助工具，非醫療器材）
          <br /><a href="/privacy" className="underline">隱私權政策與免責聲明</a>
        </p>
      </main>
    </div>
  )
}
