import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cloud, fetchRemote, saveRemote, type RemoteState } from './cloud'
import { hasUserData, mergeStates } from './engine/sync'
import type { AppState } from './types'

export type SyncStatus = 'disabled' | 'signedOut' | 'syncing' | 'saved' | 'pending' | 'offline' | 'error' | 'choose'

const VKEY = (uid: string) => `ma-ochlim:cloud-version:${uid}`
const readVersion = (uid: string): number | null => {
  try {
    const v = localStorage.getItem(VKEY(uid))
    return v ? Number(v) : null
  } catch {
    return null
  }
}
const writeVersion = (uid: string, v: number | null) => {
  try {
    if (v == null) localStorage.removeItem(VKEY(uid))
    else localStorage.setItem(VKEY(uid), String(v))
  } catch { /* אחסון חסום */ }
}

/**
 * סנכרון בין המכשיר לחשבון. המכשיר נשאר מקור העבודה (עובד גם בלי רשת),
 * וכל שינוי נשלח לחשבון עם בדיקת גרסה. בהתנגשות ממזגים ולא דורסים.
 */
export function useCloudSync(state: AppState, replaceState: (s: AppState) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>(cloud ? 'signedOut' : 'disabled')
  const [choice, setChoice] = useState<RemoteState | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const version = useRef<number | null>(null)
  const synced = useRef<string | null>(null) // JSON של המצב האחרון שנשמר בחשבון
  const ready = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const saving = useRef(false)

  useEffect(() => {
    if (!cloud) return
    cloud.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = cloud.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const push = useCallback(async () => {
    const uid = session?.user.id
    if (!uid || !ready.current || saving.current) return
    const current = stateRef.current
    const json = JSON.stringify(current)
    if (json === synced.current) return
    if (!navigator.onLine) { setStatus('offline'); return }
    saving.current = true
    setStatus('syncing')
    try {
      const r = await saveRemote(uid, current, version.current)
      if (r.ok) {
        version.current = r.version
        writeVersion(uid, r.version)
        synced.current = json
        setSavedAt(new Date().toISOString())
        setLastError(null)
        setStatus(JSON.stringify(stateRef.current) === json ? 'saved' : 'pending')
      } else if (r.conflict) {
        // מכשיר אחר שמר בינתיים: ממזגים ושומרים שוב
        version.current = r.remote.version
        writeVersion(uid, r.remote.version)
        replaceState(mergeStates(stateRef.current, r.remote.state))
        setStatus('pending')
      } else {
        setLastError(r.error)
        setStatus('error')
      }
    } catch (e) {
      setLastError(String(e))
      setStatus(navigator.onLine ? 'error' : 'offline')
    } finally {
      saving.current = false
    }
  }, [session, replaceState])

  // סנכרון ראשון אחרי התחברות
  useEffect(() => {
    ready.current = false
    if (!cloud) return
    if (!session) { setStatus('signedOut'); version.current = null; synced.current = null; return }
    const uid = session.user.id
    let cancelled = false
    ;(async () => {
      setStatus('syncing')
      try {
        const remote = await fetchRemote(uid)
        if (cancelled) return
        const local = stateRef.current
        const known = readVersion(uid)
        let replaced = false
        if (!remote) {
          // החשבון ריק: הנתונים מהמכשיר עוברים אליו
          version.current = null
        } else if (!hasUserData(local)) {
          version.current = remote.version
          synced.current = JSON.stringify(remote.state)
          replaceState(remote.state)
          replaced = true
        } else if (known != null) {
          // אותו חשבון כבר סונכרן במכשיר הזה: ממזגים שינויים שלא נשלחו
          version.current = remote.version
          replaceState(mergeStates(local, remote.state))
          replaced = true
        } else if (!hasUserData(remote.state)) {
          version.current = remote.version
        } else {
          // יש נתונים גם במכשיר וגם בחשבון, והמשתמש צריך לבחור
          version.current = remote.version
          setChoice(remote)
          setStatus('choose')
          return
        }
        writeVersion(uid, version.current)
        ready.current = true
        // אחרי החלפת מצב השמירה תצא מאפקט השינוי, כשהמצב החדש כבר במסך
        if (!replaced) await push()
      } catch (e) {
        setLastError(String(e))
        setStatus(navigator.onLine ? 'error' : 'offline')
      }
    })()
    return () => { cancelled = true }
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  // שמירה אחרי כל שינוי, בהשהיה קצרה
  useEffect(() => {
    if (!ready.current) return
    if (JSON.stringify(state) !== synced.current) setStatus('pending')
    const t = setTimeout(push, 800)
    return () => clearTimeout(t)
  }, [state, push])

  useEffect(() => {
    const on = () => push()
    window.addEventListener('online', on)
    const id = setInterval(push, 15_000)
    return () => { window.removeEventListener('online', on); clearInterval(id) }
  }, [push])

  const resolveChoice = useCallback(async (pick: 'device' | 'account' | 'merge') => {
    if (!choice || !session) return
    const uid = session.user.id
    if (pick === 'account') {
      synced.current = JSON.stringify(choice.state)
      replaceState(choice.state)
    } else if (pick === 'merge') {
      replaceState(mergeStates(stateRef.current, choice.state))
    }
    version.current = choice.version
    writeVersion(uid, choice.version)
    setChoice(null)
    ready.current = true
    setTimeout(push, 50)
  }, [choice, session, replaceState, push])

  const signOut = useCallback(async () => {
    if (session) writeVersion(session.user.id, null)
    await cloud?.auth.signOut()
  }, [session])

  return { session, status, choice, resolveChoice, lastError, savedAt, signOut, pushNow: push }
}

export type CloudApi = ReturnType<typeof useCloudSync>
