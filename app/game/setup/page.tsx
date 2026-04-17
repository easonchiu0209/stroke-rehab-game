'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGame } from '@/context/GameContext'
import {
  ROUND_COUNT_OPTIONS,
  DEFAULT_ROUND_COUNT,
  MODE_LABELS,
  MODE_DESCRIPTIONS,
  MODE_ICONS,
  MODE_COLORS,
} from '@/lib/constants'
import type { GameMode } from '@/types/game'

export default function GameSetupPage() {
  const router = useRouter()
  const { dispatch } = useGame()

  const [mode,        setMode]        = useState<GameMode>('near-reach')
  const [totalRounds, setTotalRounds] = useState<number>(DEFAULT_ROUND_COUNT)

  function handleStart() {
    dispatch({ type: 'START_GAME', payload: { mode, totalRounds } })
    router.push('/game')
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10 gap-7 bg-gradient-to-b from-blue-50 to-gray-50">

      {/* 返回首頁 */}
      <div className="w-full max-w-xl">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-blue-700 text-base font-semibold hover:text-blue-900 transition-colors"
        >
          ← 返回首頁
        </button>
      </div>

      {/* 標題 */}
      <div className="text-center">
        <div className="text-6xl mb-3 leading-none">🤲</div>
        <h1 className="text-3xl font-extrabold text-blue-900">抓取放置</h1>
        <p className="text-gray-500 mt-1.5 text-base">
          肩肘協調訓練 · Level 2
        </p>
      </div>

      {/* 模式選擇 */}
      <div className="w-full max-w-xl">
        <h2 className="text-xl font-semibold text-gray-700 mb-3 text-center">選擇訓練模式</h2>
        <div className="flex flex-col gap-3">
          {(['near-reach', 'lateral'] as GameMode[]).map((m) => {
            const colors     = MODE_COLORS[m]
            const isSelected = mode === m
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`
                  flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-150
                  ${isSelected
                    ? `${colors.bg} ${colors.border} shadow-md`
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                  }
                `}
              >
                <span className="text-4xl leading-none">{MODE_ICONS[m]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold text-gray-900 mb-0.5">
                    {MODE_LABELS[m]}
                  </div>
                  <p className="text-sm text-gray-500">{MODE_DESCRIPTIONS[m]}</p>
                </div>
                {isSelected && (
                  <span className={`text-xl flex-shrink-0 ${colors.text}`}>✓</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 回合數選擇 */}
      <div className="w-full max-w-xl">
        <h2 className="text-xl font-semibold text-gray-700 mb-3 text-center">選擇回合數</h2>
        <div className="grid grid-cols-4 gap-2">
          {ROUND_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setTotalRounds(n)}
              className={`
                py-4 rounded-2xl text-2xl font-extrabold border-2 transition-all duration-150
                ${totalRounds === n
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                }
              `}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-gray-400 mt-2">回合</p>
      </div>

      {/* 操作說明 */}
      <div className="w-full max-w-xl bg-blue-50 rounded-2xl border border-blue-200 p-4">
        <h3 className="text-base font-semibold text-blue-800 mb-2">📋 操作說明</h3>
        <ul className="text-sm text-blue-700 space-y-1.5">
          {mode === 'near-reach' ? (
            <>
              <li>• AR 模式：鏡頭偵測手腕進入中央目標區</li>
              <li>• 手腕停留 1.5 秒即自動記錄成功</li>
              <li>• 訓練伸手、抓握、放開等基本動作</li>
            </>
          ) : (
            <>
              <li>• AR 模式：鏡頭偵測手腕進入左、中、右目標區</li>
              <li>• 手腕停留 1.5 秒即自動記錄成功</li>
              <li>• 訓練跨越身體中線的手臂移動</li>
            </>
          )}
          <li>• 治療師可關閉 AR 改為手動按鈕記錄</li>
        </ul>
      </div>

      {/* 開始按鈕 */}
      <button
        onClick={handleStart}
        className="
          w-full max-w-sm
          bg-blue-800 text-white
          text-2xl font-bold
          min-h-[80px] rounded-2xl
          shadow-lg shadow-blue-200
          hover:bg-blue-700 active:scale-[0.97]
          transition-all duration-150
        "
      >
        開始訓練 🤲
      </button>
    </main>
  )
}
