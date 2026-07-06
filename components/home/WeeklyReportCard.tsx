'use client'

// 首頁「本週進步卡」：顯示最新一份週報的個案版訊息（LLM 週報系統）。
// 沒有週報時不佔版面。

import { useEffect, useState } from 'react'

interface Report {
  week_start: string
  patient_message: string
  stats: { sessions: number; activeDays: number; avgAccuracy: number | null }
}

export default function WeeklyReportCard() {
  const [report, setReport] = useState<Report | null>(null)

  useEffect(() => {
    fetch('/api/weekly-report')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.report) setReport(d.report) })
      .catch(() => { /* 未登入/離線：不顯示 */ })
  }, [])

  if (!report) return null

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-sky-50 rounded-2xl shadow-sm p-4 border border-indigo-100">
      <div className="flex items-center justify-between mb-2">
        <p className="font-extrabold text-indigo-900">📊 本週進步卡</p>
        <span className="text-xs text-indigo-400">{report.week_start} 起</span>
      </div>
      <p className="text-slate-700 leading-relaxed">{report.patient_message}</p>
      <div className="flex gap-4 mt-3 text-sm text-indigo-700 font-semibold">
        <span>🎮 {report.stats.sessions} 場</span>
        <span>📅 {report.stats.activeDays} 天</span>
        {report.stats.avgAccuracy != null && <span>🎯 {report.stats.avgAccuracy}%</span>}
      </div>
    </div>
  )
}
