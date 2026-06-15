import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 前端用（只讀公開資料）
export const supabase = createClient(url, anon)

// 後端 API route 用（有完整讀寫權限）
export const supabaseAdmin = createClient(url, svc)

// ── Types ──────────────────────────────────────────────────────

export interface DbUser {
  id:           string
  line_id:      string
  display_name: string
  picture_url:  string | null
  total_points: number
  created_at:   string
}

export interface DbGameSession {
  id:              string
  user_id:         string
  game_type:       string
  difficulty:      string
  score:           number
  hits:            number
  misses:          number
  accuracy:        number
  avg_reaction_ms: number | null
  highest_reach:   number | null
  left_hits:       number
  right_hits:      number
  center_hits:     number
  duration_secs:   number
  points_earned:   number
  created_at:      string
}

export interface DbAchievement {
  id:              string
  name:            string
  description:     string
  icon:            string
  condition_type:  string
  condition_value: number
  points_bonus:    number
}

export interface DbPrize {
  id:           string
  name:         string
  description:  string | null
  image_emoji:  string
  points_cost:  number
  stock:        number | null
  category:     string
}

export interface DbRedemption {
  id:           string
  prize_id:     string
  points_spent: number
  status:       string
  created_at:   string
  prizes:       DbPrize
}
