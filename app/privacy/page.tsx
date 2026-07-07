'use client'

// 隱私權政策與免責聲明（規格書 §9：影像端內處理明文寫入隱私政策首行）

import { useRouter } from 'next/navigation'

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '📷 你的影像不會離開你的裝置',
    body: [
      '所有鏡頭影像都只在你的手機／電腦上即時分析（瀏覽器端 AI 動作偵測），影像本身不會上傳、不會儲存、不會被任何人看到。',
      '平台只記錄「動作數據」：例如手腕位置座標、關節角度估算值、命中成績——這些是數字，不是畫面。',
    ],
  },
  {
    title: '📊 我們收集什麼資料、做什麼用',
    body: [
      '帳號資料：LINE 登入提供的顯示名稱與頭像（你可以另外設定匿名暱稱用於社群與排行榜）。',
      '訓練資料：遊戲成績、動作軌跡與姿勢數據（去識別化座標）、疼痛自評、訓練時間。用途：讓你和你的治療師追蹤訓練進度、自動調整遊戲難度、產生每週訓練回顧。',
      '動作原始序列最多保留 90 天，之後自動刪除；彙總後的成績與趨勢長期保留供進度追蹤。',
      '資料不會出售或提供給無關第三方。AI 生成回饋時僅傳送去識別化的統計數字。',
    ],
  },
  {
    title: '🔒 資料保護',
    body: [
      '傳輸全程加密（HTTPS）、資料庫存取權限控管（Row Level Security）。',
      '治療師僅能查看與其臨床服務相關的個案訓練資料。',
    ],
  },
  {
    title: '🙋 你的權利',
    body: [
      '依個人資料保護法，你可以隨時要求查詢、複製、更正或刪除你的個人資料。',
      '請透過 LINE 官方帳號「LifeMotionXR｜仲暘復能」（@689sbdmp）聯絡我們，將於合理期間內處理。',
    ],
  },
  {
    title: '⚠️ 免責聲明',
    body: [
      '本平台為「運動訓練輔助工具」，非醫療器材，所有數據（含角度估算）僅供訓練參考，不具醫療量測效力。',
      '本平台不提供診斷或醫療建議，不能取代醫師與治療師的專業評估。訓練中如有疼痛、頭暈等任何不適，請立即停止並諮詢你的治療師。',
    ],
  },
]

export default function PrivacyPage() {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 flex flex-col items-center px-5 py-10 gap-6">
      <div className="text-center">
        <div className="text-5xl mb-2">🛡️</div>
        <h1 className="text-3xl font-extrabold text-slate-900">隱私權政策</h1>
        <p className="text-slate-400 text-sm mt-1">LifeMotionXR · 2026-07 版</p>
      </div>

      <div className="w-full max-w-lg flex flex-col gap-4">
        {SECTIONS.map(s => (
          <section key={s.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-extrabold text-slate-800 mb-2">{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-sm text-slate-600 leading-relaxed mb-1.5">{p}</p>
            ))}
          </section>
        ))}
      </div>

      <button onClick={() => router.push('/')}
        className="mt-2 px-8 py-3 rounded-2xl border-2 border-slate-300 text-slate-600 font-semibold text-lg hover:bg-slate-50 active:scale-[0.97]">
        ← 返回首頁
      </button>
    </main>
  )
}
