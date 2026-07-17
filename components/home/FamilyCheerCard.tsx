'use client'

import { FormEvent, useEffect, useState } from 'react'
import {
  FAMILY_CHEER_EVENT,
  FAMILY_CHEER_KEY,
  FamilyCheer,
  readFamilyCheer,
} from '@/lib/worldCompanion'

export default function FamilyCheerCard() {
  const [cheer, setCheer] = useState<FamilyCheer | null>(null)
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState('家人')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const stored = readFamilyCheer()
    setCheer(stored)
    if (stored) {
      setFrom(stored.from)
      setMessage(stored.message)
    }
  }, [])

  function save(event: FormEvent) {
    event.preventDefault()
    const next: FamilyCheer = {
      from: from.trim().slice(0, 10) || '家人',
      message: message.trim().slice(0, 48),
      updatedAt: new Date().toISOString(),
    }
    if (!next.message) return
    window.localStorage.setItem(FAMILY_CHEER_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(FAMILY_CHEER_EVENT))
    setCheer(next)
    setEditing(false)
  }

  return (
    <section className="family-cheer-card" aria-labelledby="family-cheer-title">
      <div className="family-cheer-icon" aria-hidden>💌</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black text-rose-600">溫暖補給</p>
        <h2 id="family-cheer-title" className="text-base font-extrabold text-slate-900">家人加油站</h2>
        {cheer && !editing ? (
          <blockquote className="mt-1 text-sm font-semibold text-slate-700">
            「{cheer.message}」<span className="ml-1 text-xs text-slate-500">— {cheer.from}</span>
          </blockquote>
        ) : !editing ? (
          <p className="mt-1 text-sm font-semibold text-slate-600">為今天的努力留下一句溫暖的話</p>
        ) : null}
      </div>

      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="family-cheer-edit"
          title={cheer ? '編輯鼓勵' : '留下鼓勵'}
          aria-label={cheer ? '編輯鼓勵' : '留下鼓勵'}
        >
          {cheer ? '✎' : '+'}
        </button>
      )}

      {editing && (
        <form onSubmit={save} className="mt-3 grid w-full grid-cols-[88px_1fr] gap-2 border-t border-rose-100 pt-3">
          <label className="sr-only" htmlFor="cheer-from">署名</label>
          <input
            id="cheer-from"
            value={from}
            onChange={event => setFrom(event.target.value)}
            maxLength={10}
            className="family-cheer-input"
            placeholder="署名"
          />
          <label className="sr-only" htmlFor="cheer-message">鼓勵的話</label>
          <input
            id="cheer-message"
            value={message}
            onChange={event => setMessage(event.target.value)}
            maxLength={48}
            className="family-cheer-input"
            placeholder="今天也一起加油！"
            autoFocus
          />
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="family-cheer-cancel">取消</button>
            <button type="submit" disabled={!message.trim()} className="family-cheer-save">送出鼓勵</button>
          </div>
        </form>
      )}
    </section>
  )
}
