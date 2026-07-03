'use client'
// 滿版主題場景（不顯示鏡頭影像）。鏡頭 video 仍需播放供偵測，但視覺上隱藏(opacity 0)。
// 用法：相機容器內，<video>(opacity 0) 前放 <SceneBack theme/>，最後放 <SceneFront theme/>。

export type SceneTheme = 'meadow' | 'orchard' | 'island' | 'kitchen' | 'calm'

const SKY: Record<SceneTheme, string> = {
  meadow:  'linear-gradient(#bfe6ff 0%, #d8f1ff 33%, #9ed873 33%, #6fae3f 100%)',
  orchard: 'linear-gradient(#cdecff 0%, #e3f4ff 30%, #bfe08a 30%, #7fb84a 100%)',
  island:  'linear-gradient(#74cdff 0%, #bfeaff 38%, #59b6e8 38%, #2f86c4 62%, #ffe39a 62%, #f5c46a 100%)',
  kitchen: 'linear-gradient(#ffe9cf 0%, #ffdcb0 55%, #d9a06a 55%, #b9824e 100%)',
  calm:    'radial-gradient(circle at 50% 32%, #3a3f80, #1a1c40 70%, #101230 100%)',
}

// 大型場景元素（構成主題畫面）
type El = { e: string; style: React.CSSProperties }
const SCENE: Record<SceneTheme, El[]> = {
  meadow: [
    { e: '☀️', style: { top: '4%', right: '6%', fontSize: 64 } },
    { e: '☁️', style: { top: '8%', left: '10%', fontSize: 46, opacity: 0.95 } },
    { e: '☁️', style: { top: '16%', left: '46%', fontSize: 38, opacity: 0.85 } },
    { e: '🌳', style: { top: '24%', left: '4%', fontSize: 64 } },
    { e: '🌳', style: { top: '25%', right: '4%', fontSize: 58 } },
    { e: '🌳', style: { top: '27%', left: '40%', fontSize: 48 } },
    { e: '🌻', style: { bottom: '3%', left: '8%', fontSize: 40 } },
    { e: '🌷', style: { bottom: '2%', right: '12%', fontSize: 36 } },
    { e: '🌿', style: { bottom: '2%', left: '46%', fontSize: 34 } },
  ],
  orchard: [
    { e: '☀️', style: { top: '5%', right: '8%', fontSize: 56 } },
    { e: '☁️', style: { top: '10%', left: '14%', fontSize: 42, opacity: 0.9 } },
    { e: '🌳', style: { top: '14%', left: '2%', fontSize: 92 } },
    { e: '🌳', style: { top: '16%', right: '2%', fontSize: 86 } },
    { e: '🍎', style: { top: '30%', left: '20%', fontSize: 26 } },
    { e: '🍎', style: { top: '34%', right: '22%', fontSize: 24 } },
    { e: '🧺', style: { bottom: '3%', left: '10%', fontSize: 44 } },
    { e: '🍃', style: { bottom: '4%', right: '14%', fontSize: 32 } },
  ],
  island: [
    { e: '☀️', style: { top: '5%', right: '10%', fontSize: 60 } },
    { e: '☁️', style: { top: '10%', left: '12%', fontSize: 44, opacity: 0.9 } },
    { e: '🌴', style: { top: '20%', left: '2%', fontSize: 92 } },
    { e: '🌴', style: { top: '24%', right: '3%', fontSize: 80 } },
    { e: '⛵', style: { top: '46%', left: '40%', fontSize: 34 } },
    { e: '🏖️', style: { bottom: '2%', right: '8%', fontSize: 44 } },
    { e: '🐚', style: { bottom: '3%', left: '12%', fontSize: 30 } },
    { e: '🦀', style: { bottom: '2%', left: '42%', fontSize: 28 } },
  ],
  kitchen: [
    { e: '🪟', style: { top: '6%', left: '8%', fontSize: 56, opacity: 0.9 } },
    { e: '🧄', style: { top: '10%', right: '12%', fontSize: 30 } },
    { e: '🍳', style: { top: '40%', left: '6%', fontSize: 46 } },
    { e: '🫕', style: { top: '42%', right: '8%', fontSize: 44 } },
    { e: '🔪', style: { bottom: '4%', left: '14%', fontSize: 34 } },
    { e: '🥄', style: { bottom: '4%', right: '16%', fontSize: 32 } },
    { e: '🧂', style: { bottom: '5%', left: '46%', fontSize: 28 } },
  ],
  calm: [
    { e: '🌙', style: { top: '8%', right: '12%', fontSize: 44, opacity: 0.9 } },
    { e: '✨', style: { top: '18%', left: '16%', fontSize: 24, opacity: 0.7 } },
    { e: '✨', style: { top: '30%', right: '22%', fontSize: 18, opacity: 0.6 } },
    { e: '⭐', style: { top: '12%', left: '40%', fontSize: 16, opacity: 0.6 } },
    { e: '✨', style: { bottom: '24%', left: '30%', fontSize: 16, opacity: 0.6 } },
  ],
}

export function SceneBack({ theme }: { theme: SceneTheme }) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden style={{ background: SKY[theme] }}>
      {SCENE[theme].map((d, i) => (
        <span key={i} className="absolute" style={{ ...d.style, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}>{d.e}</span>
      ))}
    </div>
  )
}

// 前景：輕微暈影聚焦中央（無鏡頭，故較淡）
export function SceneFront({ theme }: { theme: SceneTheme }) {
  void theme
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden style={{ boxShadow: 'inset 0 0 120px 30px rgba(0,0,0,0.25)' }} />
  )
}
