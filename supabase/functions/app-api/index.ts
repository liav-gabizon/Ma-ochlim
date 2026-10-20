// פעולות חשבון שדורשות הרשאת שרת: תזמון התראת ניסיון ומחיקת חשבון.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0'

// CORS מוגבל לדומיין של האפליקציה ולפיתוח מקומי. אפשר להוסיף דומיינים ב-ALLOWED_ORIGINS (מופרד בפסיקים).
const ALLOWED_ORIGINS = new Set([
  'https://ma-ochlim-one.vercel.app',
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean),
])
const isAllowedOrigin = (origin: string) =>
  ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
const corsFor = (req: Request): Record<string, string> => {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'https://ma-ochlim-one.vercel.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data: u, error } = await admin.auth.getUser(token)
  if (error || !u?.user) return json({ error: 'unauthorized' }, 401)
  const userId = u.user.id
  const body = await req.json().catch(() => ({}))

  if (body.action === 'schedule_test') {
    const delay = Math.min(Math.max(Number(body.delaySec) || 60, 0), 600)
    const due = new Date(Date.now() + delay * 1000).toISOString()
    const { count } = await admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    if (!count) return json({ error: 'no_subscription' }, 400)
    const { error: e } = await admin.from('notification_events').insert({ user_id: userId, key: `test:${due}`, status: 'scheduled', detail: due })
    if (e) return json({ error: 'insert_failed' }, 500)
    return json({ scheduledFor: due, devices: count })
  }

  if (body.action === 'delete_account') {
    // מחיקת המשתמש מוחקת בשרשור את המצב, המנויים לפוש ואירועי ההתראות
    await admin.auth.admin.signOut(token, 'global').catch(() => {})
    const { error: e } = await admin.auth.admin.deleteUser(userId)
    if (e) return json({ error: 'delete_failed' }, 500)
    return json({ deleted: true })
  }

  return json({ error: 'unknown_action' }, 400)
})
