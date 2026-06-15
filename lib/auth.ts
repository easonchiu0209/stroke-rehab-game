import type { NextAuthOptions } from 'next-auth'
import LineProvider from 'next-auth/providers/line'
import { supabaseAdmin } from './supabase'

export const authOptions: NextAuthOptions = {
  providers: [
    LineProvider({
      clientId:     process.env.LINE_CLIENT_ID!,
      clientSecret: process.env.LINE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
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
      // Attach our DB user id + points to the session
      if (token.lineId) {
        const { data } = await supabaseAdmin
          .from('users')
          .select('id, total_points, display_name, picture_url')
          .eq('line_id', token.lineId as string)
          .single()

        if (data) {
          session.user.id           = data.id
          session.user.totalPoints  = data.total_points
          session.user.displayName  = data.display_name
          session.user.image        = data.picture_url
        }
      }
      return session
    },

    async jwt({ token, account }) {
      if (account?.provider === 'line') {
        token.lineId = account.providerAccountId
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
}
