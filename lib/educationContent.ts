export type EducationCategory = 'stroke' | 'recovery' | 'longterm-care' | 'caregiver'

export interface EducationArticle {
  id: string
  category: EducationCategory
  title: string
  summary: string
  takeaways: string[]
  audience: string
  sourceName: string
  sourceUrl: string
  publishedAt?: string
  verifiedAt: string
  urgent?: boolean
}

export interface EducationResource {
  id: string
  title: string
  description: string
  emoji: string
  href: string
  action: string
}

export const EDUCATION_VERIFIED_AT = '2026-07-15'

export const EDUCATION_CATEGORIES: { id: 'all' | EducationCategory; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'stroke', label: '中風醫療' },
  { id: 'recovery', label: '居家復能' },
  { id: 'longterm-care', label: '長照資源' },
  { id: 'caregiver', label: '照顧者' },
]

export const EDUCATION_RESOURCES: EducationResource[] = [
  {
    id: 'ltc-1966',
    title: '長照專線 1966',
    description: '申請、資格與服務諮詢',
    emoji: '☎️',
    href: 'tel:1966',
    action: '撥打 1966',
  },
  {
    id: 'ltc-map',
    title: '長照資源地圖',
    description: '查詢附近服務據點',
    emoji: '📍',
    href: 'https://ltcpap.mohw.gov.tw/',
    action: '開啟地圖',
  },
  {
    id: 'assistive',
    title: '官方輔具查詢',
    description: '產品、補助與服務中心',
    emoji: '🦽',
    href: 'https://newrepat.sfaa.gov.tw/',
    action: '查詢輔具',
  },
]

export const EDUCATION_ARTICLES: EducationArticle[] = [
  {
    id: 'stroke-warning',
    category: 'stroke',
    title: '突然出現中風警訊，立即撥打 119',
    summary: '用「微笑、舉手、說你好」快速觀察臉部、手臂與說話是否突然異常；只要出現任一警訊就應立即送醫。',
    takeaways: [
      '突然半邊臉、手或腳無力或麻木，都要提高警覺。',
      '突然說話不清、理解困難、視力模糊、劇烈頭痛或走路不穩也可能是警訊。',
      '不要自行觀察等待，也不要用飲食偏方延誤就醫。',
    ],
    audience: '所有個案與家屬',
    sourceName: '衛生福利部國民健康署',
    sourceUrl: 'https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=4878&pid=19537',
    publishedAt: '2025-10-28',
    verifiedAt: EDUCATION_VERIFIED_AT,
    urgent: true,
  },
  {
    id: 'stroke-prevention',
    category: 'stroke',
    title: '預防再次中風：健檢、血壓與生活習慣',
    summary: '國健署建議從定期健檢、居家血壓管理與健康生活三方面降低風險；藥物與個人目標仍應依醫師指示。',
    takeaways: [
      '居家血壓可採「722」：連續 7 天、早晚各 1 次、每次量 2 遍。',
      '維持低油、低鹽、低糖、高纖，並依專業建議安排適合自己的活動。',
      '不要自行停藥、改藥或以保健食品取代治療。',
    ],
    audience: '中風個案與高風險族群',
    sourceName: '衛生福利部國民健康署',
    sourceUrl: 'https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=4878&pid=19537',
    publishedAt: '2025-10-28',
    verifiedAt: EDUCATION_VERIFIED_AT,
  },
  {
    id: 'swallowing-safety',
    category: 'recovery',
    title: '中風後吞嚥與飲食質地需要專業評估',
    summary: '中風後吞嚥策略必須依個人評估制定；食物質地、液體濃度與吞嚥運動不適合自行套用同一套方法。',
    takeaways: [
      '急性中風後，在確認吞嚥安全前不應自行給予食物、液體或口服藥。',
      '持續咳嗽、嗆咳、聲音變濕或進食明顯變慢時，應尋求醫療評估。',
      '飲食質地與增稠液體應由語言治療、營養或醫療團隊依評估建議。',
    ],
    audience: '有吞嚥困難的個案與照顧者',
    sourceName: '台灣腦中風學會 2024 吞嚥障礙照護指引',
    sourceUrl: 'https://www.stroke.org.tw/GoWeb2/include/getfile.php?KeyID=78722107666ac765b38b51&file=f01',
    publishedAt: '2024-08-01',
    verifiedAt: EDUCATION_VERIFIED_AT,
  },
  {
    id: 'home-recovery-safety',
    category: 'recovery',
    title: '居家訓練先看安全訊號',
    summary: '復能訓練應配合治療師處方與個人能力；出現新的神經症狀或明顯不適時，不應為了完成紀錄勉強繼續。',
    takeaways: [
      '訓練前清出活動空間，站立活動旁邊要有穩固支撐或陪同。',
      '若出現疼痛加劇、頭暈、胸悶、呼吸困難或明顯無力，立即停止。',
      '突然出現中風警訊時直接撥打 119，不要等待遊戲或訓練結束。',
    ],
    audience: '進行居家復能的個案與家屬',
    sourceName: 'LifeMotionXR 安全原則；緊急警訊依國民健康署',
    sourceUrl: 'https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=4878&pid=19537',
    verifiedAt: EDUCATION_VERIFIED_AT,
  },
  {
    id: 'apply-ltc',
    category: 'longterm-care',
    title: '需要長照服務，可以從 1966 開始',
    summary: '可撥打 1966、聯絡地方長照管理中心、住院期間詢問出院準備小組，或使用官方線上申請。',
    takeaways: [
      '申請後由照管專員評估需求與長照需要等級。',
      '再與個案管理員討論服務項目並擬定照顧計畫。',
      '資格與給付可能調整，實際結果以所在地長照管理中心評估為準。',
    ],
    audience: '失能個案、家屬與出院準備家庭',
    sourceName: '衛生福利部長照專區',
    sourceUrl: 'https://1966.gov.tw/LTC/cp-6533-70777-207.html',
    publishedAt: '2026-07-01',
    verifiedAt: EDUCATION_VERIFIED_AT,
  },
  {
    id: 'ltc-services',
    category: 'longterm-care',
    title: '長照不只有居家服務',
    summary: '依評估與照顧計畫，可能包含照顧及專業服務、交通接送、輔具與居家無障礙改善，以及喘息服務。',
    takeaways: [
      '專業服務可由物理、職能、語言、護理、營養、心理或社工等人員提供。',
      '有就醫或復健交通需求，可詢問交通接送服務。',
      '扶手、門檻改善與輔具需求，應先接受評估再依流程申請。',
    ],
    audience: '正在評估或使用長照的家庭',
    sourceName: '衛生福利部長照專區',
    sourceUrl: 'https://1966.gov.tw/LTC/cp-6533-70777-207.html',
    publishedAt: '2026-07-01',
    verifiedAt: EDUCATION_VERIFIED_AT,
  },
  {
    id: 'assistive-support',
    category: 'longterm-care',
    title: '購買輔具前，先評估與確認補助',
    summary: '長照或身障輔具補助通常需要需求評估與核定；先買再申請可能影響權益。',
    takeaways: [
      '先向長照管理中心或地方輔具中心確認適用的申請流程。',
      '由專業人員協助選擇尺寸、功能與居家環境適配。',
      '可使用官方輔具資源入口網查詢產品、服務中心與補助資訊。',
    ],
    audience: '有行動、移位或居家安全需求的家庭',
    sourceName: '衛生福利部社會及家庭署',
    sourceUrl: 'https://newrepat.sfaa.gov.tw/',
    verifiedAt: EDUCATION_VERIFIED_AT,
  },
  {
    id: 'respite-care',
    category: 'caregiver',
    title: '照顧者需要休息，可以申請喘息服務',
    summary: '喘息服務可依照顧計畫安排居家、日間照顧或其他合適形式，讓主要照顧者獲得休息與支持。',
    takeaways: [
      '照顧者疲累不是失職，及早求助能降低家庭照顧風險。',
      '撥打 1966 說明目前照顧情況與希望獲得的協助。',
      '服務形式與額度依評估、地區資源與最新規定為準。',
    ],
    audience: '家庭主要照顧者',
    sourceName: '衛生福利部長照專區',
    sourceUrl: 'https://1966.gov.tw/LTC/cp-6533-70777-207.html',
    publishedAt: '2026-07-01',
    verifiedAt: EDUCATION_VERIFIED_AT,
  },
]

export function sourceStatus(verifiedAt: string, now: Date = new Date()) {
  const ageDays = Math.floor((now.getTime() - new Date(`${verifiedAt}T00:00:00+08:00`).getTime()) / 86400000)
  if (ageDays > 90) return { label: '待重新查證', stale: true }
  if (ageDays > 30) return { label: '近期查證', stale: false }
  return { label: '本月已查證', stale: false }
}
