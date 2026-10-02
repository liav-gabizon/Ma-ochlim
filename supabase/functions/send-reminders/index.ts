// שולח תזכורות ארוחה ב־Web Push. מופעל כל דקה על ידי pg_cron.
// הכללים זהים ל־src/notifications.ts: דיווח/דילוג/החלפה מבטלים, שעות שקטות, תקרה יומית,
// תפוגה של 120 דקות ומפתח ייחודי לכל אירוע כדי שלא תישלח אותה תזכורת פעמיים.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0'
import webpush from 'npm:web-push@3.6.7'

const SLOTS = ['morning', 'outside', 'evening'] as const
type Slot = (typeof SLOTS)[number]
const SLOT_LABEL: Record<Slot, string> = { morning: 'ארוחת בוקר', outside: 'ארוחה בחוץ', evening: 'ארוחת ערב' }
const EXPIRY_MIN = 120

function localDate(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t: string) => p.find((x) => x.type === t)!.value
  return `${g('year')}-${g('month')}-${g('day')}`
}
function localMinutes(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value)
}
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }
function inQuiet(min: number, start: string, end: string) {
  const s = hm(start), e = hm(end)
  return s <= e ? min >= s && min < e : min >= s || min < e
}

// deno-lint-ignore no-explicit-any
type State = any

function dueReminders(s: State, now: Date, sentToday: number): { key: string; slot: Slot; title: string; body: string }[] {
  const n = s?.notifications
  if (!n?.enabled || !n?.timesConfirmed) return []
  const tz = s.profile?.timezone ?? 'Asia/Jerusalem'
  const today = localDate(now, tz)
  const min = localMinutes(now, tz)
  if (inQuiet(min, n.quietStart, n.quietEnd)) return []
  if (sentToday >= n.dailyCap) return []
  const out = []
  for (const slot of SLOTS) {
    // deno-lint-ignore no-explicit-any
    const meal = (s.plan ?? []).find((p: any) => p.date === today && p.slot === slot)
    if (!meal || meal.status !== 'planned') continue
    const slotKey = `${today}:${slot}`
    const snooze = s.snoozed?.[slotKey]
    let due = hm(s.profile.mealTimes[slot])
    let version = String(meal.recipeId)
    if (snooze) {
      const until = new Date(snooze)
      if (now < until) continue
      due = localMinutes(until, tz)
      version += ':snz:' + snooze
    }
    if (min < due || min > due + EXPIRY_MIN) continue
    const name = s.recipeNames?.[meal.recipeId]
    const body = n.genericLockText || !name ? 'זמן לאכול. לפתוח את הארוחה?' : `זמן לאכול: ${name}. לפתוח את הארוחה?`
    out.push({ key: `${slotKey}:${version}`, slot, title: SLOT_LABEL[slot], body })
    if (out.length + sentToday >= n.dailyCap) break
  }
  return out
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: cfgRows, error: cfgErr } = await admin.rpc('push_config')
  const cfg = cfgRows?.[0]
  if (cfgErr || !cfg) return new Response('config error', { status: 500 })
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return new Response('forbidden', { status: 403 })
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private)

  const now = new Date()
  const { data: subs } = await admin.from('push_subscriptions').select('*')
  const byUser = new Map<string, typeof subs>()
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
  const summary = { users: byUser.size, sent: 0, failed: 0, skipped: 0, tests: 0 }

  // deno-lint-ignore no-explicit-any
  async function sendAll(userId: string, payload: any): Promise<boolean> {
    let ok = false
    for (const sub of byUser.get(userId) ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * EXPIRY_MIN, urgency: 'high' })
        ok = true
        await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), last_error: null }).eq('id', sub.id)
      } catch (e) {
        // deno-lint-ignore no-explicit-any
        const code = (e as any)?.statusCode
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id)
        else await admin.from('push_subscriptions').update({ last_error: `${code ?? ''} ${String(e).slice(0, 200)}` }).eq('id', sub.id)
      }
    }
    return ok
  }

  // התראות ניסיון שתוזמנו מהאפליקציה
  const { data: tests } = await admin.from('notification_events').select('*').eq('status', 'scheduled').lte('detail', now.toISOString())
  for (const t of tests ?? []) {
    const { data: claimed } = await admin.from('notification_events').update({ status: 'sending' }).eq('id', t.id).eq('status', 'scheduled').select()
    if (!claimed?.length) continue
    const ok = await sendAll(t.user_id, { title: 'מה אוכלים', body: 'התראת ניסיון: אם רואים אותה במסך הנעול, התזכורות עובדות.', tag: 'test' })
    await admin.from('notification_events').update({ status: ok ? 'sent' : 'failed' }).eq('id', t.id)
    summary.tests++
  }

  for (const userId of byUser.keys()) {
    const { data: row } = await admin.from('app_state').select('state').eq('user_id', userId).maybeSingle()
    if (!row) continue
    const tz = row.state?.profile?.timezone ?? 'Asia/Jerusalem'
    const today = localDate(now, tz)
    const { count } = await admin.from('notification_events').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'sent').like('key', `${today}:%`)
    for (const r of dueReminders(row.state, now, count ?? 0)) {
      // המפתח הייחודי מבטיח שליחה אחת גם אם שתי ריצות חופפות
      const { data: ins, error } = await admin.from('notification_events').insert({ user_id: userId, key: r.key, status: 'sending' }).select()
      if (error || !ins?.length) { summary.skipped++; continue }
      const ok = await sendAll(userId, { title: r.title, body: r.body, slot: r.slot, tag: `${today}:${r.slot}` })
      await admin.from('notification_events').update({ status: ok ? 'sent' : 'failed' }).eq('id', ins[0].id)
      ok ? summary.sent++ : summary.failed++
    }
  }
  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })
})
