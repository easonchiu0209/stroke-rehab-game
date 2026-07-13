'use client'

// 素材版遊戲場景（Kenney CC0 素材，public/assets/）。
// 與 GameScene（emoji 版）並存：試水 3 款先用這裡的場景，效果拍板後再全面鋪開。
// 每個場景都是滿版絕對定位層，用法同 SceneBack：放在相機 video 前面。

/** 兩層雲帶反向漂移（所有場景共用的「畫面會動」基底） */
export function DriftClouds({ opacity = 0.9 }: { opacity?: number }) {
  return (
    <>
      <div className="absolute inset-x-0 pointer-events-none" style={{
        top: '2%', height: '18%', opacity,
        backgroundImage: 'url(/assets/scene/cloud-layer1.png)',
        backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%',
        animation: 'sceneDriftA 90s linear infinite',
      }} />
      <div className="absolute inset-x-0 pointer-events-none" style={{
        top: '10%', height: '14%', opacity: opacity * 0.7,
        backgroundImage: 'url(/assets/scene/cloud-layer2.png)',
        backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%',
        animation: 'sceneDriftB 140s linear infinite',
      }} />
      <SceneKeyframes />
    </>
  )
}

/** 共用 keyframes（多場景掛載也只是重複同名定義，無害） */
function SceneKeyframes() {
  return (
    <style>{`
      @keyframes sceneDriftA { from { background-position-x: 0; } to { background-position-x: -1024px; } }
      @keyframes sceneDriftB { from { background-position-x: -1024px; } to { background-position-x: 0; } }
      @keyframes sceneBob    { 0%,100% { transform: translateY(0); } 50% { transform: translateY(6px); } }
      @keyframes sceneBob2   { 0%,100% { transform: translateY(4px); } 50% { transform: translateY(-3px); } }
      @keyframes sceneSway   { 0%,100% { transform: rotate(-1.6deg); } 50% { transform: rotate(1.6deg); } }
    `}</style>
  )
}

/** 果園（切切樂）：秋色插畫背景＋漂雲 */
export function OrchardScene() {
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(/assets/scene/bg-fall.png)',
        backgroundSize: 'cover', backgroundPosition: 'center bottom',
      }} />
      <DriftClouds />
    </div>
  )
}

/** 射擊場樂園（打地鼠）：木牆＋帷幕＋水波＋樹 */
export function GalleryScene() {
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden>
      {/* 天空帶＋木牆 */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(#cdecff, #e3f4ff)' }} />
      <div className="absolute inset-x-0" style={{
        top: '12%', bottom: 0,
        backgroundImage: 'url(/assets/gallery/bg_wood.png)',
        backgroundSize: '256px', borderTop: '6px solid #8c5a32',
      }} />
      {/* 天空的雲與樹（木牆之上露出來） */}
      <img src="/assets/gallery/cloud1.png" alt="" className="absolute" style={{ top: '1%', left: '12%', width: '14%', animation: 'sceneBob 7s ease-in-out infinite' }} />
      <img src="/assets/gallery/cloud2.png" alt="" className="absolute" style={{ top: '3%', right: '18%', width: '11%', animation: 'sceneBob2 9s ease-in-out infinite' }} />
      <img src="/assets/gallery/tree_pine.png" alt="" className="absolute" style={{ bottom: '86%', left: '2%', width: '9%', transformOrigin: 'bottom center', animation: 'sceneSway 6s ease-in-out infinite' }} />
      <img src="/assets/gallery/tree_oak.png" alt="" className="absolute" style={{ bottom: '86%', right: '3%', width: '9%', transformOrigin: 'bottom center', animation: 'sceneSway 7s ease-in-out 0.8s infinite' }} />
      {/* 上帷幕＋兩側帷幕 */}
      <div className="absolute inset-x-0 top-0" style={{
        height: '9%',
        backgroundImage: 'url(/assets/gallery/curtain_top.png)',
        backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%',
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
      }} />
      <img src="/assets/gallery/curtain.png" alt="" className="absolute left-0 top-0" style={{ height: '46%', filter: 'drop-shadow(4px 4px 8px rgba(0,0,0,0.3))' }} />
      <img src="/assets/gallery/curtain.png" alt="" className="absolute right-0 top-0" style={{ height: '46%', transform: 'scaleX(-1)', filter: 'drop-shadow(-4px 4px 8px rgba(0,0,0,0.3))' }} />
      {/* 底部兩層水波（前後反向搖） */}
      <div className="absolute inset-x-0" style={{
        bottom: '4.5%', height: '9%',
        backgroundImage: 'url(/assets/gallery/water2.png)',
        backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%',
        animation: 'sceneBob 3.6s ease-in-out infinite',
        opacity: 0.9,
      }} />
      <div className="absolute inset-x-0" style={{
        bottom: 0, height: '10%',
        backgroundImage: 'url(/assets/gallery/water1.png)',
        backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%',
        animation: 'sceneBob2 3s ease-in-out infinite',
        filter: 'drop-shadow(0 -3px 5px rgba(0,0,0,0.15))',
      }} />
      <SceneKeyframes />
    </div>
  )
}

/** 羽球場（badminton）：草地藍天背景＋球場地板＋白線 */
export function CourtScene() {
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(/assets/scene/bg-grass.png)',
        backgroundSize: 'cover', backgroundPosition: 'center 30%',
      }} />
      <DriftClouds opacity={0.7} />
      {/* 球場地板（下半場，帶透視感的色帶＋白線） */}
      <div className="absolute inset-x-0 bottom-0" style={{
        top: '34%',
        background: 'linear-gradient(#2e9e6b, #1f7a52 55%, #196344)',
        boxShadow: 'inset 0 10px 24px rgba(0,0,0,0.25)',
      }} />
      {/* 邊線與中線 */}
      <div className="absolute" style={{ top: '38%', bottom: '3%', left: '7%', right: '7%', border: '4px solid rgba(255,255,255,0.85)', borderRadius: 4 }} />
      <div className="absolute" style={{ top: '38%', bottom: '3%', left: '50%', width: 4, marginLeft: -2, background: 'rgba(255,255,255,0.7)' }} />
      {/* 球網 */}
      <div className="absolute inset-x-[5%]" style={{
        top: '34%', height: 34, transform: 'translateY(-100%)',
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 9px), repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 8px)',
        borderTop: '5px solid rgba(255,255,255,0.9)',
        filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))',
      }} />
    </div>
  )
}
