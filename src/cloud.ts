import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { RECIPES } from './data/recipes'
import type { AppState } from './types'

// חיבור לחשבון ולגיבוי בענן (Supabase). המפתח כאן הוא המפתח הציבורי בלבד;
// ההרשאות נאכפות בשרת ב־RLS, כך שכל משתמש רואה רק את הנתונים שלו.

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined
export const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string | undefined

export const cloud: SupabaseClient | null = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null

export interface RemoteState {
  state: AppState
  version: number
  updated_at: string
}

export async function fetchRemote(userId: string): Promise<RemoteState | null> {
  if (!cloud) return null
  const { data, error } = await cloud.from('app_state').select('state, version, updated_at').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as RemoteState | null
}

/** שמות מנות לנוסח ההתראה בשרת; לא נשלחים נתוני משקל או קלוריות */
function withHints(s: AppState): AppState & { recipeNames: Record<string, string> } {
  const all = [...RECIPES, ...s.customRecipes]
  const ids = new Set(s.plan.map((p) => p.recipeId))
  const recipeNames: Record<string, string> = {}
  for (const id of ids) recipeNames[id] = all.find((r) => r.id === id)?.name ?? ''
  return { ...s, recipeNames }
}

export type SaveResult = { ok: true; version: number } | { ok: false; conflict: true; remote: RemoteState } | { ok: false; conflict: false; error: string }

/** שמירה עם בדיקת גרסה: אם החשבון השתנה ממכשיר אחר, מחזירים התנגשות למיזוג */
export async function saveRemote(userId: string, state: AppState, baseVersion: number | null): Promise<SaveResult> {
  if (!cloud) return { ok: false, conflict: false, error: 'no_cloud' }
  const body = withHints(state)
  if (baseVersion == null) {
    const { data, error } = await cloud.from('app_state').insert({ user_id: userId, state: body, version: 1 }).select('version').single()
    if (!error) return { ok: true, version: data.version }
    if (error.code !== '23505') return { ok: false, conflict: false, error: error.message }
  } else {
    const { data, error } = await cloud.from('app_state').update({ state: body, version: baseVersion + 1 })
      .eq('user_id', userId).eq('version', baseVersion).select('version')
    if (error) return { ok: false, conflict: false, error: error.message }
    if (data && data.length === 1) return { ok: true, version: data[0].version }
  }
  const remote = await fetchRemote(userId)
  if (!remote) return { ok: false, conflict: false, error: 'missing_row' }
  return { ok: false, conflict: true, remote }
}

export async function callApi(session: Session, body: Record<string, unknown>) {
  if (!cloud) throw new Error('no_cloud')
  const { data, error } = await cloud.functions.invoke('app-api', { body, headers: { Authorization: `Bearer ${session.access_token}` } })
  if (error) {
    let detail = ''
    try { detail = (await (error as { context?: Response }).context?.json())?.error ?? '' } catch { /* אין גוף */ }
    throw new Error(detail || error.message)
  }
  return data
}

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function pushSupport(): { supported: boolean; needsInstall: boolean } {
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return { supported: hasApis, needsInstall: ios && !standalone }
}

/** רישום המכשיר להתראות מהשרת. נקרא רק אחרי לחיצה ישירה של המשתמש. */
export async function subscribePush(userId: string): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  if (!cloud || !VAPID_PUBLIC) return 'unsupported'
  if (!pushSupport().supported) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC) }))
    const j = sub.toJSON()
    const { error } = await cloud.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, user_agent: navigator.userAgent.slice(0, 200) },
      { onConflict: 'endpoint' },
    )
    return error ? 'error' : 'ok'
  } catch {
    return 'error'
  }
}

export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await cloud?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch { /* אין מנוי */ }
}

export async function deviceCount(): Promise<number> {
  if (!cloud) return 0
  const { count } = await cloud.from('push_subscriptions').select('id', { count: 'exact', head: true })
  return count ?? 0
}
