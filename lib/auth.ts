import type { NextAuthOptions } from 'next-auth'
import LineProvider from 'next-auth/providers/line'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from './supabase'

// 雙軌登入：個案走 LINE；治療師/機構管理者可走 Email+密碼（Credentials）。
// Email 帳號由機構管理者在 /api/org 建立（supabase-rbac.sql 套用後生效）。

export const authOptions: NextAuthOptions = {
  providers: [
    LineProvider({
      clientId:     process.env.LINE_CLIENT_ID!,
      clientSecret: process.env.LINE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      id: 'credentials',
      name: '專業人員登入',
      credentials: {
        email:    { label: 'Email', type: 'email' },
        password: { label: '密碼', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password ?? ''
        if (!email || !password) return null
        const { data: u, error } = await supabaseAdmin
          .from('users')
          .select('id, display_name, picture_url, password_hash, role')
          .eq('email', email)
          .maybeSingle()
        if (error || !u?.password_hash) return null                       // 欄位未建/帳號不存在
        if (!['therapist', 'org_admin'].includes(u.role)) return null    // 只限專業帳號
        const ok = await bcrypt.compare(password, u.password_hash)
        if (!ok) return null
        return { id: u.id, name: u.display_name, image: u.picture_url }
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'credentials') return true   // authorize 已驗證
      if (account?.provider !== 'line') return false
      const lineId = account.providerAccountId

      // Upsert user in Supabase
      const { error } = await supabaseAdmin
        .from('users')
        .upsert(
          {
            line_id:      lineId,
            display_name: user.name ?? '使用者',
            picture_url:  user.image ?? null,
            updated_at:   new Date().toISOString(),
          },
          { onConflict: 'line_id' }
        )
      if (error) console.error('signIn upsert error', error)
      return true
    },

    async session({ session, token }) {
      // Credentials 登入直接用 userId；LINE 登入沿用 line_id 對應
      let data: { id: string; total_points: number; display_name: string; picture_url: string | null } | null = null
      if (token.userId) {
        const res = await supabaseAdmin
          .from('users')
          .select('id, total_points, display_name, picture_url')
          .eq('id', token.userId as string)
          .single()
        data = res.data
      } else if (token.lineId) {
        const res = await supabaseAdmin
          .from('users')
          .select('id, total_points, display_name, picture_url')
          .eq('line_id', token.lineId as string)
          .single()
        data = res.data
      }
      if (data) {
        session.user.id           = data.id
        session.user.totalPoints  = data.total_points
        session.user.displayName  = data.display_name
        session.user.image        = data.picture_url
      }
      return session
    },

    async jwt({ token, account, user }) {
      if (account?.provider === 'line') {
        token.lineId = account.providerAccountId
      }
      if (account?.provider === 'credentials' && user?.id) {
        token.userId = user.id
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
}
