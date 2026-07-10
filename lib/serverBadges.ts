// 榮譽徽章讀取（稱號/頭像框）— 獨立查詢＋錯誤吞噬：
// users.title/avatar_frame 欄位未建（SQL 待套用）時回空 Map，社群/排行榜照常顯示。

import { supabaseAdmin } from '@/lib/supabase'

export interface UserBadge { title: string | null; avatar_frame: string | null }

export async function fetchUserBadges(userIds: string[]): Promise<Map<string, UserBadge>> {
  const map = new Map<string, UserBadge>()
  if (!userIds.length) return map
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, title, avatar_frame')
      .in('id', Array.from(new Set(userIds)))
    if (error || !data) return map
    for (const u of data) map.set(u.id, { title: u.title ?? null, avatar_frame: u.avatar_frame ?? null })
  } catch { /* 欄位未建：無徽章 */ }
  return map
}
