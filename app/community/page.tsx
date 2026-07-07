'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'

interface Post {
  id: string; content: string; visibility: 'public' | 'private'; created_at: string
  author_name: string; author_pic: string | null; cheers: number; cheeredByMe: boolean; isMine: boolean
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return '剛剛'
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`
  if (s < 604800) return `${Math.floor(s / 86400)} 天前`
  return new Date(iso).toLocaleDateString('zh-TW')
}

export default function CommunityPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [text, setText] = useState('')
  const [vis, setVis] = useState<'public' | 'private'>('public')
  const [busy, setBusy] = useState(false)
  const [myName, setMyName] = useState('')
  const [hasNickname, setHasNickname] = useState(false)

  const load = useCallback(() => {
    fetch('/api/posts').then(r => r.json()).then(d => {
      setPosts(d.posts ?? [])
      setMyName(d.myName ?? '')
      setHasNickname(!!d.hasNickname)
    }).catch(() => setPosts([]))
  }, [])
  useEffect(() => {
    if (status === 'unauthenticated') signIn('line')
    else if (status === 'authenticated') load()
  }, [status, load])

  async function submit() {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, visibility: vis }) })
      if (res.status === 401) {
        alert('登入狀態已過期，請重新登入後再發布')
        signIn('line')
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        alert(d?.error ?? '發布失敗，請稍後再試')
        return
      }
      setText(''); load()
    } catch {
      alert('網路連線異常，發布失敗，請稍後再試')
    } finally {
      setBusy(false)
    }
  }
  async function cheer(p: Post) {
    setPosts(prev => prev?.map(x => x.id === p.id ? { ...x, cheeredByMe: !x.cheeredByMe, cheers: x.cheers + (x.cheeredByMe ? -1 : 1) } : x) ?? null)
    await fetch('/api/posts/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: p.id }) })
  }
  async function del(p: Post) {
    if (!confirm('刪除這篇貼文？')) return
    setPosts(prev => prev?.filter(x => x.id !== p.id) ?? null)
    await fetch(`/api/posts?id=${p.id}`, { method: 'DELETE' })
  }

  if (status === 'loading' || !session) return <div className="min-h-screen flex items-center justify-center text-slate-400">載入中…</div>

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-xl mx-auto flex items-center justify-between px-4 py-3">
          <button onClick={() => router.push('/')} className="text-slate-500 font-semibold">← 首頁</button>
          <p className="font-extrabold text-slate-800">💬 復能社群</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-3 py-3 flex flex-col gap-3">
        {/* 發文 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 shrink-0">
              {session.user.image ? <img src={session.user.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🙂</div>}
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} maxLength={500} rows={3}
              placeholder="今天訓練的心情或心得？想抒發什麼都可以…" className="flex-1 resize-none outline-none text-slate-800 placeholder:text-slate-400 bg-slate-50 rounded-xl p-3" />
          </div>
          {myName && (
            <p className="text-xs text-slate-500 mt-2">
              將以 <strong className="text-slate-700">{myName}</strong> 發布
              {!hasNickname && <button onClick={() => router.push('/profile')} className="ml-1 text-blue-600 font-semibold">想匿名？設定暱稱 ›</button>}
            </p>
          )}
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-1.5">
              <button onClick={() => setVis('public')} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${vis === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>🌍 公開</button>
              <button onClick={() => setVis('private')} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${vis === 'private' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>🔒 只有自己</button>
            </div>
            <button onClick={submit} disabled={!text.trim() || busy} className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-40 active:scale-95">發布</button>
          </div>
        </div>

        {/* 動態牆 */}
        {!posts ? <p className="text-center text-slate-400 py-8">載入動態…</p>
          : posts.length === 0 ? <p className="text-center text-slate-400 py-8">還沒有人發文，當第一個吧！</p>
          : posts.map(p => (
            <article key={p.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 shrink-0">
                  {p.author_pic ? <img src={p.author_pic} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">🙂</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">{p.author_name}{p.isMine && <span className="text-xs text-slate-400 font-normal">（我）</span>}</p>
                  <p className="text-xs text-slate-400">{timeAgo(p.created_at)} · {p.visibility === 'private' ? '🔒 只有自己' : '🌍 公開'}</p>
                </div>
                {p.isMine && <button onClick={() => del(p)} className="text-slate-300 hover:text-red-500 text-sm">刪除</button>}
              </div>
              <p className="text-slate-700 mt-3 whitespace-pre-wrap leading-relaxed">{p.content}</p>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => cheer(p)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${p.cheeredByMe ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                  💪 加油 {p.cheers > 0 && <span>{p.cheers}</span>}
                </button>
              </div>
            </article>
          ))}
      </main>
    </div>
  )
}
