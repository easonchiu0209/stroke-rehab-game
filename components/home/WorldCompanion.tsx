'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  buildReturnMission,
  daysBetween,
  FAMILY_CHEER_EVENT,
  FamilyCheer,
  readFamilyCheer,
  taipeiDayKey,
  WORLD_COMPANION_KEY,
  WORLD_COMPANIONS,
  WORLD_LAST_VISIT_KEY,
} from '@/lib/worldCompanion'
import { recordProductRetentionEvent } from '@/lib/retentionEvents'

interface WorldCompanionProps {
  displayName?: string
  signedIn: boolean
  streak: number
  weekCount: number
}

export default function WorldCompanion({ displayName, signedIn, streak, weekCount }: WorldCompanionProps) {
  const [companionId, setCompanionId] = useState(WORLD_COMPANIONS[0].id)
  const [choosing, setChoosing] = useState(false)
  const [returnDays, setReturnDays] = useState(0)
  const [cheer, setCheer] = useState<FamilyCheer | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem(WORLD_COMPANION_KEY)
    if (WORLD_COMPANIONS.some(item => item.id === stored)) setCompanionId(stored!)

    const todayKey = taipeiDayKey()
    const lastVisit = window.localStorage.getItem(WORLD_LAST_VISIT_KEY)
    if (lastVisit) {
      const gap = daysBetween(lastVisit)
      setReturnDays(gap)
      if (gap === 2 || gap >= 7) {
        const bucket = gap >= 7 ? 'd7' : 'd2'
        recordProductRetentionEvent(
          'return_visit',
          {
            bucket,
            gapDays: gap,
            companionId: stored ?? companionId,
          },
          `return_visit:${bucket}:${todayKey}`,
        )
      }
    } else {
      setReturnDays(0)
    }
    window.localStorage.setItem(WORLD_LAST_VISIT_KEY, todayKey)

    const refreshCheer = () => setCheer(readFamilyCheer())
    refreshCheer()
    window.addEventListener(FAMILY_CHEER_EVENT, refreshCheer)
    window.addEventListener('storage', refreshCheer)
    return () => {
      window.removeEventListener(FAMILY_CHEER_EVENT, refreshCheer)
      window.removeEventListener('storage', refreshCheer)
    }
  }, [])

  const companion = WORLD_COMPANIONS.find(item => item.id === companionId) ?? WORLD_COMPANIONS[0]
  const returnMission = useMemo(() => buildReturnMission(returnDays), [returnDays])
  const message = useMemo(() => {
    const name = displayName ?? '朋友'
    if (returnMission) return `${name}，回來就先接回節奏，不清空、不倒扣。`
    if (cheer) return `${cheer.from}送你一句：${cheer.message}`
    if (!signedIn) return '先登入也沒關係，我會把節奏留在這裡。'
    if (weekCount >= 3) return `這週已經完成 ${weekCount} 場了，繼續保持。`
    if (streak >= 2) return `連續 ${streak} 天了，節奏很穩。`
    return `${name}，今天只要多完成一場就很好。`
  }, [cheer, displayName, returnMission, signedIn, streak, weekCount])

  function selectCompanion(id: string) {
    setCompanionId(id)
    window.localStorage.setItem(WORLD_COMPANION_KEY, id)
    setChoosing(false)
  }

  return (
    <div className="world-companion">
      {choosing ? (
        <div className="world-companion-picker" role="dialog" aria-label="選擇陪伴角色">
          <div className="flex items-center justify-between gap-2">
            <strong>選擇陪伴角色</strong>
            <button type="button" onClick={() => setChoosing(false)} className="world-icon-button" title="關閉">×</button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {WORLD_COMPANIONS.map(item => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === companionId}
                onClick={() => selectCompanion(item.id)}
                className="world-companion-option"
              >
                <span style={{ backgroundColor: item.color }}>{item.emoji}</span>
                <strong>{item.name}</strong>
                <small>{item.trait}</small>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="world-companion-speech" role="status" aria-live="polite">
          <strong>{companion.name}</strong>
          <p>{message}</p>
          {returnMission && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-slate-800 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm font-extrabold text-amber-900">回歸保護</strong>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-amber-700">
                  {returnMission.badge}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">
                {returnMission.summary}
              </p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                {returnMission.detail}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs font-black text-amber-800">
                <span>{returnMission.progressLabel}</span>
                <span>今天回來就算進度</span>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setChoosing(value => !value)}
        className="world-companion-avatar"
        style={{ backgroundColor: companion.color }}
        title="切換陪伴角色"
        aria-label={`切換陪伴角色，目前是 ${companion.name}`}
      >
        <span aria-hidden>{companion.emoji}</span>
      </button>
    </div>
  )
}
