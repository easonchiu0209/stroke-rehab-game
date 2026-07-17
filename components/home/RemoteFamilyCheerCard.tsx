'use client'

import { FormEvent, useEffect, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import {
  type FamilyCheerLinkView,
  type FamilyCheerStatusResponse,
} from '@/lib/familyCheer'

type ActionResult = {
  ok?: boolean
  link?: FamilyCheerLinkView | null
  note?: string | null
  error?: string
}

const EMPTY_PRIVACY = {
  allowNameShare: true,
  allowPictureShare: false,
  allowProgressShare: false,
  allowAlertsShare: true,
}

export default function RemoteFamilyCheerCard() {
  const { status } = useSession()
  const [state, setState] = useState<FamilyCheerStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteNote, setInviteNote] = useState('')
  const [cheerText, setCheerText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privacy, setPrivacy] = useState(EMPTY_PRIVACY)

  async function refresh() {
    if (status !== 'authenticated') {
      setState(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/family-cheer')
      const data = (await res.json()) as FamilyCheerStatusResponse & { error?: string }
      if (!res.ok) throw new Error(data.error || data.note || '無法載入遠端家人資訊')
      setState(data)
      const active = data.activeLink
      if (active) {
        setPrivacy({
          allowNameShare: active.allowNameShare,
          allowPictureShare: active.allowPictureShare,
          allowProgressShare: active.allowProgressShare,
          allowAlertsShare: active.allowAlertsShare,
        })
      }
    } catch (err) {
      setState({
        links: [],
        activeLink: null,
        remoteAvailable: false,
        schemaReady: false,
        note: err instanceof Error ? err.message : '遠端家人功能暫時無法使用',
      })
      setError(err instanceof Error ? err.message : '遠端家人功能暫時無法使用')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const activeLink = state?.activeLink ?? null
  const patientLink = activeLink?.role === 'patient' ? activeLink : null
  const supporterLink = activeLink?.role === 'supporter' ? activeLink : null

  async function postAction(action: string, payload: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/family-cheer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const data = (await res.json()) as ActionResult
      if (!res.ok || !data.ok) throw new Error(data.note || data.error || '動作失敗')
      await refresh()
      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : '動作失敗'
      setError(message)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function createInvite(event: FormEvent) {
    event.preventDefault()
    await postAction('create_invite', { note: inviteNote })
  }

  async function acceptInvite(event: FormEvent) {
    event.preventDefault()
    await postAction('accept_invite', { inviteCode })
  }

  async function savePrivacy() {
    if (!activeLink) return
    await postAction('update_privacy', {
      linkId: activeLink.id,
      ...privacy,
    })
  }

  async function revokeLink() {
    if (!activeLink) return
    await postAction('revoke_link', { linkId: activeLink.id })
  }

  async function sendCheer(event: FormEvent) {
    event.preventDefault()
    if (!supporterLink) return
    await postAction('send_cheer', {
      linkId: supporterLink.id,
      message: cheerText,
    })
    setCheerText('')
  }

  const remoteNote = state?.note ?? null
  const latestMessage = activeLink?.latestMessage

  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 border border-rose-100">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-rose-100 text-2xl" aria-hidden>
          💞
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-wide text-rose-500">遠端家人鼓勵 v1</p>
          <h2 className="text-lg font-extrabold text-slate-900">單向鼓勵與隱私權限</h2>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-600">
            先用邀請碼連線，家人可送溫暖訊息；患者端可調整是否分享姓名、照片與進度。
          </p>
        </div>
      </div>

      {!state || loading ? (
        <p className="mt-3 text-sm font-semibold text-slate-500">讀取遠端家人狀態中…</p>
      ) : null}

      {status !== 'authenticated' ? (
        <div className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-bold">先登入，才能建立遠端家人關係</p>
          <button type="button" onClick={() => signIn('line')} className="mt-3 rounded-full bg-rose-600 px-4 py-2 font-bold text-white">
            LINE 登入
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {remoteNote && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {remoteNote}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {error}
            </div>
          )}

          {!activeLink ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <form onSubmit={createInvite} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-extrabold text-slate-900">我是患者，建立邀請碼</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">把邀請碼傳給家人，他輸入後就能送單向鼓勵。</p>
                <label className="mt-3 block text-xs font-bold text-slate-600" htmlFor="invite-note">給家人的備註</label>
                <input
                  id="invite-note"
                  value={inviteNote}
                  onChange={event => setInviteNote(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                  placeholder="例如：請多鼓勵我每天練習"
                  maxLength={80}
                />
                <button disabled={busy} type="submit" className="mt-3 w-full rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  產生邀請碼
                </button>
              </form>

              <form onSubmit={acceptInvite} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-extrabold text-slate-900">我是家人，輸入邀請碼</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">加入後只能送鼓勵，無法看到不被分享的隱私資料。</p>
                <label className="mt-3 block text-xs font-bold text-slate-600" htmlFor="invite-code">邀請碼</label>
                <input
                  id="invite-code"
                  value={inviteCode}
                  onChange={event => setInviteCode(event.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm tracking-[0.2em] uppercase outline-none focus:border-rose-400"
                  placeholder="A1B2C3D4"
                  maxLength={16}
                />
                <button disabled={busy || !inviteCode.trim()} type="submit" className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  加入關係
                </button>
              </form>
            </div>
          ) : activeLink.role === 'patient' ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">你的邀請碼</p>
                    <p className="text-xs text-slate-600">分享給家人，讓對方加入後送鼓勵。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(activeLink.inviteCode).catch(() => {})}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-rose-700"
                  >
                    複製
                  </button>
                </div>
                <div className="mt-3 rounded-xl bg-white px-3 py-2 font-mono text-lg font-black tracking-[0.2em] text-rose-700">
                  {activeLink.inviteCode}
                </div>
                <p className="mt-2 text-xs text-rose-900/80">
                  狀態：{activeLink.status === 'pending' ? '等待家人加入' : '已連線'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-extrabold text-slate-900">隱私權限</p>
                <p className="mt-1 text-xs text-slate-500">只有你可以調整這些設定。</p>
                <div className="mt-3 grid gap-2 text-sm">
                  {([
                    ['allowNameShare', '分享姓名'],
                    ['allowPictureShare', '分享照片'],
                    ['allowProgressShare', '分享進度'],
                    ['allowAlertsShare', '分享提醒'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                      <span className="font-semibold text-slate-700">{label}</span>
                      <input
                        type="checkbox"
                        checked={privacy[key]}
                        onChange={event => setPrivacy(prev => ({ ...prev, [key]: event.target.checked }))}
                      />
                    </label>
                  ))}
                </div>
                <button disabled={busy} type="button" onClick={savePrivacy} className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  儲存隱私設定
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-extrabold text-slate-900">最新鼓勵</p>
                {latestMessage ? (
                  <blockquote className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    「{latestMessage.message}」
                    <span className="ml-2 text-xs text-slate-500">— {latestMessage.senderName}</span>
                  </blockquote>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">還沒有家人送來鼓勵。</p>
                )}
              </div>

              <button disabled={busy} type="button" onClick={revokeLink} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">
                解除這段關係
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                <p className="text-sm font-extrabold text-slate-900">你正在支持 {activeLink.patientName}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {activeLink.allowProgressShare ? '可以看到部分訓練進度。' : '目前只送鼓勵，不分享進度。'}
                </p>
              </div>

              <form onSubmit={sendCheer} className="rounded-xl border border-slate-200 p-3">
                <label className="block text-xs font-bold text-slate-600" htmlFor="cheer-message">送一句鼓勵</label>
                <textarea
                  id="cheer-message"
                  value={cheerText}
                  onChange={event => setCheerText(event.target.value)}
                  className="mt-1 min-h-[92px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  placeholder="今天的練習很棒，慢慢來，我在你旁邊。"
                  maxLength={80}
                />
                <button disabled={busy || !cheerText.trim()} type="submit" className="mt-3 w-full rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  送出單向鼓勵
                </button>
              </form>

              {latestMessage ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-extrabold text-slate-900">最近送出的訊息</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">「{latestMessage.message}」</p>
                </div>
              ) : null}

              <button disabled={busy} type="button" onClick={revokeLink} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">
                解除這段關係
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
