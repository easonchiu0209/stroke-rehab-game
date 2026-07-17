export type FamilyCheerRole = 'patient' | 'supporter'
export type FamilyCheerStatus = 'pending' | 'active' | 'revoked'

export interface FamilyCheerLinkView {
  id: string
  role: FamilyCheerRole
  status: FamilyCheerStatus
  inviteCode: string
  patientName: string
  patientPictureUrl: string | null
  supporterName: string | null
  allowNameShare: boolean
  allowPictureShare: boolean
  allowProgressShare: boolean
  allowAlertsShare: boolean
  note: string | null
  latestMessage: {
    id: string
    message: string
    createdAt: string
    senderName: string
    senderRole: FamilyCheerRole
  } | null
  createdAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

export interface FamilyCheerStatusResponse {
  links: FamilyCheerLinkView[]
  activeLink: FamilyCheerLinkView | null
  remoteAvailable: boolean
  schemaReady: boolean
  note: string | null
}

export interface FamilyCheerActionResponse {
  ok: boolean
  link?: FamilyCheerLinkView | null
  message?: FamilyCheerLinkView['latestMessage']
  note?: string | null
}

export function maskName(name: string, allowName: boolean) {
  const trimmed = name.trim()
  if (allowName) return trimmed || '未命名'
  if (!trimmed) return '家人'
  return `${trimmed.slice(0, 1)}＊＊`
}

export function createInviteCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
}
