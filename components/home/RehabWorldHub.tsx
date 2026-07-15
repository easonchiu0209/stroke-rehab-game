'use client'

import { useRouter } from 'next/navigation'

interface RecommendedGame {
  emoji: string
  title: string
  route: string
}

interface RehabWorldHubProps {
  displayName?: string
  points: number
  streak: number
  weekCount: number
  recommended: RecommendedGame
  signedIn: boolean
  onLogin: () => void
}

export default function RehabWorldHub({
  displayName,
  points,
  streak,
  weekCount,
  recommended,
  signedIn,
  onLogin,
}: RehabWorldHubProps) {
  const router = useRouter()
  const level = Math.max(1, Math.floor(points / 300) + 1)

  return (
    <section className="world-hub" aria-labelledby="world-title">
      <div className="world-hub-shade" />

      <div className="relative z-10 flex h-full flex-col px-4 pb-4 pt-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-white/85">晨光小鎮 · Lv.{level}</p>
            <h1 id="world-title" className="text-3xl font-black drop-shadow-md">我的復能世界</h1>
            <p className="mt-1 text-sm font-semibold text-white/90 drop-shadow-sm">
              {signedIn ? `${displayName ?? '勇者'}，今天也讓小鎮成長一點` : '每天完成冒險，打造自己的小鎮'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-sm font-black">
            <span className="world-stat-pill">⭐ {points}</span>
            <span className="world-stat-pill">🔥 {streak} 天</span>
          </div>
        </div>

        <div className="relative flex-1" aria-hidden>
          <span className="world-cloud world-cloud-a">☁️</span>
          <span className="world-cloud world-cloud-b">☁️</span>
          <span className="world-home-mark">🏡</span>
          <span className="world-tree-mark world-tree-left">🌳</span>
          <span className="world-tree-mark world-tree-right">🌲</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => router.push('/farm')} className="world-place-button" title="前往復能農場">
            <span className="text-2xl">🌻</span>
            <span><strong>我的農場</strong><small>種植與收成</small></span>
          </button>
          <button onClick={() => router.push('/aquarium')} className="world-place-button" title="前往復能水族箱">
            <span className="text-2xl">🐠</span>
            <span><strong>我的水族箱</strong><small>養魚與收珍珠</small></span>
          </button>
        </div>

        {signedIn ? (
          <button onClick={() => router.push(recommended.route)} className="world-adventure-button">
            <span className="text-xl">{recommended.emoji}</span>
            <span className="min-w-0 flex-1 truncate text-left">開始今日冒險：{recommended.title}</span>
            <span aria-hidden>▶</span>
          </button>
        ) : (
          <button onClick={onLogin} className="world-adventure-button">
            <span className="text-xl">🗺️</span>
            <span className="flex-1 text-left">登入並開始今天的冒險</span>
            <span aria-hidden>▶</span>
          </button>
        )}

        <p className="mt-2 text-center text-xs font-bold text-white/85">
          本週完成 {weekCount} 場 · 訓練會帶回農場金幣與水族箱珍珠
        </p>
      </div>
    </section>
  )
}
