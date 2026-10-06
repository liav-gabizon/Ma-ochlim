// שלב 1: יצירת שני חשבונות הבדיקה (signUp רגיל, כמו מהאפליקציה). אחר כך ליאב מאשר את המיילים.
// הרצה: TEST_EMAIL_BASE=<gmail של ליאב> node signup.mjs
import { sb, loadCreds, saveCreds, newPassword, CREDS } from './lib.mjs'
const base = process.env.TEST_EMAIL_BASE
if (!base || !base.endsWith('@gmail.com')) throw new Error('TEST_EMAIL_BASE חסר')
const [local, domain] = base.split('@')
const creds = loadCreds()
for (const tag of ['test1', 'test2']) {
  if (creds[tag]) { console.log(`${tag}: כבר קיים בקובץ הפרטים, דילוג`); continue }
  const email = `${local}+maochlim-${tag}@${domain}`
  const password = newPassword()
  const r = await sb('/auth/v1/signup', { method: 'POST', body: { email, password } })
  if (r.status >= 300) { console.log(`${tag}: signup נכשל ${r.status} ${r.json?.error_code || r.json?.msg || ''}`); continue }
  const id = r.json?.id ?? r.json?.user?.id
  creds[tag] = { email, password, id }
  saveCreds(creds)
  console.log(`${tag}: נוצר, id=${id}, confirmed=${Boolean(r.json?.email_confirmed_at ?? r.json?.user?.email_confirmed_at)}`)
}
console.log(`פרטי הכניסה נשמרו ב־${CREDS} (הרשאות 600). ממתינים לאישור המיילים.`)
