'use client'

// 裝置引導橫幅：回應個案常見問題——
// (1) 遊戲需要鏡頭 (2) 建議用筆電/平板 (3) LINE 內建瀏覽器偵測差，引導切換外部瀏覽器。
// 在 LINE 內建瀏覽器中「永遠顯示」切換教學；一般瀏覽器則顯示一次性裝置提示（可關閉）。

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'deviceTipDismissed'

export default function DeviceTipBanner() {
  const [mode, setMode] = useState<'hidden' | 'line' | 'general'>('hidden')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const isLine = /Line\//i.test(navigator.userAgent)
    if (isLine) { setMode('line'); return }
    if (!localStorage.getItem(DISMISS_KEY)) setMode('general')
  }, [])

  if (mode === 'hidden') return null

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.origin)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* 舊瀏覽器不支援時略過 */ }
  }

  if (mode === 'line') {
    return (
      <div className="mx-3 mt-3 rounded-2xl bg-amber-50 border border-amber-300 p-4">
        <p className="font-bold text-amber-900">📱 你正在用 LINE 開啟</p>
        <p className="text-sm text-amber-800 mt-1 leading-relaxed">
          LINE 內建瀏覽器的<strong>鏡頭偵測較不穩定</strong>，建議改用手機的 Chrome / Safari 開啟：
          點右下角「<strong>⋯</strong>」→「<strong>使用預設瀏覽器開啟</strong>」。
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button onClick={copyUrl} className="px-3 py-1.5 rounded-full bg-amber-500 text-white text-sm font-bold active:scale-95">
            {copied ? '已複製 ✓' : '複製網址'}
          </button>
          <span className="text-xs text-amber-700">貼到瀏覽器就能玩</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-3 mt-3 rounded-2xl bg-sky-50 border border-sky-200 p-4 relative">
      <button
        onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setMode('hidden') }}
        className="absolute top-2 right-3 text-sky-400 text-xl leading-none" aria-label="關閉"
      >×</button>
      <p className="font-bold text-sky-900">💡 遊戲小提醒</p>
      <ul className="text-sm text-sky-800 mt-1 space-y-1 leading-relaxed">
        <li>• 所有訓練遊戲都需要<strong>鏡頭</strong>（前鏡頭即可，不用額外設備）</li>
        <li>• 體驗最佳順序：<strong>筆電 ≥ 平板 &gt; 手機</strong>（畫面越大、手越好偵測）</li>
        <li>• 手偵測不到時：離鏡頭約一隻手臂距離、光線充足、手掌正對鏡頭</li>
      </ul>
    </div>
  )
}
