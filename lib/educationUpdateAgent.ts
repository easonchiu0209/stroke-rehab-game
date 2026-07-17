import { EDUCATION_ARTICLES, type EducationArticle } from '@/lib/educationContent'

export interface EducationSourceScan {
  sourceUrl: string
  sourceName: string
  articleIds: string[]
  articleTitles: string[]
  status: 'ok' | 'pdf' | 'unreachable'
  httpStatus: number | null
  contentType: string | null
  fetchedTitle: string | null
  verifiedAtLatest: string
}

export interface EducationCandidateDiff {
  id: string
  sourceUrl: string
  sourceName: string
  articleIds: string[]
  articleTitles: string[]
  reason: string
  proposedAction: string
  priority: 'low' | 'medium' | 'high'
}

export interface EducationUpdateReport {
  scannedAt: string
  sourceCount: number
  articleCount: number
  candidateCount: number
  sources: EducationSourceScan[]
  candidateDiffs: EducationCandidateDiff[]
}

const SCAN_TIMEOUT_MS = 6000

function uniqueBySource(articles: EducationArticle[]) {
  const map = new Map<string, EducationArticle[]>()
  for (const article of articles) {
    const list = map.get(article.sourceUrl) ?? []
    list.push(article)
    map.set(article.sourceUrl, list)
  }
  return map
}

function summarizeTitles(articles: EducationArticle[]) {
  return Array.from(new Set(articles.map((article) => article.title)))
}

function maxVerifiedAt(articles: EducationArticle[]) {
  return articles.reduce((latest, article) => (article.verifiedAt > latest ? article.verifiedAt : latest), articles[0]?.verifiedAt ?? '')
}

function decodeEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function extractHtmlTitle(body: string) {
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return null
  return decodeEntities(match[1].replace(/\s+/g, ' ').trim())
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'LifeMotionXR-EducationUpdateAgent/1.0',
        accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8',
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function runEducationUpdateAgent(now: Date = new Date()): Promise<EducationUpdateReport> {
  const grouped = uniqueBySource(EDUCATION_ARTICLES)
  const sources: EducationSourceScan[] = []
  const candidateDiffs: EducationCandidateDiff[] = []

  for (const [sourceUrl, articles] of Array.from(grouped.entries())) {
    const sourceName = articles[0]?.sourceName ?? sourceUrl
    const articleIds = articles.map((article) => article.id)
    const articleTitles = summarizeTitles(articles)
    const verifiedAtLatest = maxVerifiedAt(articles)

    let status: EducationSourceScan['status'] = 'ok'
    let httpStatus: number | null = null
    let contentType: string | null = null
    let fetchedTitle: string | null = null

    try {
      const response = await fetchWithTimeout(sourceUrl)
      httpStatus = response.status
      contentType = response.headers.get('content-type')
      const isPdf = Boolean(contentType?.includes('pdf') || sourceUrl.toLowerCase().endsWith('.pdf'))

      if (!response.ok) {
        status = 'unreachable'
      } else if (isPdf) {
        status = 'pdf'
      } else {
        const body = await response.text()
        fetchedTitle = extractHtmlTitle(body)
      }
    } catch {
      status = 'unreachable'
    }

    sources.push({
      sourceUrl,
      sourceName,
      articleIds,
      articleTitles,
      status,
      httpStatus,
      contentType,
      fetchedTitle,
      verifiedAtLatest,
    })

    const staleArticle = articles.find((article) => {
      const verifiedAt = new Date(`${article.verifiedAt}T00:00:00+08:00`).getTime()
      const ageDays = Math.floor((now.getTime() - verifiedAt) / 86400000)
      return ageDays > 90
    })

    if (status === 'unreachable') {
      candidateDiffs.push({
        id: `${articleIds[0]}-unreachable`,
        sourceUrl,
        sourceName,
        articleIds,
        articleTitles,
        reason: '來源無法連線，先保留原文並列入人工複查。',
        proposedAction: '確認原始連結是否更動，再決定是否下架或重抓摘要。',
        priority: 'high',
      })
      continue
    }

    if (status === 'pdf') {
      candidateDiffs.push({
        id: `${articleIds[0]}-pdf-review`,
        sourceUrl,
        sourceName,
        articleIds,
        articleTitles,
        reason: '來源是 PDF，適合人工核對標題、發布日與重點段落後再更新正式摘要。',
        proposedAction: '請專業人員比對 PDF 原稿，再決定是否調整正式衛教主張。',
        priority: 'medium',
      })
      continue
    }

    if (staleArticle) {
      candidateDiffs.push({
        id: `${staleArticle.id}-stale`,
        sourceUrl,
        sourceName,
        articleIds,
        articleTitles,
        reason: `至少一篇內容距離最後查證已超過 90 天（${staleArticle.title}）。`,
        proposedAction: '重新查核來源與最新公告，必要時更新摘要與查證日期。',
        priority: 'medium',
      })
      continue
    }

    if (fetchedTitle && articleTitles.length === 1 && !fetchedTitle.toLowerCase().includes(articleTitles[0].toLowerCase())) {
      candidateDiffs.push({
        id: `${articleIds[0]}-title-check`,
        sourceUrl,
        sourceName,
        articleIds,
        articleTitles,
        reason: `來源頁標題與目前摘要標題不完全一致：${fetchedTitle}`,
        proposedAction: '請人工確認是否只是頁面標題變更，或原始內容已換版。',
        priority: 'low',
      })
    }
  }

  return {
    scannedAt: now.toISOString(),
    sourceCount: sources.length,
    articleCount: EDUCATION_ARTICLES.length,
    candidateCount: candidateDiffs.length,
    sources,
    candidateDiffs,
  }
}
