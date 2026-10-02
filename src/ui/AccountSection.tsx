import { useEffect, useState } from 'react'
import { callApi, cloud, deviceCount, pushSupport, subscribePush, unsubscribePush } from '../cloud'
import { validateImport, mergeStates } from '../engine/sync'
import type { Actions } from '../store'
import type { AppState } from '../types'
import type { CloudApi } from '../useCloud'

const STATUS_TEXT: Record<CloudApi['status'], string> = {
  disabled: 'הגיבוי בענן לא מוגדר בגרסה הזו',
  signedOut: 'לא מחובר. הנתונים נשמרים רק במכשיר.',
  syncing: 'שומר בחשבון…',
  saved: 'נשמר בחשבון',
  pending: 'ממתין לשמירה',
  offline: 'אין רשת. השינויים נשמרו במכשיר ויישלחו כשהרשת תחזור.',
  error: 'השמירה בחשבון נכשלה. השינויים נשמרו במכשיר ויישלחו שוב.',
  choose: 'צריך לבחור אילו נתונים לשמור',
}

export function SyncChip({ status }: { status: CloudApi['status'] }) {
  if (status === 'disabled') return null
  const label = { signedOut: 'במכשיר בלבד', syncing: 'שומר…', saved: '☁︎ נשמר', pending: 'ממתין', offline: 'אין רשת', error: 'לא נשמר', choose: 'נדרשת בחירה' }[status]
  return <span className={`sync-chip s-${status}`} role="status">{label}</span>
}

export function AccountSection({ state, actions, cloudApi }: { state: AppState; actions: Actions; cloudApi: CloudApi }) {
  const { session, status, lastError, savedAt } = cloudApi
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [devices, setDevices] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const support = pushSupport()

  useEffect(() => {
    if (session) deviceCount().then(setDevices)
  }, [session])

  if (!cloud) return <p className="muted small">{STATUS_TEXT.disabled}</p>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    if (mode === 'signup') {
      const { data, error } = await cloud!.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
      if (error) setMsg(authError(error.message))
      else if (!data.session) setMsg('נשלח אליך מייל לאישור החשבון. אחרי שתלחץ על הקישור, חזור לכאן והתחבר.')
    } else {
      const { error } = await cloud!.auth.signInWithPassword({ email, password })
      if (error) setMsg(authError(error.message))
    }
    setBusy(false)
  }

  const enablePush = async () => {
    if (!session) return
    setBusy(true)
    const r = await subscribePush(session.user.id)
    setBusy(false)
    if (r === 'ok') {
      actions.setNotifications({ enabled: true, timesConfirmed: true, serverPush: true })
      setDevices(await deviceCount())
      setMsg('המכשיר נרשם לתזכורות. אפשר לשלוח התראת ניסיון.')
    } else if (r === 'denied') setMsg('ההרשאה להתראות נדחתה. אפשר לשנות בהגדרות האייפון ← התראות ← מה אוכלים.')
    else if (r === 'unsupported') setMsg(support.needsInstall ? 'באייפון צריך קודם להוסיף את האפליקציה למסך הבית ולפתוח אותה משם.' : 'הדפדפן הזה לא תומך בהתראות מהשרת.')
    else setMsg('הרישום להתראות נכשל. נסה שוב.')
  }

  const scheduleTest = async () => {
    if (!session) return
    setBusy(true)
    try {
      await cloudApi.pushNow()
      await callApi(session, { action: 'schedule_test', delaySec: 60 })
      setMsg('התראת ניסיון תישלח בעוד כדקה. עכשיו נעל את האייפון וחכה.')
    } catch (e) {
      setMsg(String(e).includes('no_subscription') ? 'המכשיר עוד לא רשום להתראות. לחץ קודם על ״הפעל תזכורות במסך הנעול״.' : 'לא הצלחתי לתזמן את ההתראה. נסה שוב.')
    }
    setBusy(false)
  }

  const deleteAccount = async () => {
    if (!session) return
    setBusy(true)
    try {
      await unsubscribePush()
      await callApi(session, { action: 'delete_account' })
      await cloudApi.signOut()
      actions.deleteAll()
      setMsg('החשבון וכל הנתונים בו נמחקו, וגם הנתונים במכשיר.')
    } catch {
      setMsg('מחיקת החשבון נכשלה. שום דבר לא נמחק; נסה שוב.')
    }
    setBusy(false)
    setConfirmDelete(false)
  }

  return (
    <>
      <p className="small" role="status">
        <strong>{STATUS_TEXT[status]}</strong>
        {savedAt && status === 'saved' && <span className="muted"> · {new Date(savedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>}
      </p>
      {status === 'error' && lastError && <p className="muted small">פרטים: {lastError.slice(0, 120)}</p>}

      {!session ? (
        <form onSubmit={submit} className="account-form">
          <p className="muted small">חשבון שומר גיבוי של כל הנתונים ומאפשר תזכורות כשהאייפון נעול. הנתונים שכבר במכשיר יעברו לחשבון בהתחברות הראשונה.</p>
          <label className="field"><span>אימייל</span><input id="acc-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span>סיסמה</span><input id="acc-pass" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <div className="actions">
            <button className="btn primary" type="submit" disabled={busy}>{mode === 'signup' ? 'יצירת חשבון' : 'התחברות'}</button>
            <button className="btn ghost" type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'כבר יש לי חשבון' : 'אין לי חשבון עדיין'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="small">מחובר כ־<bdi>{session.user.email}</bdi></p>
          <div className="actions">
            <button className="btn" onClick={() => cloudApi.pushNow()} disabled={busy}>שמור עכשיו</button>
            <button className="btn ghost" onClick={() => cloudApi.signOut()}>התנתקות</button>
          </div>

          <h3>תזכורות במסך הנעול</h3>
          {support.needsInstall && (
            <div className="banner info">
              באייפון התזכורות עובדות רק מהאפליקציה שעל מסך הבית: בספארי לוחצים על כפתור השיתוף ← ״הוספה למסך הבית״, ופותחים את ״מה אוכלים״ מהאייקון.
            </div>
          )}
          <p className="small">
            {state.notifications.serverPush ? `תזכורות מהשרת פעילות` : 'תזכורות מהשרת כבויות'}
            {devices != null && ` · מכשירים רשומים: ${devices}`}
          </p>
          <div className="actions">
            <button className="btn primary" onClick={enablePush} disabled={busy || support.needsInstall || !support.supported}>הפעל תזכורות במסך הנעול</button>
            <button className="btn" onClick={scheduleTest} disabled={busy || !devices}>שלח התראת ניסיון בעוד דקה</button>
            {state.notifications.serverPush && (
              <button className="btn ghost" onClick={async () => { await unsubscribePush(); actions.setNotifications({ serverPush: false }); setDevices(await deviceCount()) }}>כבה במכשיר הזה</button>
            )}
          </div>

          <h3>מחיקת החשבון</h3>
          {!confirmDelete ? (
            <button className="btn danger" onClick={() => setConfirmDelete(true)}>מחיקת החשבון וכל הנתונים</button>
          ) : (
            <div className="banner warn">
              זה ימחק את החשבון, את הגיבוי ואת רישום ההתראות, וגם את הנתונים במכשיר. אי אפשר לשחזר.
              <div className="actions">
                <button className="btn danger" onClick={deleteAccount} disabled={busy}>כן, למחוק לצמיתות</button>
                <button className="btn ghost" onClick={() => setConfirmDelete(false)}>ביטול</button>
              </div>
            </div>
          )}
        </>
      )}
      {msg && <p className="small note" role="status">{msg}</p>}
    </>
  )
}

function authError(m: string) {
  if (/invalid login/i.test(m)) return 'האימייל או הסיסמה לא נכונים.'
  if (/not confirmed/i.test(m)) return 'החשבון עוד לא אושר. פתח את המייל שנשלח ולחץ על הקישור.'
  if (/already registered/i.test(m)) return 'כבר יש חשבון עם האימייל הזה. אפשר להתחבר.'
  if (/password/i.test(m)) return 'הסיסמה צריכה להיות באורך 8 תווים לפחות.'
  if (/rate limit/i.test(m)) return 'נשלחו יותר מדי מיילים בזמן קצר. נסה שוב בעוד שעה.'
  return `הפעולה נכשלה: ${m}`
}

/** ייבוא נתונים מקובץ או מטקסט שהועתק (למשל מהתצוגה המקדימה הקודמת) */
export function ImportSection({ state, actions }: { state: AppState; actions: Actions }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [parsed, setParsed] = useState<AppState | null>(null)

  const parse = (raw: string) => {
    try {
      const s = validateImport(JSON.parse(raw))
      setParsed(s)
      setMsg(s ? `נמצאו ${s.log.filter((e) => !e.deleted).length} רישומי יומן ו־${s.weights.length} שקילות. מה לעשות איתם?` : 'הקובץ לא נראה כמו גיבוי של מה אוכלים.')
    } catch {
      setParsed(null)
      setMsg('לא הצלחתי לקרוא את הטקסט. ודא שהעתקת את כל הגיבוי.')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state))
      setMsg('הנתונים הועתקו. אפשר להדביק אותם באפליקציה המותקנת ← הגדרות ← ייבוא.')
    } catch {
      setText(JSON.stringify(state))
      setMsg('ההעתקה האוטומטית נחסמה. הטקסט מופיע בתיבה; סמן והעתק אותו.')
    }
  }

  return (
    <>
      <div className="actions">
        <button className="btn" onClick={copy}>העתק את כל הנתונים</button>
        <label className="btn">
          ייבוא מקובץ
          <input type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) parse(await f.text()) }} />
        </label>
      </div>
      <label className="field">
        <span>או הדבקת נתונים שהועתקו</span>
        <textarea id="import-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"schema":1,…}' />
      </label>
      {text && !parsed && <button className="btn small" onClick={() => parse(text)}>בדוק את הנתונים</button>}
      {msg && <p className="small" role="status">{msg}</p>}
      {parsed && (
        <div className="actions">
          <button className="btn primary" onClick={() => { actions.importState(mergeStates(state, parsed)); setParsed(null); setText(''); setMsg('הנתונים מוזגו. רישומים כפולים לא נוספו פעמיים.') }}>מזג עם מה שיש</button>
          <button className="btn" onClick={() => { actions.importState(parsed); setParsed(null); setText(''); setMsg('הנתונים הוחלפו בגיבוי.') }}>החלף את מה שיש</button>
        </div>
      )}
    </>
  )
}
