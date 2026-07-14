'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGame } from '@/context/GameContext'
import { TargetBoard }       from '@/components/game/TargetBoard'
import { CameraView }        from '@/components/game/CameraView'
import { TaskPrompt }        from '@/components/game/TaskPrompt'
import { ActionButtons }     from '@/components/game/ActionButtons'
import { TimerDisplay }      from '@/components/game/TimerDisplay'
import { RoundProgress }     from '@/components/game/RoundProgress'
import { ScoreHUD }          from '@/components/game/ScoreHUD'
import { useHandLandmarker } from '@/hooks/useHandLandmarker'
import { MODE_LABELS, FEEDBACK_DURATION_MS } from '@/lib/constants'

export default function GamePage() {
  const { state, dispatch } = useGame()
  const router = useRouter()

  // ── AR 手部辨識模型 ──────────────────────────────────────────────
  const { landmarker, isLoading: isLandmarkerLoading, error: landmarkerError } = useHandLandmarker()

  // AR / 手動 切換開關（預設開啟 AR）
  const [arMode, setArMode] = useState(true)
  const isARActive = arMode && !isLandmarkerLoading && !landmarkerError && landmarker !== null

  // ── Timers ──────────────────────────────────────────────────────
  const intervalRef        = useRef<ReturnType<typeof setInterval>  | null>(null)
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout>   | null>(null)

  // Guard: 無 session 時回首頁
  useEffect(() => {
    if (!state.session) router.replace('/')
  }, [state.session, router])

  // 計時器 — 只在 waiting 階段執行
  useEffect(() => {
    if (state.roundPhase !== 'waiting') {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }
    intervalRef.current = setInterval(() => dispatch({ type: 'TICK_TIMER' }), 1000)
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    }
  }, [state.roundPhase, dispatch])

  // Feedback 動畫結束後 → 下一回合或結束
  useEffect(() => {
    if (state.roundPhase !== 'showing-feedback') return
    if (!state.session) return

    const isLastRound = state.currentRoundIndex >= state.session.totalRounds - 1
    feedbackTimeoutRef.current = setTimeout(() => {
      if (isLastRound) dispatch({ type: 'END_GAME' })
      else             dispatch({ type: 'ADVANCE_ROUND' })
    }, FEEDBACK_DURATION_MS)

    return () => {
      if (feedbackTimeoutRef.current) { clearTimeout(feedbackTimeoutRef.current); feedbackTimeoutRef.current = null }
    }
  }, [state.roundPhase, state.currentRoundIndex, state.session, dispatch])

  // END_GAME 後導向結果頁
  useEffect(() => {
    if (state.roundPhase === 'transitioning' && state.stats !== null) {
      router.push('/results')
    }
  }, [state.roundPhase, state.stats, router])

  const handleResult = useCallback(
    (result: 'success' | 'fail') => {
      if (state.roundPhase !== 'waiting') return
      dispatch({ type: 'RECORD_RESULT', payload: result })
    },
    [state.roundPhase, dispatch]
  )

  // ── Early return ─────────────────────────────────────────────────
  if (!state.session || !state.config) return null
  const currentRound = state.session.rounds[state.currentRoundIndex]
  if (!currentRound) return null

  const completedRounds   = state.session.rounds.filter((r) => r.result !== null)
  const successCount      = completedRounds.filter((r) => r.result === 'success').length
  const isButtonsDisabled = state.roundPhase !== 'waiting'
  const lastResult        = currentRound.result

  return (
    <div className="min-h-screen flex flex-col game-screen-bg select-none game-theme-focus">

      {/* ── Top HUD ─────────────────────────────────────────────── */}
      <header className="sticky top-2 z-40 mx-auto mt-2 flex w-[calc(100%-1rem)] max-w-3xl flex-shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 hud-glass sm:flex-nowrap">
        <TimerDisplay seconds={state.elapsedSeconds} />

        <RoundProgress
          current={state.currentRoundIndex + 1}
          total={state.session.totalRounds}
          rounds={state.session.rounds}
        />

        <div className="order-2 flex items-center gap-2 sm:order-none">
          <ScoreHUD successCount={successCount} totalCompleted={completedRounds.length} />

          {/* AR 模式切換 */}
          <button
            onClick={() => setArMode((v) => !v)}
            title={arMode ? '切換為手動模式' : '切換為 AR 偵測模式'}
            className={`
              flex min-h-10 items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold
              border transition-all duration-150 no-select shadow-sm
              ${arMode
                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200'
                : 'bg-white/75 text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-700'
              }
            `}
          >
            📷 {arMode ? 'AR' : '手動'}
          </button>
        </div>
      </header>

      {/* ── 模式標籤 ────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pt-4 pb-1 flex flex-wrap justify-center gap-2">
        <span className="inline-flex min-h-9 items-center gap-1.5 bg-white/75 text-blue-800 border border-blue-200/80 rounded-full px-4 py-1 text-sm font-semibold shadow-sm backdrop-blur">
          訓練模式：{MODE_LABELS[state.session.mode]}
        </span>

        {arMode && isLandmarkerLoading && (
          <span className="inline-flex min-h-9 items-center gap-1.5 bg-amber-50/90 text-amber-700 border border-amber-200 rounded-full px-3 py-1 text-sm font-semibold shadow-sm backdrop-blur">
            <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block" />
            AI 模型載入中...
          </span>
        )}

        {arMode && landmarkerError && (
          <span className="inline-flex min-h-9 items-center gap-1.5 bg-red-50/90 text-red-700 border border-red-200 rounded-full px-3 py-1 text-sm font-semibold shadow-sm backdrop-blur">
            ⚠️ AI 載入失敗，已切換手動模式
          </span>
        )}
      </div>

      {/* ── 主要遊戲區 ──────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-between px-4 py-4 gap-4 max-w-3xl mx-auto w-full">

        {/* 任務提示 */}
        <TaskPrompt
          task={currentRound.task}
          roundNumber={state.currentRoundIndex + 1}
        />

        {/* 目標視覺區：AR 鏡頭 或 靜態目標板 */}
        <div className="w-full flex-1 flex items-center">
          {isARActive ? (
            <CameraView
              landmarker={landmarker}
              targetPosition={currentRound.task.position}
              mode={state.session.mode}
              isActive={state.roundPhase === 'waiting'}
              onSuccess={() => handleResult('success')}
            />
          ) : (
            <TargetBoard
              mode={state.session.mode}
              activeTask={currentRound.task}
            />
          )}
        </div>

        {/* 操作按鈕 */}
        <div className="w-full pb-2">
          {isARActive ? (
            <>
              <p className="text-center text-xs text-slate-500 mb-2 font-semibold">
                手部停留在目標區 1.5 秒即自動成功 ｜ 或手動覆蓋：
              </p>
              <ActionButtons
                onSuccess={() => handleResult('success')}
                onFail={() => handleResult('fail')}
                disabled={isButtonsDisabled}
                compact
              />
            </>
          ) : (
            <>
              <p className="text-center text-sm text-slate-500 mb-3 font-semibold">
                個案完成後，請按下方按鈕記錄結果
              </p>
              <ActionButtons
                onSuccess={() => handleResult('success')}
                onFail={() => handleResult('fail')}
                disabled={isButtonsDisabled}
              />
            </>
          )}
        </div>
      </main>

      {/* ── Feedback 全螢幕遮罩 ─────────────────────────────────── */}
      {state.roundPhase === 'showing-feedback' && (
        <div
          className={`
            fixed inset-0 z-50
            flex flex-col items-center justify-center
            pointer-events-none animate-feedback-in
            ${lastResult === 'success' ? 'bg-green-400/80' : 'bg-red-400/80'}
          `}
        >
          <div className="text-white text-9xl leading-none drop-shadow-lg juice-pop-in">
            {lastResult === 'success' ? '✓' : '✗'}
          </div>
          <p className="text-white text-4xl font-bold mt-4 drop-shadow">
            {lastResult === 'success' ? '成功！' : '失敗'}
          </p>
        </div>
      )}
    </div>
  )
}
