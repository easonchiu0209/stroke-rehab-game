'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  EDUCATION_ARTICLES,
  EDUCATION_CATEGORIES,
  EDUCATION_RESOURCES,
  EDUCATION_VERIFIED_AT,
  EducationCategory,
  sourceStatus,
} from '@/lib/educationContent'
import type { EducationUpdateReport } from '@/lib/educationUpdateAgent'

type CategoryFilter = 'all' | EducationCategory

function formatDate(value: string) {
  return value.replaceAll('-', '/')
}

export default function EducationPage() {
  const router = useRouter()
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [scanReport, setScanReport] = useState<EducationUpdateReport | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  async function runScan() {
    setScanBusy(true)
    setScanError(null)
    try {
      const response = await fetch('/api/education/update-agent')
      if (!response.ok) throw new Error(`掃描失敗（HTTP ${response.status}）`)
      const report = await response.json() as EducationUpdateReport
      setScanReport(report)
    } catch (error) {
      setScanError(error instanceof Error ? error.message : '掃描失敗')
    } finally {
      setScanBusy(false)
    }
  }

  useEffect(() => {
    void runScan()
  }, [])

  const articles = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return EDUCATION_ARTICLES.filter(article => {
      if (category !== 'all' && article.category !== category) return false
      if (!normalized) return true
      return [article.title, article.summary, article.audience, ...article.takeaways]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    })
  }, [category, query])

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xl text-slate-700"
            title="返回首頁"
            aria-label="返回首頁"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-slate-900">衛教與資源</h1>
            <p className="text-xs font-semibold text-slate-500">官方來源 · 查證日期 {formatDate(EDUCATION_VERIFIED_AT)}</p>
          </div>
          <span className="hidden rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 sm:inline">可信來源</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
        <section className="overflow-hidden rounded-xl border-2 border-red-300 bg-red-50" aria-labelledby="emergency-title">
          <div className="flex items-start gap-3 p-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-red-600 text-2xl text-white" aria-hidden>!</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-red-700">緊急警訊</p>
              <h2 id="emergency-title" className="text-lg font-black text-red-950">突然臉歪、手無力或說話不清</h2>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-red-900">立即撥打 119。不要等待症狀自行恢復，也不要先完成訓練。</p>
            </div>
          </div>
          <a href="tel:119" className="flex min-h-12 items-center justify-center gap-2 bg-red-700 px-4 font-black text-white">
            <span aria-hidden>☎</span><span>撥打 119</span>
          </a>
        </section>

        <section aria-labelledby="resources-title">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="resources-title" className="text-base font-black text-slate-800">常用資源</h2>
            <span className="text-xs font-semibold text-slate-500">台灣官方服務</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {EDUCATION_RESOURCES.map(resource => {
              const external = resource.href.startsWith('http')
              return (
                <a
                  key={resource.id}
                  href={resource.href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  className="flex min-h-[84px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-blue-300"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-50 text-2xl" aria-hidden>{resource.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-slate-900">{resource.title}</strong>
                    <small className="mt-0.5 block text-xs leading-snug text-slate-500">{resource.description}</small>
                  </span>
                  <span className="text-blue-600" aria-hidden>›</span>
                </a>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="update-agent-title">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-emerald-700">每月更新 Agent</p>
              <h2 id="update-agent-title" className="text-lg font-black text-slate-900">衛教內容候選差異掃描</h2>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-600">
                掃描白名單來源，只產生候選差異與人工複查線索，不會直接改寫正式醫療主張。
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void runScan() }}
              disabled={scanBusy}
              className="min-h-11 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60"
            >
              {scanBusy ? '掃描中…' : '重新掃描'}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <p className="text-[11px] font-black text-emerald-700">來源</p>
              <p className="text-xl font-black text-emerald-900">{scanReport?.sourceCount ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2">
              <p className="text-[11px] font-black text-blue-700">文章</p>
              <p className="text-xl font-black text-blue-900">{scanReport?.articleCount ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2">
              <p className="text-[11px] font-black text-amber-700">候選差異</p>
              <p className="text-xl font-black text-amber-900">{scanReport?.candidateCount ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-black text-slate-600">查證狀態</p>
              <p className="text-sm font-black text-slate-900">{scanReport ? '已掃描' : '待掃描'}</p>
            </div>
          </div>

          {scanError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {scanError}
            </p>
          )}

          {scanReport && scanReport.candidateDiffs.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {scanReport.candidateDiffs.map(candidate => (
                <article key={candidate.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-amber-700">
                        {candidate.sourceName}
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                          {candidate.priority === 'high' ? '高優先' : candidate.priority === 'medium' ? '中優先' : '低優先'}
                        </span>
                      </p>
                      <h3 className="mt-0.5 text-sm font-black text-slate-900">{candidate.articleTitles.join(' / ')}</h3>
                    </div>
                    <a
                      href={candidate.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-amber-200 bg-white px-2 py-1 text-[11px] font-black text-amber-700"
                    >
                      原始來源
                    </a>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">{candidate.reason}</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">提議：{candidate.proposedAction}</p>
                </article>
              ))}
            </div>
          ) : scanReport ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              這次掃描沒有需要立即處理的候選差異；正式內容維持不變。
            </p>
          ) : null}
        </section>

        <section className="border-y border-slate-200 bg-white px-3 py-3 sm:rounded-lg sm:border" aria-label="搜尋與分類">
          <label htmlFor="education-search" className="sr-only">搜尋衛教與長照資源</label>
          <div className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <span className="text-lg" aria-hidden>⌕</span>
            <input
              id="education-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜尋中風、吞嚥、長照、輔具…"
              className="min-w-0 flex-1 bg-transparent py-2 text-base text-slate-800 outline-none placeholder:text-slate-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="grid h-11 w-11 place-items-center rounded-full text-slate-500" title="清除搜尋" aria-label="清除搜尋">×</button>
            )}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="衛教分類">
            {EDUCATION_CATEGORIES.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={category === item.id}
                onClick={() => setCategory(item.id)}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold ${
                  category === item.id ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="articles-title">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black text-blue-700">經查證的新知</p>
              <h2 id="articles-title" className="text-xl font-black text-slate-900">衛教文章</h2>
            </div>
            <span className="text-xs font-semibold text-slate-500">{articles.length} 篇</span>
          </div>

          {articles.length > 0 ? (
            <div className="flex flex-col gap-3">
              {articles.map(article => {
                const status = sourceStatus(article.verifiedAt)
                return (
                  <article key={article.id} className={`rounded-lg border bg-white p-4 shadow-sm ${article.urgent ? 'border-red-300' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={`text-[11px] font-black ${article.urgent ? 'text-red-700' : 'text-blue-700'}`}>{article.audience}</p>
                        <h3 className="mt-0.5 text-lg font-black leading-snug text-slate-900">{article.title}</h3>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${status.stale ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {status.label}
                      </span>
                    </div>

                    <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{article.summary}</p>
                    <ul className="mt-3 space-y-2 border-l-4 border-blue-100 pl-3">
                      {article.takeaways.map(takeaway => (
                        <li key={takeaway} className="text-sm leading-relaxed text-slate-700">{takeaway}</li>
                      ))}
                    </ul>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <div className="text-[11px] font-semibold leading-relaxed text-slate-500">
                        <p>來源：{article.sourceName}</p>
                        <p>最後查證：{formatDate(article.verifiedAt)}</p>
                      </div>
                      <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-black text-blue-700">
                        查看原始來源 <span aria-hidden>↗</span>
                      </a>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center">
              <p className="font-bold text-slate-700">找不到符合的內容</p>
              <button type="button" onClick={() => { setQuery(''); setCategory('all') }} className="mt-3 min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-black text-white">查看全部</button>
            </div>
          )}
        </section>

        <aside className="border-t border-slate-300 px-1 py-4 text-xs font-semibold leading-relaxed text-slate-500">
          本區提供一般衛教與資源入口，不能取代醫師、治療師、護理師或其他專業人員的個別評估。政策、資格與補助以主管機關最新公告為準。
        </aside>
      </div>
    </main>
  )
}
