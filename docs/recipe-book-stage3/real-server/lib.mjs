// עזרים משותפים לבדיקות מול Supabase האמיתי. בלי תלויות: fetch בלבד.
// סיסמאות נשמרות רק ב־CREDS (מחוץ לריפו ולתיקיית הפרויקט), ולא מודפסות.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'

const env = Object.fromEntries(readFileSync(new URL('../../../.env.production', import.meta.url), 'utf8')
  .split('\n').filter((l) => /^VITE_/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)))
export const URL_ = env.VITE_SUPABASE_URL
export const KEY = env.VITE_SUPABASE_KEY
export const REF = 'fjsgstkuvqmyrqzsvjef'
export const CREDS = process.env.MAOCHLIM_CREDS || `${homedir()}/.maochlim-test-creds.json`

export function loadCreds() { return existsSync(CREDS) ? JSON.parse(readFileSync(CREDS, 'utf8')) : {} }
export function saveCreds(c) { writeFileSync(CREDS, JSON.stringify(c, null, 2), { mode: 0o600 }) }
export const newPassword = () => randomBytes(18).toString('base64url')

/** בקשה ל־Supabase. אם ה־proxy של הסביבה חוסם, זורק שגיאה מסומנת: זה לא ממצא על השרת. */
export async function sb(path, { method = 'GET', token, body, headers = {} } = {}) {
  let res
  try {
    res = await fetch(URL_ + path, {
      method,
      headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    const err = new Error(`ENV_BLOCKED: ${e.cause?.message || e.message}`); err.envBlocked = true; throw err
  }
  // תשובה מה־proxy של הסביבה (x-deny-reason) אינה תשובה של Supabase: לא ממצא, ״לא נבדק״
  if (res.headers.get('x-deny-reason') || (res.status === 403 && !res.headers.get('sb-request-id') && !res.headers.get('sb-gateway-version'))) {
    const err = new Error(`ENV_BLOCKED: ${res.status} ${res.headers.get('x-deny-reason') || ''}`); err.envBlocked = true; throw err
  }
  const text = await res.text()
  let json; try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json, headers: res.headers }
}

export async function login(email, password) {
  const r = await sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })
  if (r.status !== 200) throw new Error(`login ${email.replace(/^[^+]*/, '…')}: ${r.status} ${r.json?.error_code || r.json?.msg || ''}`)
  return r.json // { access_token, refresh_token, expires_in, expires_at, token_type, user }
}

/** השורה של המשתמש בלבד, לפי user_id, עם ה־JWT שלו */
export async function ownRow(session) {
  const r = await sb(`/rest/v1/app_state?user_id=eq.${session.user.id}&select=user_id,version,updated_at,state`, { token: session.access_token })
  if (r.status !== 200) throw new Error(`ownRow ${r.status} ${JSON.stringify(r.json)}`)
  return r.json[0] ?? null
}
export const summary = (row) => row ? { version: row.version, updated_at: row.updated_at, customRecipes: row.state?.customRecipes?.length ?? null } : null
