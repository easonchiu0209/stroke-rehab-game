'use client'

import { useEffect, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Achievement {
  id:          string
  name:        string
  description: string
  icon:        string
  earned_at?:  string
}

interface GameSession {
  id:              string
  game_type:       string
  difficulty:      string
  score:           number
  hits:            number
  accuracy:        number
  avg_reaction_ms: number | null
  points_earned:   number
  created_at:      string
}

const GAME_NAMES: Record<string, string> = {
  'whack-mole':    '復能打地鼠',
  'slash-fruit':   '復能切切樂',
  'farm':          '復能開心農場',
  'space-shooter': '復能太空射擊',
  'fishing-king':  '復能釣魚王',
  'aquarium':      '復能水族箱',
  'touch-collect': '碰點收集',
  'wipe-trace':    '擦拭軌跡',
  'grasp-place':   '抓取放置',
  'farm-harvest':  '復能小農場',
  'pet-pat':       '復能毛小孩',
  'color-island':  '彩球復能島',
  'kitchen-catch': '復能小廚房',
  'pinch-sort':    '夾取分類',
  'balance-shift': '重心平衡',
  'wall-climb':    '爬牆挑戰',
  'rhythm-step':   '節奏踏步',
  'sit-to-stand':  '坐到站',
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [achievements, setAchievements]   = useState<Achievement[]>([])
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([])
  const [sessions, setSessions]           = useState<GameSession[]>([])
  const [loading, setLoading]             = useState(true)
  const [nickname, setNickname]           = useState('')
  const [savedNick, setSavedNick]         = useState(false)

  async function saveNickname() {
    await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }) })
    setSavedNick(true); setTimeout(() => setSavedNick(false), 2000)
  }

  useEffect(() => {
    if (status === 'unauthenticated') { signIn('line'); return }
    if (!session?.user?.id) return

    fetch('/api/profile').then(r => r.json()).then((d: {
      achievements: Achievement[]
      earned: { achievement_id: string; earned_at: string }[]
      sessions: GameSession[]
      nickname: string | null
    }) => {
      const earnedMap = new Map((d.earned ?? []).map(e => [e.achievement_id, e.earned_at]))
      setAllAchievements(d.achievements ?? [])
      setAchievements((d.achievements ?? []).filter(a => earnedMap.has(a.id)).map(a => ({ ...a, earned_at: earnedMap.get(a.id) })))
      setSessions(d.sessions ?? [])
      setNickname(d.nickname ?? '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session, status])

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-xl animate-pulse">載入中…</div>
  }

  if (!session) return null

  const totalSessions = sessions.length
  const totalHits     = sessions.reduce((s, r) => s + r.hits, 0)
  const avgAccuracy   = sessions.length > 0
    ? Math.round(sessions.reduce((s, r) => s + r.accuracy, 0) / sessions.length)
    : 0

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-50 flex flex-col items-center px-5 py-10 gap-6">

      {/* User card */}
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-md p-6 flex gap-4 items-center">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 shrink-0">
          {session.user.image
            ? <img src={session.user.image} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-3xl">🙂</div>
          }
        </div>
        <div className="flex-1">
          <p className="text-2xl font-extrabold text-gray-900">{session.user.displayName}</p>
          <p className="text-purple-600 font-bold text-lg">{session.user.totalPoints.toLocaleString()} 積分</p>
        </div>
        <button onClick={() => signOut()} className="text-sm text-gray-400 hover:text-gray-600">登出</button>
      </div>

      {/* Nickname */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm p-4">
        <p className="font-bold text-gray-700 mb-1">🙈 社群暱稱</p>
        <p className="text-xs text-gray-400 mb-3">設定後，你在<strong>社群貼文</strong>與<strong>排行榜</strong>會顯示暱稱，不會露出 LINE 名字。（留空＝用 LINE 名字）</p>
        <div className="flex gap-2">
          <input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20}
            placeholder="輸入暱稱…" className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5 outline-none text-gray-800" />
          <button onClick={saveNickname} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold active:scale-95">{savedNick ? '已儲存 ✓' : '儲存'}</button>
        </div>
      </div>

      {/* Stats */}
      <div className="w-full max-w-lg grid grid-cols-3 gap-3">
        {[
          { label: '訓練場次', value: totalSessions, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: '總觸碰次數', value: totalHits, color: 'text-green-700', bg: 'bg-green-50' },
          { label: '平均命中率', value: `${avgAccuracy}%`, color: 'text-orange-700', bg: 'bg-orange-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div className="w-full max-w-lg">
        <h2 className="text-xl font-bold text-gray-800 mb-3">🏅 成就徽章 ({achievements.length}/{allAchievements.length})</h2>
        <div className="grid grid-cols-3 gap-3">
          {allAchievements.map(ach => {
            const earned = achievements.find(e => e.id === ach.id)
            return (
              <div key={ach.id} className={`rounded-2xl p-3 text-center border-2 ${
                earned ? 'bg-white border-yellow-300 shadow-sm' : 'bg-gray-100 border-gray-200 opacity-50'
              }`}>
                <div className="text-3xl mb-1">{ach.icon}</div>
                <p className="text-xs font-bold text-gray-800 leading-tight">{ach.name}</p>
                {earned && <p className="text-xs text-yellow-600 mt-0.5">已解鎖</p>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div className="w-full max-w-lg">
          <h2 className="text-xl font-bold text-gray-800 mb-3">📋 最近訓練記錄</h2>
          <div className="flex flex-col gap-2">
            {sessions.slice(0, 10).map(s => (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
                <div className="text-2xl shrink-0">
                  {s.game_type === 'whack-mole' ? '🐭' : s.game_type === 'slash-fruit' ? '🍎' : '🎮'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{GAME_NAMES[s.game_type] ?? s.game_type}</p>
                  <p className="text-xs text-gray-500">{s.difficulty} · 命中率 {s.accuracy}%</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-purple-600">+{s.points_earned} 分</p>
                  <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString('zh-TW')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 w-full max-w-lg">
        <button onClick={() => router.push('/prizes')}
          className="flex-1 py-3 rounded-2xl bg-purple-500 text-white font-bold text-lg hover:bg-purple-600">
          🎁 兌換獎品
        </button>
        <button onClick={() => router.push('/')}
          className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50">
          ← 首頁
        </button>
      </div>
    </main>
  )
}
