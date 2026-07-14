'use client'

import type { Task, GameMode, TaskPosition } from '@/types/game'

interface TargetBoardProps {
  mode: GameMode
  activeTask: Task
}

interface ZoneConfig {
  position: TaskPosition
  label: string
  shortLabel: string
}

const LATERAL_ZONES: ZoneConfig[] = [
  { position: 'left',   label: '左側',  shortLabel: '左' },
  { position: 'center', label: '中間',  shortLabel: '中' },
  { position: 'right',  label: '右側',  shortLabel: '右' },
]

const NEAR_ZONE: ZoneConfig = {
  position: 'center',
  label: '正前方',
  shortLabel: '前方',
}

interface ZoneBoxProps {
  config: ZoneConfig
  task: Task
  isActive: boolean
}

function ZoneBox({ config, task, isActive }: ZoneBoxProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center
        rounded-2xl border-4 transition-all duration-300
        no-select relative overflow-hidden
        ${isActive
          ? `${task.colorClass} animate-target-pulse shadow-xl soft-highlight`
          : 'bg-white/55 border-white/70 opacity-75 shadow-inner backdrop-blur-sm'
        }
      `}
      style={{
        // Active zone slightly bigger
        flex: isActive ? '1.4' : '1',
        minHeight: isActive ? '160px' : '120px',
      }}
    >
      {isActive && (
        <>
          {/* Decorative inner glow */}
          <div className="absolute inset-0 rounded-2xl opacity-25 bg-white" />
          <div className="relative z-10 mb-2 grid h-16 w-16 place-items-center rounded-full bg-white/70 text-4xl shadow-inner">{task.emoji}</div>
          <div className={`relative z-10 text-xl font-black ${task.labelColor}`}>
            {config.label}
          </div>
          <div className={`relative z-10 text-sm font-bold ${task.labelColor} opacity-70 mt-0.5`}>
            目標位置
          </div>
        </>
      )}
      {!isActive && (
        <div className="text-slate-400 text-lg font-bold">{config.shortLabel}</div>
      )}
    </div>
  )
}

export function TargetBoard({ mode, activeTask }: TargetBoardProps) {
  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Table surface label */}
      <div className="text-center text-sm text-slate-500 font-bold mb-2 tracking-wide uppercase">
        訓練桌面區域
      </div>

      {/* Board */}
      <div
        className="
          w-full rounded-3xl
          game-stage-frame
          p-4 sm:p-5
        "
        style={{ minHeight: '220px' }}
      >
        {mode === 'near-reach' ? (
          /* Near-reach: single large centered zone */
          <div className="flex items-center justify-center h-full" style={{ minHeight: '170px' }}>
            <div
              className={`
                w-3/4 max-w-xs
                flex flex-col items-center justify-center
                rounded-2xl border-4
                p-8 animate-target-pulse shadow-xl soft-highlight
                ${activeTask.colorClass}
              `}
              style={{ minHeight: '160px' }}
            >
              <div className="mb-3 grid h-20 w-20 place-items-center rounded-full bg-white/70 text-5xl shadow-inner">{activeTask.emoji}</div>
              <div className={`text-2xl font-black ${activeTask.labelColor}`}>
                {NEAR_ZONE.label}
              </div>
              <div className={`text-sm font-bold ${activeTask.labelColor} opacity-70 mt-1`}>
                目標位置
              </div>
            </div>
          </div>
        ) : (
          /* Lateral: three zones */
          <div className="flex gap-3 items-center h-full" style={{ minHeight: '170px' }}>
            {LATERAL_ZONES.map((zone) => (
              <ZoneBox
                key={zone.position}
                config={zone}
                task={activeTask}
                isActive={activeTask.position === zone.position}
              />
            ))}
          </div>
        )}
      </div>

      {/* Arrow hint for lateral mode */}
      {mode === 'lateral' && (
        <div className="flex justify-between px-2 mt-1.5">
          <span className="text-sm text-gray-400">← 個案左側</span>
          <span className="text-sm text-gray-400">個案右側 →</span>
        </div>
      )}
    </div>
  )
}
