// שלב 3: בידוד בין test1 ל־test2 מול PostgREST האמיתי. רק שורות של חשבונות הבדיקה.
import { sb, login, loadCreds, ownRow, summary } from './lib.mjs'
const c = loadCreds()
const s1 = await login(c.test1.email, c.test1.password)
const s2 = await login(c.test2.email, c.test2.password)
const t1 = s1.user.id, out = []
const rec = (name, pass, detail) => out.push(`${pass === null ? 'NOT TESTED' : pass ? 'PASS' : 'FAIL'} ${name} · ${detail}`)
const viaServer = (r) => r.headers.get('content-profile') !== null || r.headers.get('sb-gateway-version') !== null || /PGRST|42501|row-level/.test(JSON.stringify(r.json))

// דרוש: לשורה של test1 יש תוכן (נוצרת בבדיקת הסנכרון, או כאן אם חסרה)
let before = await ownRow(s1)
if (!before) {
  const r = await sb('/rest/v1/app_state', { method: 'POST', token: s1.access_token, body: { user_id: t1, state: { isolationProbe: true }, version: 1 }, headers: { Prefer: 'return=minimal' } })
  rec('test1 יוצר שורה משלו', r.status === 201, `HTTP ${r.status}`); before = await ownRow(s1)
}
rec('test1 קורא את השורה שלו', !!before, JSON.stringify(summary(before)))

try {
  let r = await sb(`/rest/v1/app_state?user_id=eq.${t1}&select=user_id,version`, { token: s2.access_token })
  rec('test2 SELECT על test1 → []', r.status === 200 && Array.isArray(r.json) && r.json.length === 0, `HTTP ${r.status} ${JSON.stringify(r.json)}`)
  r = await sb(`/rest/v1/app_state?select=user_id`, { token: s2.access_token })
  rec('test2 SELECT בלי סינון → רק השורה שלו או כלום', r.status === 200 && r.json.every((x) => x.user_id === s2.user.id), `HTTP ${r.status} ${r.json.length} שורות`)
  r = await sb(`/rest/v1/app_state?user_id=eq.${t1}`, { method: 'PATCH', token: s2.access_token, body: { version: 999 }, headers: { Prefer: 'return=representation' } })
  rec('test2 UPDATE על test1 → 0 שורות', r.status === 200 && r.json.length === 0, `HTTP ${r.status} ${JSON.stringify(r.json)}`)
  r = await sb(`/rest/v1/app_state?user_id=eq.${t1}`, { method: 'DELETE', token: s2.access_token, headers: { Prefer: 'return=representation' } })
  rec('test2 DELETE על test1 → 0 שורות', r.status === 200 && r.json.length === 0, `HTTP ${r.status} ${JSON.stringify(r.json)}`)
  r = await sb('/rest/v1/app_state', { method: 'POST', token: s2.access_token, body: { user_id: t1, state: {}, version: 1 } })
  rec('test2 INSERT עם user_id של test1 → נדחה', r.status >= 400 && viaServer(r), `HTTP ${r.status} ${r.json?.code ?? ''} ${r.json?.message ?? ''}`)
  r = await sb(`/rest/v1/app_state?user_id=eq.${t1}&select=user_id`)
  rec('anon (בלי טוקן) SELECT → אין נתונים', (r.status === 200 && r.json.length === 0) || r.status === 401 || r.status === 403 && viaServer(r), `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`)
  r = await sb(`/rest/v1/app_state?user_id=eq.${t1}`, { method: 'PATCH', body: { version: 999 }, headers: { Prefer: 'return=representation' } })
  rec('anon UPDATE → לא משפיע', (r.status === 200 && r.json.length === 0) || r.status >= 400, `HTTP ${r.status}`)
  for (const t of ['push_subscriptions', 'notification_events']) {
    r = await sb(`/rest/v1/${t}?user_id=eq.${t1}&select=user_id`, { token: s2.access_token })
    rec(`test2 SELECT ${t} של test1 → []`, r.status === 200 && r.json.length === 0, `HTTP ${r.status}`)
  }
} catch (e) { if (e.envBlocked) rec('בידוד', null, 'הסביבה חסמה את הבקשה: לא נבדק'); else throw e }

const after = await ownRow(s1)
rec('השורה של test1 לא השתנתה', JSON.stringify(summary(before)) === JSON.stringify(summary(after)), JSON.stringify(summary(after)))
console.log(out.join('\n'))
