'use client'

// 代償提示 toast：usePoseMonitor 偵測到聳肩/前傾/側彎時的溫和提醒。
// 放在遊戲畫面容器內（absolute 定位）。

export default function CompensationHint({ hint }: { hint: string | null }) {
  if (!hint) return null
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div className="flex items-center gap-2 rounded-2xl bg-amber-400/95 text-amber-950 px-5 py-2.5 shadow-lg animate-bounce">
        <span className="text-2xl">🧘</span>
        <span className="text-lg font-bold whitespace-nowrap">{hint}</span>
      </div>
    </div>
  )
}
