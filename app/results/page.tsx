'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGame } from '@/context/GameContext'
import { SessionSummary } from '@/components/results/SessionSummary'
import { ResultStat } from '@/components/results/ResultStat'
import { MODE_LABELS } from '@/lib/constants'
import { formatMs } from '@/lib/gameLogic'

export default function ResultsPage() {
  const { state, dispatch } = useGame()
  const router = useRouter()

  // Guard: redirect to home if no stats
  useEffect(() => {
    if (!state.stats || !state.session) {
      router.replace('/')
    }
  }, [state.stats, state.session, router])

  if (!state.stats || !state.session) return null

  const { stats, session } = state
  const modeName = MODE_LABELS[session.mode]

  function handlePlayAgain() {
    dispatch({ type: 'RESET' })
    router.push('/game/setup')
  }

  function handleHome() {
    dispatch({ type: 'RESET' })
    router.push('/')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10 gap-6 bg-gradient-to-b from-green-50 to-gray-50">

      {/* Summary header */}
      <SessionSummary accuracy={stats.accuracy} modeName={modeName} />

      {/* Stats grid */}
      <div className="flex flex-wrap gap-4 justify-center w-full max-w-xl mt-2">
        <ResultStat
          label="成功次數"
          value={stats.successCount}
          unit={` / ${session.totalRounds} 回合`}
          accentClass="text-green-600"
          icon="✅"
        />
        <ResultStat
          label="失敗次數"
          value={stats.failCount}
          accentClass="text-red-500"
          icon="❌"
        />
        <ResultStat
          label="總訓練時間"
          value={formatMs(stats.totalDuration)}
          accentClass="text-blue-700"
          icon="⏱️"
        />
        <ResultStat
          label="平均每回合"
          value={stats.avgRoundDuration > 0 ? formatMs(stats.avgRoundDuration) : '—'}
          accentClass="text-indigo-600"
          icon="📊"
        />
      </div>

      {/* Round breakdown */}
      <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-700 mb-3">回合明細</h3>
        <div className="flex flex-col gap-2">
          {session.rounds.map((round, i) => (
            <div
              key={i}
              className={`
                flex items-center justify-between
                rounded-xl px-4 py-3
                ${round.result === 'success'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {round.result === 'success' ? '✅' : '❌'}
                </span>
                <div>
                  <p className="text-base font-semibold text-gray-800">
                    第 {i + 1} 回合
                  </p>
                  <p className="text-sm text-gray-500">{round.task.instruction}</p>
                </div>
              </div>
              <div className="text-right text-sm text-gray-400">
                {round.endTime && round.startTime
                  ? `${((round.endTime - round.startTime) / 1000).toFixed(1)} 秒`
                  : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl mt-2">
        <button
          onClick={handleHome}
          className="
            flex-1 bg-white text-blue-800
            border-2 border-blue-800
            text-xl font-bold
            min-h-[68px] rounded-2xl
            hover:bg-blue-50 active:scale-[0.97]
            transition-all duration-150
            no-select
          "
        >
          🏠 回首頁
        </button>
        <button
          onClick={handlePlayAgain}
          className="
            flex-1 bg-blue-800 text-white
            text-xl font-bold
            min-h-[68px] rounded-2xl
            shadow-lg shadow-blue-200
            hover:bg-blue-700 active:scale-[0.97]
            transition-all duration-150
            no-select
          "
        >
          🔄 再次訓練
        </button>
      </div>
    </main>
  )
}
