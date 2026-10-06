// שלב 5: מחיקת שורות app_state של שני חשבונות הבדיקה בלבד, כל אחד עם ה־JWT שלו.
// המשתמשים עצמם נשארים (ליאב מוחק או משאיר לבדיקות המשך).
import { sb, login, loadCreds, ownRow } from './lib.mjs'
const c = loadCreds()
for (const tag of ['test1', 'test2']) {
  const s = await login(c[tag].email, c[tag].password)
  for (const t of ['push_subscriptions', 'notification_events', 'app_state']) {
    const r = await sb(`/rest/v1/${t}?user_id=eq.${s.user.id}`, { method: 'DELETE', token: s.access_token, headers: { Prefer: 'return=representation' } })
    console.log(`${tag} ${t}: HTTP ${r.status}, נמחקו ${Array.isArray(r.json) ? r.json.length : '?'}`)
  }
  console.log(`${tag}: שורה אחרי ניקוי =`, await ownRow(s))
}
