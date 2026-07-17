import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  createInviteCode,
  maskName,
  type FamilyCheerActionResponse,
  type FamilyCheerLinkView,
  type FamilyCheerStatusResponse,
} from '@/lib/familyCheer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type LinkRow = {
  id: string
  patient_user_id: string
  supporter_user_id: string | null
  invite_code: string
  status: 'pending' | 'active' | 'revoked'
  allow_name_share: boolean
  allow_picture_share: boolean
  allow_progress_share: boolean
  allow_alerts_share: boolean
  patient_note: string | null
  supporter_note: string | null
  created_at: string
  accepted_at: string | null
  revoked_at: string | null
}

type UserRow = {
  id: string
  display_name: string
  picture_url: string | null
  nickname?: string | null
}

type MessageRow = {
  id: string
  link_id: string
  sender_user_id: string
  recipient_user_id: string
  message: string
  created_at: string
}

type MessageView = NonNullable<FamilyCheerLinkView['latestMessage']>

function schemaHint() {
  return '請先套用 supabase-family-cheer.sql 候選 schema'
}

function jsonStatus(message: string, status = 500) {
  return NextResponse.json({ ok: false, note: message }, { status })
}

function pickDisplayName(row?: UserRow | null) {
  return row?.nickname || row?.display_name || '家人'
}

function buildView(
  row: LinkRow,
  me: string,
  patient: UserRow | null,
  supporter: UserRow | null,
  latestMessage: MessageView | null,
): FamilyCheerLinkView {
  const role = row.patient_user_id === me ? 'patient' : 'supporter'
  const patientName = pickDisplayName(patient)
  const supporterName = supporter ? pickDisplayName(supporter) : null

  return {
    id: row.id,
    role,
    status: row.status,
    inviteCode: row.invite_code,
    patientName: role === 'supporter' ? maskName(patientName, row.allow_name_share) : patientName,
    patientPictureUrl: role === 'supporter' && !row.allow_picture_share ? null : patient?.picture_url ?? null,
    supporterName,
    allowNameShare: row.allow_name_share,
    allowPictureShare: row.allow_picture_share,
    allowProgressShare: row.allow_progress_share,
    allowAlertsShare: row.allow_alerts_share,
    note: role === 'patient' ? row.patient_note : row.supporter_note,
    latestMessage,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  }
}

async function loadState(me: string): Promise<FamilyCheerStatusResponse> {
  try {
    const { data: rows, error: linkError } = await supabaseAdmin
      .from('family_cheer_links')
      .select('*')
      .or(`patient_user_id.eq.${me},supporter_user_id.eq.${me}`)
      .order('created_at', { ascending: false })

    if (linkError) throw linkError

    const linkRows = (rows ?? []) as LinkRow[]
    const userIds = new Set<string>()
    const linkIds = linkRows.map(row => row.id)
    for (const row of linkRows) {
      userIds.add(row.patient_user_id)
      if (row.supporter_user_id) userIds.add(row.supporter_user_id)
    }

    const [usersResult, messagesResult] = await Promise.all([
      userIds.size
        ? supabaseAdmin.from('users').select('id, display_name, picture_url, nickname').in('id', Array.from(userIds))
        : Promise.resolve({ data: [] as UserRow[], error: null }),
      linkIds.length
        ? supabaseAdmin
            .from('family_cheer_messages')
            .select('id, link_id, sender_user_id, recipient_user_id, message, created_at')
            .in('link_id', linkIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as MessageRow[], error: null }),
    ])

    if (usersResult.error) throw usersResult.error
    if (messagesResult.error) throw messagesResult.error

    const userMap = new Map((usersResult.data ?? []).map(user => [user.id, user as UserRow]))
    const latestByLink = new Map<string, MessageView>()
    for (const message of (messagesResult.data ?? []) as MessageRow[]) {
      if (latestByLink.has(message.link_id)) continue
      const sender = userMap.get(message.sender_user_id)
      latestByLink.set(message.link_id, {
        id: message.id,
        message: message.message,
        createdAt: message.created_at,
        senderName: pickDisplayName(sender),
        senderRole: linkRows.find(row => row.id === message.link_id)?.patient_user_id === message.sender_user_id ? 'patient' : 'supporter',
      })
    }

    const links = linkRows.map(row =>
      buildView(
        row,
        me,
        userMap.get(row.patient_user_id) ?? null,
        row.supporter_user_id ? userMap.get(row.supporter_user_id) ?? null : null,
        latestByLink.get(row.id) ?? null,
      )
    )

    return {
      links,
      activeLink: links.find(link => link.status === 'active') ?? links[0] ?? null,
      remoteAvailable: true,
      schemaReady: true,
      note: links.length ? null : '尚未建立遠端家人關係',
    }
  } catch (error) {
    console.warn('family-cheer load failed', error)
    return {
      links: [],
      activeLink: null,
      remoteAvailable: false,
      schemaReady: false,
      note: schemaHint(),
    }
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await loadState(session.user.id))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user.id
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  try {
    if (action === 'create_invite') {
      const note = String(body.note ?? '').trim().slice(0, 80) || null
      const { data: existing } = await supabaseAdmin
        .from('family_cheer_links')
        .select('*')
        .eq('patient_user_id', me)
        .in('status', ['pending', 'active'])
        .maybeSingle()

      if (existing) {
        const state = await loadState(me)
        return NextResponse.json({ ok: true, link: state.activeLink ?? state.links[0] ?? null, note: '已存在關係，直接沿用現有邀請碼' } satisfies FamilyCheerActionResponse)
      }

      const inviteCode = createInviteCode()
      const { error } = await supabaseAdmin.from('family_cheer_links').insert({
        patient_user_id: me,
        invite_code: inviteCode,
        status: 'pending',
        patient_note: note,
      })
      if (error) throw error

      const state = await loadState(me)
      return NextResponse.json({ ok: true, link: state.activeLink ?? state.links[0] ?? null })
    }

    if (action === 'accept_invite') {
      const inviteCode = String(body.inviteCode ?? '').trim().toUpperCase()
      if (!inviteCode) return jsonStatus('請輸入邀請碼', 400)

      const { data: link, error } = await supabaseAdmin
        .from('family_cheer_links')
        .select('*')
        .eq('invite_code', inviteCode)
        .eq('status', 'pending')
        .maybeSingle()
      if (error) throw error
      if (!link) return jsonStatus('找不到可加入的邀請碼', 404)
      if (link.patient_user_id === me) return jsonStatus('不能加入自己的邀請', 400)

      const { error: updateError } = await supabaseAdmin
        .from('family_cheer_links')
        .update({
          supporter_user_id: me,
          status: 'active',
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', link.id)
        .is('supporter_user_id', null)
      if (updateError) throw updateError

      const state = await loadState(me)
      return NextResponse.json({ ok: true, link: state.activeLink ?? state.links[0] ?? null })
    }

    if (action === 'revoke_link') {
      const linkId = String(body.linkId ?? '')
      if (!linkId) return jsonStatus('缺少關係 ID', 400)

      const { data: link, error } = await supabaseAdmin
        .from('family_cheer_links')
        .select('*')
        .eq('id', linkId)
        .maybeSingle()
      if (error) throw error
      if (!link) return jsonStatus('找不到關係', 404)
      if (link.patient_user_id !== me && link.supporter_user_id !== me) return jsonStatus('沒有權限解除這個關係', 403)

      const { error: updateError } = await supabaseAdmin
        .from('family_cheer_links')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', linkId)
      if (updateError) throw updateError

      return NextResponse.json({ ok: true })
    }

    if (action === 'update_privacy') {
      const linkId = String(body.linkId ?? '')
      if (!linkId) return jsonStatus('缺少關係 ID', 400)

      const { data: link, error } = await supabaseAdmin
        .from('family_cheer_links')
        .select('*')
        .eq('id', linkId)
        .maybeSingle()
      if (error) throw error
      if (!link) return jsonStatus('找不到關係', 404)
      if (link.patient_user_id !== me) return jsonStatus('只有邀請者可以調整隱私權限', 403)

      const { error: updateError } = await supabaseAdmin
        .from('family_cheer_links')
        .update({
          allow_name_share: Boolean(body.allowNameShare),
          allow_picture_share: Boolean(body.allowPictureShare),
          allow_progress_share: Boolean(body.allowProgressShare),
          allow_alerts_share: Boolean(body.allowAlertsShare),
          updated_at: new Date().toISOString(),
        })
        .eq('id', linkId)
      if (updateError) throw updateError

      const state = await loadState(me)
      return NextResponse.json({ ok: true, link: state.activeLink ?? state.links[0] ?? null })
    }

    if (action === 'send_cheer') {
      const linkId = String(body.linkId ?? '')
      const message = String(body.message ?? '').trim().slice(0, 80)
      if (!linkId || !message) return jsonStatus('請輸入鼓勵內容', 400)

      const { data: link, error } = await supabaseAdmin
        .from('family_cheer_links')
        .select('*')
        .eq('id', linkId)
        .maybeSingle()
      if (error) throw error
      if (!link || link.status !== 'active') return jsonStatus('這段關係尚未啟用', 400)
      if (link.supporter_user_id !== me) return jsonStatus('只有家人端可以送出單向鼓勵', 403)

      const { error: insertError } = await supabaseAdmin.from('family_cheer_messages').insert({
        link_id: linkId,
        sender_user_id: me,
        recipient_user_id: link.patient_user_id,
        message,
      })
      if (insertError) throw insertError

      const state = await loadState(link.patient_user_id)
      const updatedLink = state.links.find(item => item.id === linkId) ?? state.activeLink
      return NextResponse.json({ ok: true, link: updatedLink ?? null })
    }

    return jsonStatus('unknown action', 400)
  } catch (error) {
    console.error('family-cheer action failed', error)
    return jsonStatus(schemaHint(), 501)
  }
}
