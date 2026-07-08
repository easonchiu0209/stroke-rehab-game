'use client'

// 專業人員登入（治療師/機構管理者）：Email + 密碼（Credentials provider）。
// 個案仍走 /login 的 LINE 登入，互不影響。

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function ProLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await signIn('credentials', { email, password, redirect: false })
    setBusy(false)
    if (res?.ok) router.push('/therapist')
    else setError('Email 或密碼不正確（或帳號尚未開通）')
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 flex flex-col items-center justify-center px-6 gap-8">
      <div className="text-center">
        <div className="text-6xl mb-3">🩺</div>
        <h1 className="text-3xl font-extrabold text-slate-900">專業人員登入</h1>
        <p className="text-slate-500 mt-1">治療師與機構管理者專用</p>
      </div>

      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
        <div>
          <label className="text-sm font-semibold text-slate-600 block mb-1">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-3 text-slate-800 bg-slate-50 outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-600 block mb-1">密碼</label>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-3 text-slate-800 bg-slate-50 outline-none focus:border-slate-400" />
        </div>
        {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full py-4 rounded-xl bg-slate-800 text-white font-extrabold text-lg active:scale-[0.97] disabled:opacity-50">
          {busy ? '登入中…' : '登入'}
        </button>
      </form>

      <div className="text-center text-sm text-slate-400">
        <p>帳號由機構管理者開通；忘記密碼請聯絡管理者。</p>
        <a href="/login" className="underline">我是個案，用 LINE 登入 →</a>
      </div>
    </main>
  )
}
