export const WORLD_COMPANION_KEY = 'lmx:world-companion'
export const WORLD_LAST_VISIT_KEY = 'lmx:world-last-visit'
export const FAMILY_CHEER_KEY = 'lmx:family-cheer'
export const FAMILY_CHEER_EVENT = 'lmx:cheer-updated'

export interface WorldCompanionDefinition {
  id: string
  name: string
  emoji: string
  color: string
  trait: string
}

export interface FamilyCheer {
  from: string
  message: string
  updatedAt: string
}

export interface ReturnMission {
  title: string
  summary: string
  detail: string
  badge: string
  progressLabel: string
  bucket: 'd2' | 'd7'
}

export const WORLD_COMPANIONS: WorldCompanionDefinition[] = [
  { id: 'sprout', name: '嫩芽', emoji: '🌱', color: '#dcfce7', trait: '溫柔陪練' },
  { id: 'spark', name: '星火', emoji: '✨', color: '#fef3c7', trait: '鼓勵加速' },
  { id: 'captain', name: '艦長', emoji: '🧭', color: '#dbeafe', trait: '方向指引' },
]

export function taipeiDayKey(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

export function daysBetween(previous: string, current: Date = new Date()) {
  const start = new Date(`${previous}T00:00:00+08:00`)
  if (Number.isNaN(start.getTime())) return 0
  const end = new Date(`${taipeiDayKey(current)}T00:00:00+08:00`)
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
}

export function buildReturnMission(gapDays: number): ReturnMission | null {
  if (gapDays < 2) return null
  const bucket: ReturnMission['bucket'] = gapDays >= 7 ? 'd7' : 'd2'
  if (bucket === 'd7') {
    return {
      title: '回歸任務・重啟節奏',
      summary: '先完成 1 場就好，今天直接回到節奏裡。',
      detail: '紀錄不會被清空，分數也不會倒扣，我們只保留下一步。',
      badge: '7 天以上空檔',
      progressLabel: '0 / 1 場',
      bucket,
    }
  }
  return {
    title: '回歸任務・接回節奏',
    summary: '今天只要完成 1 場，就把手感接回來。',
    detail: '昨天以前的紀錄都保留，這裡只給溫和的下一步。',
    badge: '2-6 天空檔',
    progressLabel: '0 / 1 場',
    bucket,
  }
}

export function readFamilyCheer(): FamilyCheer | null {
  try {
    const raw = window.localStorage.getItem(FAMILY_CHEER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FamilyCheer>
    if (!parsed.message || !parsed.from) return null
    return {
      from: String(parsed.from).slice(0, 10),
      message: String(parsed.message).slice(0, 48),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    }
  } catch {
    return null
  }
}
