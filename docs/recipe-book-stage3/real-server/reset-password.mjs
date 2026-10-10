// שחזור גישה לחשבונות הבדיקה הקיימים כשקובץ הפרטים אבד (למשל מעבר למחשב אחר).
// שולח מייל איפוס לכל חשבון, מקבל את הקישור מהמייל בהדבקה במסוף, קובע סיסמה אקראית חדשה
// ושומר אותה רק ב־CREDS. הסיסמה לא מודפסת ולא עוברת בצ׳אט.
// הרצה (במסוף של ליאב): node reset-password.mjs
import { createInterface } from 'node:readline/promises'
import { sb, login, loadCreds, saveCreds, newPassword, CREDS } from './lib.mjs'
const rl = createInterface({ input: process.stdin, output: process.stdout })
const base = process.env.TEST_EMAIL_BASE || (await rl.question('כתובת ה־gmail הבסיסית (בלי +): ')).trim()
if (!base.endsWith('@gmail.com')) throw new Error('נדרשת כתובת gmail')
const [local, domain] = base.split('@')
const creds = loadCreds()

/** מחלץ access_token מקישור האיפוס: או מהכתובת אחרי ההפניה, או מבקשת ה־verify בלי לעקוב אחרי ההפניה */
async function tokenFromLink(link) {
  const direct = /[#&?]access_token=([^&\s]+)/.exec(link)
  if (direct) return direct[1]
  const res = await fetch(link, { redirect: 'manual' })
  const loc = res.headers.get('location') ?? ''
  const m = /[#&?]access_token=([^&\s]+)/.exec(loc)
  if (!m) throw new Error(`לא התקבל טוקן מהקישור (HTTP ${res.status} ${/error_code=([^&]+)/.exec(loc)?.[1] ?? ''})`)
  return m[1]
}

for (const tag of ['test1', 'test2']) {
  const email = `${local}+maochlim-${tag}@${domain}`
  if (creds[tag]) {
    try { await login(creds[tag].email, creds[tag].password); console.log(`${tag}: הפרטים בקובץ תקינים, דילוג`); continue } catch { /* ממשיכים לאיפוס */ }
  }
  const r = await sb('/auth/v1/recover', { method: 'POST', body: { email } })
  if (r.status >= 300) { console.log(`${tag}: שליחת מייל האיפוס נכשלה ${r.status} ${r.json?.error_code || r.json?.msg || ''}`); continue }
  console.log(`${tag}: נשלח מייל איפוס אל …+maochlim-${tag}. אל תלחץ על הקישור: העתק את כתובת הקישור (לחיצה ימנית ← העתק קישור).`)
  const link = (await rl.question(`${tag}: הדבק כאן את הקישור: `)).trim()
  try {
    const token = await tokenFromLink(link)
    const password = newPassword()
    const u = await sb('/auth/v1/user', { method: 'PUT', token, body: { password } })
    if (u.status !== 200) { console.log(`${tag}: קביעת הסיסמה נכשלה ${u.status} ${u.json?.error_code || u.json?.msg || ''}`); continue }
    creds[tag] = { email, password, id: u.json.id }
    saveCreds(creds)
    const s = await login(email, password)
    console.log(`${tag}: סיסמה חדשה נשמרה, התחברות נבדקה, id=${s.user.id.slice(0, 8)}…`)
  } catch (e) { console.log(`${tag}: ${e.message}`) }
}
rl.close()
console.log(`הקובץ: ${CREDS} (הרשאות 600).`)
