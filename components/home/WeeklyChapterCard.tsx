'use client'

import { useEffect } from 'react'
import { buildWeeklyJourney, RetentionSession } from '@/lib/retentionAgent'
import { recordProductRetentionEvent } from '@/lib/retentionEvents'

interface WeeklyChapterCardProps {
  sessions: RetentionSession[]
  signedIn: boolean
  onLogin: () => void
  onLaunchGame: (game: { id: string; emoji: string; route: string; title?: string; name?: string }, source: string) => void
}

export default function WeeklyChapterCard({ sessions, signedIn, onLogin, onLaunchGame }: WeeklyChapterCardProps) {
  const journey = buildWeeklyJourney(sessions)

  useEffect(() => {
    if (!signedIn || !journey.completed) return
    recordProductRetentionEvent(
      'weekly_chapter_complete',
      {
        weekKey: journey.weekKey,
        chapterId: journey.chapter.id,
        sessions: journey.sessions,
        activeDays: journey.activeDays,
        playedGames: journey.playedGames,
      },
      `weekly_chapter_complete:${journey.weekKey}`,
    )
  }, [journey.activeDays, journey.chapter.id, journey.completed, journey.playedGames, journey.sessions, journey.weekKey, signedIn])

  return (
    <section className="weekly-chapter" aria-labelledby="weekly-chapter-title">
      <div className="weekly-chapter-heading">
        <div className="weekly-chapter-emblem" style={{ backgroundColor: journey.chapter.accent }} aria-hidden>
          {journey.chapter.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase text-slate-500">本週故事章節</p>
          <h2 id="weekly-chapter-title" className="text-lg font-black text-slate-900">{journey.chapter.title}</h2>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-600">{journey.chapter.story}</p>
        </div>
        {journey.completed && <span className="weekly-complete-badge">已完成</span>}
      </div>

      <div className="weekly-milestones" aria-label="本週章節進度">
        {journey.milestones.map((milestone, index) => (
          <div key={milestone.id} className={`weekly-milestone ${milestone.complete ? 'is-complete' : ''}`}>
            <span className="weekly-milestone-dot">{milestone.complete ? '✓' : index + 1}</span>
            <strong>{milestone.label}</strong>
            <small>{milestone.detail}</small>
          </div>
        ))}
      </div>

      <div className="weekly-chapter-footer">
        <p>
          {journey.completed
            ? `本週章節完成！你用了 ${journey.activeDays} 天點亮晨光小鎮。`
            : signedIn
              ? `本週 ${journey.sessions} 場 · ${journey.activeDays} 天 · 已探索 ${journey.playedGames}/4 款旗艦`
              : '登入後會依你的完成紀錄保存每週進度'}
        </p>
        <button
          type="button"
          onClick={() => signedIn ? onLaunchGame(journey.nextGame, 'weekly-chapter') : onLogin()}
          className="weekly-chapter-action"
        >
          <span aria-hidden>{signedIn ? journey.nextGame.emoji : '▶'}</span>
          <span>{signedIn ? `前往 ${journey.nextGame.name}` : '登入展開旅程'}</span>
        </button>
      </div>
    </section>
  )
}
