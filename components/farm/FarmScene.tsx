'use client'

import { SPECIES, type Plot, type Species, ripeStage } from '@/lib/farm'

// 共用漸層 / 濾鏡（整個場景引用同一份，避免 id 衝突）
export function FarmDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <radialGradient id="gGrass" cx="40%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#b6e88a" />
          <stop offset="55%" stopColor="#8fd166" />
          <stop offset="100%" stopColor="#6fbf46" />
        </radialGradient>
        <linearGradient id="gSoil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b9824e" />
          <stop offset="100%" stopColor="#8a5a30" />
        </linearGradient>
        <linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d6a86d" />
          <stop offset="100%" stopColor="#a9784a" />
        </linearGradient>
        <linearGradient id="gLeaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ad14f" />
          <stop offset="100%" stopColor="#4e9e30" />
        </linearGradient>
        <radialGradient id="gTree" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#8ed85f" />
          <stop offset="100%" stopColor="#469a39" />
        </radialGradient>
        <linearGradient id="gCarrot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffa53b" />
          <stop offset="100%" stopColor="#ef7d1e" />
        </linearGradient>
        <linearGradient id="gCorn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe06a" />
          <stop offset="100%" stopColor="#f5b836" />
        </linearGradient>
        <radialGradient id="gTomato" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ff6a5a" />
          <stop offset="100%" stopColor="#d8362f" />
        </radialGradient>
        <radialGradient id="gStraw" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ff5d72" />
          <stop offset="100%" stopColor="#d61f43" />
        </radialGradient>
        <radialGradient id="gSun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe680" />
          <stop offset="100%" stopColor="#ffc328" />
        </radialGradient>
        <filter id="fSoft" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.4" floodColor="#000" floodOpacity="0.28" />
        </filter>
      </defs>
    </svg>
  )
}

// ── 單株作物（中心 0,0，約 18 寬）────────────────────────────────
function Sprout() {
  return (
    <g filter="url(#fSoft)">
      <rect x="-1" y="0" width="2" height="8" rx="1" fill="#5a8a3a" />
      <ellipse cx="-3.5" cy="2" rx="4" ry="2.4" fill="url(#gLeaf)" transform="rotate(-30 -3.5 2)" />
      <ellipse cx="3.5" cy="2" rx="4" ry="2.4" fill="url(#gLeaf)" transform="rotate(30 3.5 2)" />
    </g>
  )
}
function Carrot() {
  return (
    <g filter="url(#fSoft)">
      <ellipse cx="-3" cy="-7" rx="2.6" ry="1.6" fill="url(#gLeaf)" transform="rotate(-35 -3 -7)" />
      <ellipse cx="0"  cy="-8" rx="2.6" ry="1.6" fill="url(#gLeaf)" />
      <ellipse cx="3"  cy="-7" rx="2.6" ry="1.6" fill="url(#gLeaf)" transform="rotate(35 3 -7)" />
      <path d="M-4.5,-5 Q0,-6 4.5,-5 L0,9 Z" fill="url(#gCarrot)" />
      <path d="M-2.4,-2 h4.8 M-1.7,1.5 h3.4" stroke="#d9691a" strokeWidth="0.7" strokeLinecap="round" />
    </g>
  )
}
function Corn() {
  return (
    <g filter="url(#fSoft)">
      <ellipse cx="-3.6" cy="0" rx="3.4" ry="7.5" fill="url(#gLeaf)" transform="rotate(-12 -3.6 0)" />
      <ellipse cx="3.6"  cy="0" rx="3.4" ry="7.5" fill="url(#gLeaf)" transform="rotate(12 3.6 0)" />
      <ellipse cx="0" cy="-1" rx="4" ry="8" fill="url(#gCorn)" />
      <path d="M-2,-6 v12 M0,-7 v13 M2,-6 v12" stroke="#e3a52a" strokeWidth="0.6" />
    </g>
  )
}
function Tomato() {
  return (
    <g filter="url(#fSoft)">
      <path d="M-7,7 Q-8,-3 0,-5 Q8,-3 7,7 Z" fill="url(#gLeaf)" />
      <circle cx="-2.5" cy="3" r="3.4" fill="url(#gTomato)" />
      <circle cx="3" cy="4.5" r="3" fill="url(#gTomato)" />
      <circle cx="1.5" cy="-1.5" r="2.6" fill="url(#gTomato)" />
    </g>
  )
}
function Strawberry() {
  return (
    <g filter="url(#fSoft)">
      <path d="M-2,-7 l-3,-1 M0,-7 v-2 M2,-7 l3,-1" stroke="#4e9e30" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M-5,-6 q5,-2 10,0 q-1,3 -5,3 q-4,0 -5,-3 Z" fill="#4e9e30" />
      <path d="M-5,-4 Q0,12 5,-4 Q0,-1 -5,-4 Z" fill="url(#gStraw)" />
      <g fill="#ffe39a"><circle cx="-2" cy="0" r="0.7" /><circle cx="2" cy="1" r="0.7" /><circle cx="0" cy="4" r="0.7" /><circle cx="-1" cy="-2" r="0.6" /></g>
    </g>
  )
}
function Chicken() {
  return (
    <g filter="url(#fSoft)">
      <ellipse cx="0" cy="4" rx="8" ry="6.5" fill="#fff" />
      <circle cx="5" cy="-2.5" r="4.2" fill="#fff" />
      <path d="M4,-7 q1.5,-2 3,0 q1.5,-2 2.5,0.5 q-2.5,1.5 -5.5,0.5 Z" fill="#e8433a" />
      <path d="M9,-2.5 l4,-1 l-4,2 Z" fill="#ffb02e" />
      <circle cx="6" cy="-3" r="0.9" fill="#333" />
      <path d="M-7,3 q-3,1 -4,4" stroke="#f3c14b" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </g>
  )
}
function Chick() {
  return (
    <g filter="url(#fSoft)">
      <circle cx="0" cy="2" r="5.5" fill="#ffdd57" />
      <circle cx="0" cy="-3.5" r="3.6" fill="#ffe680" />
      <path d="M2.5,-3.5 l3,-0.6 l-3,1.6 Z" fill="#ffae34" />
      <circle cx="1.2" cy="-4" r="0.7" fill="#444" />
    </g>
  )
}

// 部分品種有專屬手繪 SVG，其餘以 emoji 呈現
const RIPE: Partial<Record<Species, () => JSX.Element>> = {
  carrot: Carrot, corn: Corn, tomato: Tomato, strawberry: Strawberry,
  chicken: Chicken,
}

function EmojiMark({ e }: { e: string }) {
  return <text x="0" y="0" fontSize="15" textAnchor="middle" dominantBaseline="central">{e}</text>
}

// 六個種植點
const SPOTS = [
  { x: 30, y: 46 }, { x: 52, y: 40 }, { x: 74, y: 46 },
  { x: 34, y: 70 }, { x: 56, y: 66 }, { x: 76, y: 72 },
]

export function SoilTile({ plot, ripe }: { plot: Plot; ripe: boolean }) {
  const empty = plot.kind === 'empty'
  const isAnimal = plot.kind === 'animal'
  const growth = plot.species ? plot.stage / ripeStage(plot.species) : 0
  const Ripe = plot.species ? RIPE[plot.species] : null
  const sp = plot.species ? SPECIES[plot.species] : null
  const ripeEmoji = sp ? sp.stages[sp.stages.length - 1] : ''
  const curEmoji = sp ? sp.stages[Math.min(plot.stage, sp.stages.length - 1)] : ''

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full block">
      {/* 土壤 */}
      <rect x="6" y="14" width="88" height="80" rx="12"
        fill={empty ? '#9a6a3e' : 'url(#gSoil)'} stroke="#7a5230" strokeWidth="1.5"
        strokeDasharray={empty ? '5 4' : undefined} />
      {/* 翻土壟 */}
      {!empty && [30, 46, 62, 78].map(y => (
        <path key={y} d={`M12,${y} q38,5 76,0`} stroke="#7a5230" strokeWidth="1.4" fill="none" opacity="0.5" />
      ))}
      {/* 木柵欄框 */}
      <g>
        <rect x="4" y="12" width="92" height="6" rx="3" fill="url(#gWood)" />
        <rect x="4" y="90" width="92" height="6" rx="3" fill="url(#gWood)" />
        {[8, 30, 52, 74, 92].map(x => <rect key={x} x={x} y="8" width="6" height="90" rx="3" fill="url(#gWood)" />)}
      </g>

      {empty && (
        <g>
          <circle cx="50" cy="54" r="13" fill="#fff" opacity="0.18" />
          <path d="M50,47 v14 M43,54 h14" stroke="#ffe8c2" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      )}

      {/* 作物 */}
      {!empty && plot.species && (
        <g>
          {SPOTS.slice(0, ripe || isAnimal ? (isAnimal ? 3 : 6) : (growth > 0.5 ? 5 : 4)).map((s, i) => (
            <g key={i} transform={`translate(${s.x} ${s.y}) scale(${ripe ? 1.05 : 0.85})`}>
              {ripe
                ? (Ripe ? <Ripe /> : <EmojiMark e={ripeEmoji} />)
                : isAnimal ? <EmojiMark e={curEmoji} />
                : <g transform={`scale(${0.7 + growth * 0.5})`}><Sprout /></g>}
            </g>
          ))}
        </g>
      )}

      {/* 成熟金光 */}
      {ripe && <circle cx="50" cy="54" r="46" fill="#ffe14d" opacity="0.12" />}
    </svg>
  )
}

// ── 裝飾 ─────────────────────────────────────────────────────────
export function Tree({ s = 1 }: { s?: number }) {
  return (
    <svg viewBox="0 0 60 70" style={{ width: 54 * s, height: 63 * s }} aria-hidden>
      <ellipse cx="30" cy="66" rx="16" ry="4" fill="#000" opacity="0.18" />
      <rect x="26" y="42" width="8" height="20" rx="3" fill="#9c6b3a" />
      <circle cx="30" cy="28" r="22" fill="url(#gTree)" filter="url(#fSoft)" />
      <circle cx="18" cy="36" r="13" fill="url(#gTree)" />
      <circle cx="42" cy="36" r="13" fill="url(#gTree)" />
      <circle cx="22" cy="22" r="6" fill="#a6e57a" opacity="0.6" />
    </svg>
  )
}
export function Bush() {
  return (
    <svg viewBox="0 0 50 34" style={{ width: 50, height: 34 }} aria-hidden>
      <ellipse cx="25" cy="31" rx="16" ry="3" fill="#000" opacity="0.15" />
      <circle cx="14" cy="20" r="11" fill="url(#gTree)" />
      <circle cx="30" cy="18" r="13" fill="url(#gTree)" />
      <circle cx="40" cy="22" r="9" fill="url(#gTree)" />
    </svg>
  )
}
export function Flower({ c = '#ff6f91' }: { c?: string }) {
  return (
    <svg viewBox="0 0 24 28" style={{ width: 22, height: 26 }} aria-hidden>
      <rect x="11" y="12" width="2" height="14" fill="#4e9e30" />
      <g filter="url(#fSoft)">
        {[0, 72, 144, 216, 288].map(a => (
          <ellipse key={a} cx="12" cy="6" rx="3" ry="5" fill={c} transform={`rotate(${a} 12 10)`} />
        ))}
        <circle cx="12" cy="10" r="3" fill="#ffd23f" />
      </g>
    </svg>
  )
}
export function Sun() {
  return (
    <svg viewBox="0 0 60 60" style={{ width: 52, height: 52 }} aria-hidden>
      <g stroke="#ffd23f" strokeWidth="3" strokeLinecap="round">
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <line key={a} x1="30" y1="4" x2="30" y2="12" transform={`rotate(${a} 30 30)`} />
        ))}
      </g>
      <circle cx="30" cy="30" r="16" fill="url(#gSun)" />
    </svg>
  )
}
