'use client'

import { useRouter } from 'next/navigation'

interface GameCardData {
  id:          string
  emoji:       string
  title:       string
  subtitle:    string
  level:       string
  levelBadge:  string
  description: string
  route:       string
  available:   boolean
}

const GAMES: GameCardData[] = [
  {
    id:          'touch-collect',
    emoji:       '🎯',
    title:       '碰點收集',
    subtitle:    '肩關節主動活動度',
    level:       'Level 1',
    levelBadge:  'bg-green-100 text-green-800',
    description: '移動手腕觸碰螢幕上的目標點，訓練肩關節外展與屈曲活動範圍',
    route:       '/touch-collect',
    available:   true,
  },
  {
    id:          'grasp-place',
    emoji:       '🤲',
    title:       '抓取放置',
    subtitle:    '肩肘協調訓練',
    level:       'Level 2',
    levelBadge:  'bg-blue-100 text-blue-800',
    description: '將手移到指定位置並停留，訓練上肢空間定位與手臂控制穩定度',
    route:       '/game',
    available:   true,
  },
  {
    id:          'wipe-trace',
    emoji:       '🧹',
    title:       '擦拭軌跡',
    subtitle:    '持續性動作控制',
    level:       'Level 3',
    levelBadge:  'bg-orange-100 text-orange-800',
    description: '沿著指定路徑移動手腕，訓練肩肘協調流暢度與連續動作控制',
    route:       '/wipe-trace',
    available:   false,
  },
  {
    id:          'pinch-sort',
    emoji:       '🤏',
    title:       '夾取分類',
    subtitle:    '指尖精細操作',
    level:       'Level 4',
    levelBadge:  'bg-purple-100 text-purple-800',
    description: '用拇指與食指捏取物件放入正確容器，訓練三指捏握精細動作',
    route:       '/pinch-sort',
    available:   false,
  },
]

export default function HomePage() {
  const router = useRouter()

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-8 bg-gradient-to-b from-blue-50 to-gray-50">

      {/* Header */}
      <div className="text-center w-full max-w-2xl">
        <div className="text-6xl mb-3 leading-none">🏥</div>
        <h1 className="text-4xl font-extrabold text-blue-900 leading-tight">
          上肢功能復健訓練
        </h1>
        <p className="text-gray-500 mt-2 text-lg">
          中風後上肢功能性訓練遊戲 · Level 1 – 4
        </p>
      </div>

      {/* Game grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {GAMES.map((game) => (
          <button
            key={game.id}
            onClick={() => game.available && router.push(game.route)}
            disabled={!game.available}
            className={`
              relative text-left p-5 rounded-2xl border-2 transition-all duration-150
              ${game.available
                ? 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md active:scale-[0.98] cursor-pointer'
                : 'bg-gray-50 border-gray-100 cursor-not-allowed'
              }
            `}
          >
            {!game.available && (
              <span className="absolute top-3 right-3 text-xs font-bold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                即將開放
              </span>
            )}

            <div className={`text-4xl mb-3 leading-none ${!game.available ? 'opacity-50' : ''}`}>
              {game.emoji}
            </div>

            <div className="flex items-center gap-2 mb-1">
              <h2 className={`text-xl font-extrabold ${game.available ? 'text-gray-900' : 'text-gray-400'}`}>
                {game.title}
              </h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${game.available ? game.levelBadge : 'bg-gray-100 text-gray-400'}`}>
                {game.level}
              </span>
            </div>

            <p className={`text-sm font-semibold mb-2 ${game.available ? 'text-blue-700' : 'text-gray-400'}`}>
              {game.subtitle}
            </p>
            <p className={`text-sm leading-relaxed ${game.available ? 'text-gray-500' : 'text-gray-400'}`}>
              {game.description}
            </p>
          </button>
        ))}
      </div>

      {/* Usage instructions */}
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-700 mb-2">📋 使用說明</h3>
        <ul className="text-base text-gray-600 space-y-1.5">
          <li>1. 根據個案目前的復健等級，選擇對應訓練項目</li>
          <li>2. AR 鏡頭自動偵測手部位置，完成指定動作即記錄成功</li>
          <li>3. 建議由 Level 1 開始，逐步提升至更高等級</li>
          <li>4. 完成後可查看詳細成績報告，追蹤訓練進度</li>
        </ul>
      </div>
    </main>
  )
}
