import { useState } from 'react'
import { ALLERGEN_OPTIONS } from '../engine/constraints'
import { notificationSupport, showNotification, SLOT_LABEL } from '../notifications'
import { goalFor, type Actions } from '../store'
import type { Allergen, AppState, Profile, SlotId } from '../types'
import { SLOTS } from '../types'
import type { CloudApi } from '../useCloud'
import { AccountSection, ImportSection } from './AccountSection'
import { Sheet } from './common'

export function SettingsSheet({ state, actions, today, onClose, cloudApi }: { state: AppState; actions: Actions; today: string; onClose: () => void; cloudApi: CloudApi }) {
  const p = state.profile
  const n = state.notifications
  const [goal, setGoal] = useState(String(goalFor(state.goals, today)))
  const [goalFrom, setGoalFrom] = useState(today)
  const [goalMsg, setGoalMsg] = useState('')
  const [perm, setPerm] = useState(notificationSupport())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  const saveGoal = () => {
    const k = Number(goal)
    if (!(k >= 1000 && k <= 6000)) return setGoalMsg('יעד צריך להיות בין 1,000 ל־6,000 קק״ל ליום.')
    actions.setGoal(k, goalFrom)
    setGoalMsg(`נשמר: ${k.toLocaleString('he-IL')} קק״ל ליום החל מ־${goalFrom}. ימים קודמים לא משתנים.`)
  }

  const toggleAllergen = (a: Allergen) => {
    const cur = Array.isArray(p.allergies) ? p.allergies : []
    const next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]
    actions.setProfile({ allergies: next.length ? next : 'none' })
  }

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return setPerm('unsupported')
    // הבקשה נשלחת רק אחרי לחיצה ישירה, כנדרש ב־iOS
    const r = await Notification.requestPermission()
    setPerm(r)
    actions.setNotifications({ enabled: r === 'granted', timesConfirmed: r === 'granted' })
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ma-ochlim-${today}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Sheet title="פרופיל והגדרות" onClose={onClose}>
      <section>
        <h3>חשבון וגיבוי</h3>
        <AccountSection state={state} actions={actions} cloudApi={cloudApi} />
      </section>

      <section>
        <h3>יעד</h3>
        <p className="muted small">2,500 הוא יעד שבחרת. האפליקציה לא מחשבת יעד ולא מבטיחה קצב עלייה.</p>
        <div className="row wrap">
          <label className="inline"><span>קק״ל ליום</span><input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
          <label className="inline"><span>החל מ־</span><input type="date" value={goalFrom} onChange={(e) => setGoalFrom(e.target.value)} /></label>
          <button className="btn" onClick={saveGoal}>שמור יעד</button>
        </div>
        {goalMsg && <p className="small" role="status">{goalMsg}</p>}
      </section>

      <section>
        <h3>זמני ארוחות</h3>
        {SLOTS.map((s) => (
          <label key={s} className="inline">
            <span>{SLOT_LABEL[s]}</span>
            <input type="time" value={p.mealTimes[s]} onChange={(e) => actions.setProfile({ mealTimes: { ...p.mealTimes, [s]: e.target.value } as Record<SlotId, string> })} />
          </label>
        ))}
      </section>

      <section>
        <h3>אלרגיות ורגישויות</h3>
        <p className="muted small">כשרות אינה תשובה לשאלה הזו. רכיב שסומן נחסם בכל מקום: תכנון, החלפות, גיבויים וכתיבה חופשית.</p>
        <label className="toggle">
          <input type="checkbox" checked={p.allergies === 'none'} onChange={(e) => actions.setProfile({ allergies: e.target.checked ? 'none' : 'unanswered' })} />
          <span>אין אלרגיות ידועות</span>
        </label>
        <div className="chips">
          {ALLERGEN_OPTIONS.map((a) => (
            <button key={a.id} className={`chip ${Array.isArray(p.allergies) && p.allergies.includes(a.id as Allergen) ? 'on' : ''}`} onClick={() => toggleAllergen(a.id as Allergen)}>{a.label}</button>
          ))}
        </div>
      </section>

      <section>
        <h3>כשרות</h3>
        <p className="muted small">מוצרים ומקומות כשרים, כל התעודות מקובלות. בשר וחלב לא משולבים באותה ארוחה.</p>
        <label className="inline">
          <span>המתנה בין בשר לחלב (שעות, לפי המנהג שלך)</span>
          <input inputMode="decimal" value={p.meatDairyWaitHours ?? ''} placeholder="לא הוגדר" onChange={(e) => actions.setProfile({ meatDairyWaitHours: e.target.value === '' ? null : Number(e.target.value) })} />
        </label>
      </section>

      <section>
        <h3>עידוד</h3>
        <div className="chips">
          {([['calm', 'רגוע'], ['practical', 'ענייני'], ['energetic', 'אנרגטי']] as [Profile['tone'], string][]).map(([t, l]) => (
            <button key={t} className={`chip ${p.tone === t ? 'on' : ''}`} onClick={() => actions.setProfile({ tone: t })}>{l}</button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={p.motivationOn} onChange={(e) => actions.setProfile({ motivationOn: e.target.checked })} />
          <span>הצג מסרי עידוד (תזכורות ענייניות נשארות)</span>
        </label>
        <label className="field">
          <span>משפט אישי</span>
          <input value={p.personalLine} onChange={(e) => actions.setProfile({ personalLine: e.target.value })} />
        </label>
      </section>

      <section>
        <h3>תזכורות</h3>
        <p className="muted small">
          שלוש תזכורות ארוחה בשעות שלמעלה. דיווח, דילוג או החלפה מבטלים את התזכורת, ותזכורת שעברו שעתיים מזמנה לא נשלחת.
          {state.notifications.serverPush
            ? ' התזכורות נשלחות מהשרת, גם כשהאפליקציה סגורה והאייפון נעול.'
            : ' בלי חשבון, התזכורות נשלחות רק כשהאפליקציה פתוחה. לתזכורות במסך הנעול: התחבר למעלה והפעל אותן.'}
        </p>
        <p className="small">מצב הרשאה: {perm === 'granted' ? 'מאושר' : perm === 'denied' ? 'נדחה (אפשר לשנות בהגדרות המכשיר)' : perm === 'unsupported' ? 'לא נתמך כאן' : 'טרם התבקש'}</p>
        {state.notifications.serverPush ? null : perm !== 'granted' ? (
          <button className="btn" onClick={enableNotifications} disabled={perm === 'unsupported' || perm === 'denied'}>אשר את השעות והפעל תזכורות</button>
        ) : (
          <label className="toggle">
            <input type="checkbox" checked={n.enabled} onChange={(e) => actions.setNotifications({ enabled: e.target.checked, timesConfirmed: true })} />
            <span>תזכורות פעילות</span>
          </label>
        )}
        <div className="row wrap">
          <label className="inline"><span>שעות שקטות מ־</span><input type="time" value={n.quietStart} onChange={(e) => actions.setNotifications({ quietStart: e.target.value })} /></label>
          <label className="inline"><span>עד</span><input type="time" value={n.quietEnd} onChange={(e) => actions.setNotifications({ quietEnd: e.target.value })} /></label>
        </div>
        <label className="inline">
          <span>תקרה יומית</span>
          <select value={n.dailyCap} onChange={(e) => actions.setNotifications({ dailyCap: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={n.genericLockText} onChange={(e) => actions.setNotifications({ genericLockText: e.target.checked })} />
          <span>נוסח כללי במסך הנעילה (בלי שם מנה)</span>
        </label>
        <button className="btn ghost" disabled={perm !== 'granted'} onClick={async () => setTestMsg((await showNotification('מה אוכלים', 'התראת ניסיון')) ? 'נשלחה התראת ניסיון.' : 'ההתראה לא נשלחה.')}>
          שלח התראת ניסיון
        </button>
        {testMsg && <p className="small" role="status">{testMsg}</p>}
      </section>

      <section>
        <h3>פרטים אישיים (אופציונלי)</h3>
        <label className="inline"><span>גובה (ס״מ)</span><input inputMode="numeric" value={p.heightCm ?? ''} onChange={(e) => actions.setProfile({ heightCm: e.target.value ? Number(e.target.value) : null })} /></label>
        <label className="inline"><span>יעד משקל (ק״ג)</span><input inputMode="decimal" value={p.weightGoalKg ?? ''} onChange={(e) => actions.setProfile({ weightGoalKg: e.target.value ? Number(e.target.value) : null })} /></label>
      </section>

      <section>
        <h3>נתונים</h3>
        <p className="muted small">{cloudApi.session ? 'הנתונים נשמרים במכשיר ובחשבון שלך.' : 'הנתונים נשמרים רק במכשיר הזה.'} אין שיתוף אוטומטי.</p>
        <div className="actions">
          <button className="btn" onClick={exportData}>ייצוא נתונים לקובץ</button>
        </div>
        <ImportSection state={state} actions={actions} />
        <div className="actions">
          {!confirmDelete ? (
            <button className="btn danger" onClick={() => setConfirmDelete(true)}>מחיקת הנתונים במכשיר</button>
          ) : (
            <button className="btn danger" onClick={async () => { if (cloudApi.session) await cloudApi.signOut(); actions.deleteAll(); onClose() }}>בטוח? למחוק מהמכשיר{cloudApi.session ? ' (תנותק, והגיבוי בחשבון יישאר)' : ''}</button>
          )}
        </div>
      </section>
    </Sheet>
  )
}
