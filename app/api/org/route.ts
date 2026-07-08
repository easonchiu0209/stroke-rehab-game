import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 機構帳號基礎 v1（規格書 §2）：建機構、開通治療師 Email 帳號、綁定既有治療師。
// 需 supabase-rbac.sql 套用後生效（organizations 表 + users.email/password_hash/org_id）。

async function getMe(userId: string) {
  const { data } = await supabaseAdmin
    .from('users').select('id, role, org_id, display_name').eq('id', userId).single()
  return data
}

// GET：自己機構資訊 + 成員清單（therapist / org_admin）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await getMe(session.user.id)
  if (!me || !['therapist', 'org_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!me.org_id) return NextResponse.json({ org: null, members: [] })

  const [{ data: org }, { data: members }] = await Promise.all([
    supabaseAdmin.from('organizations').select('id, name, plan, seat_count, expires_at').eq('id', me.org_id).single(),
    supabaseAdmin.from('users').select('id, display_name, email, role').eq('org_id', me.org_id).order('role'),
  ])
  return NextResponse.json({ org, members: members ?? [], myRole: me.role })
}

// POST：action = create（建機構，開立者成為 org_admin）
//              | create-therapist（org_admin 開通治療師 Email 帳號）
//              | bind（org_admin 依 email 綁定既有專業帳號進機構）
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await getMe(session.user.id)
  if (!me || !['therapist', 'org_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const action = String(body.action ?? '')

  if (action === 'create') {
    if (me.org_id) return NextResponse.json({ error: '你已隸屬於一個機構' }, { status: 400 })
    const name = String(body.name ?? '').trim().slice(0, 100)
    if (!name) return NextResponse.json({ error: '請輸入機構名稱' }, { status: 400 })
    const { data: org, error } = await supabaseAdmin
      .from('organizations').insert({ name }).select().single()
    if (error || !org) {
      console.error('org create failed:', error)
      return NextResponse.json({ error: '建立失敗（資料表可能尚未建立）' }, { status: 500 })
    }
    await supabaseAdmin.from('users')
      .update({ org_id: org.id, role: 'org_admin' }).eq('id', me.id)
    return NextResponse.json({ ok: true, org })
  }

  if (action === 'create-therapist') {
    if (me.role !== 'org_admin' || !me.org_id) return NextResponse.json({ error: '僅機構管理者可開通' }, { status: 403 })
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const name = String(body.name ?? '').trim().slice(0, 50)
    if (!email.includes('@') || password.length < 8 || !name) {
      return NextResponse.json({ error: 'Email/姓名必填，密碼至少 8 碼' }, { status: 400 })
    }
    const { data: exists } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle()
    if (exists) return NextResponse.json({ error: '此 Email 已有帳號' }, { status: 400 })
    const password_hash = await bcrypt.hash(password, 10)
    const { error } = await supabaseAdmin.from('users').insert({
      display_name: name, email, password_hash, role: 'therapist', org_id: me.org_id,
    })
    if (error) {
      console.error('create-therapist failed:', error)
      return NextResponse.json({ error: '開通失敗（資料表可能尚未更新）' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'bind') {
    if (me.role !== 'org_admin' || !me.org_id) return NextResponse.json({ error: '僅機構管理者可綁定' }, { status: 403 })
    const email = String(body.email ?? '').trim().toLowerCase()
    const { data: target } = await supabaseAdmin.from('users')
      .select('id, role, org_id').eq('email', email).maybeSingle()
    if (!target) return NextResponse.json({ error: '找不到此 Email 的帳號' }, { status: 404 })
    if (target.org_id) return NextResponse.json({ error: '對方已隸屬其他機構' }, { status: 400 })
    await supabaseAdmin.from('users').update({ org_id: me.org_id }).eq('id', target.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
