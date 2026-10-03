import { useEffect, useState } from 'react'
import { line } from './engine/motivation'
import { dueReminder, showNotification } from './notifications'
import { useAppState } from './store'
import type { PlannedMeal, SlotId } from './types'
import { FoodTab } from './ui/FoodTab'
import { FreeTextSheet } from './ui/FreeTextSheet'
import { MealSheet } from './ui/MealSheet'
import { NoEnergySheet } from './ui/NoEnergySheet'
import { Progress } from './ui/Progress'
import { SettingsSheet } from './ui/SettingsSheet'
import { Today } from './ui/Today'
import { WeekTab } from './ui/WeekTab'
import { SyncChip } from './ui/AccountSection'
import { useCloudSync } from './useCloud'

type Tab = 'today' | 'food' | 'week' | 'progress'
type Overlay =
  | { kind: 'meal'; meal: PlannedMeal; swap?: boolean }
  | { kind: 'noEnergy'; meal: PlannedMeal | null; mode: 'energy' | 'ingredients' }
  | { kind: 'free' }
  | { kind: 'settings' }
  | null

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'היום', icon: '☀︎' },
  { id: 'food', label: 'אוכל', icon: '🍽' },
  { id: 'week', label: 'שבוע וקניות', icon: '🗓' },
  { id: 'progress', label: 'התקדמות', icon: '📈' },
]

export default function App() {
  const { state, actions, saveOk, today: todayFn } = useAppState()
  const [tab, setTab] = useState<Tab>('today')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [toast, setToast] = useState<string | null>(null)
  const today = todayFn()
  const cloudApi = useCloudSync(state, actions.importState)

  useEffect(() => actions.ensureWeek(today), [today]) // eslint-disable-line react-hooks/exhaustive-deps

  // פתיחת הארוחה הנכונה מלחיצה על התראה
  useEffect(() => {
    const openSlot = (slot: SlotId | null) => {
      const m = slot && state.plan.find((p) => p.date === today && p.slot === slot)
      if (m) { setTab('today'); setOverlay({ kind: 'meal', meal: m }) }
    }
    const url = new URL(location.href)
    const slot = url.searchParams.get('meal') as SlotId | null
    if (slot) { openSlot(slot); history.replaceState(null, '', location.pathname) }
    const onMsg = (e: MessageEvent) => e.data?.type === 'open-meal' && openSlot(e.data.slot)
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // בודק תזכורות כל חצי דקה כשהאפליקציה פתוחה
  useEffect(() => {
    const tick = async () => {
      // כשהתזכורות נשלחות מהשרת, לא שולחים גם מהמכשיר כדי שלא תהיה כפילות
      if (state.notifications.serverPush) return
      const due = dueReminder(state, new Date())
      if (!due) return
      actions.markSent(due.key)
      await showNotification(due.title, due.body, due.slot)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  const logged = () => {
    const msg = line(state.profile, 'logged') ?? 'נרשם.'
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const openMeal = (meal: PlannedMeal, swap = false) => setOverlay({ kind: 'meal', meal, swap })
  const current = overlay?.kind === 'meal' ? state.plan.find((p) => p.date === overlay.meal.date && p.slot === overlay.meal.slot) ?? overlay.meal : null

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>מה אוכלים</h1>
          {state.profile.personalLine && <p className="tagline">{state.profile.personalLine}</p>}
        </div>
        <div className="top-actions">
          <SyncChip status={cloudApi.status} />
          <button className="icon-btn" onClick={() => setOverlay({ kind: 'settings' })} aria-label="פרופיל והגדרות">⚙︎</button>
        </div>
      </header>
      {!saveOk && <div className="banner warn">לא הצלחתי לשמור במכשיר. השינויים יישמרו רק עד סגירת הדף.</div>}
      {!!state.mergeConflicts?.length && (
        <button className="banner warn" onClick={() => setOverlay({ kind: 'settings' })}>
          באיחוד נמצאו בחירות שונות. כל האפשרויות נשמרו — לחץ לבחירה בהגדרות.
        </button>
      )}

      <main>
        {tab === 'today' && (
          <Today
            state={state}
            actions={{ ...actions, eatPlanned: (m, p) => { actions.eatPlanned(m, p); logged() } }}
            today={today}
            openMeal={openMeal}
            openNoEnergy={(meal, mode = 'energy') => setOverlay({ kind: 'noEnergy', meal, mode })}
            openFreeText={() => setOverlay({ kind: 'free' })}
            openSettings={() => setOverlay({ kind: 'settings' })}
          />
        )}
        {tab === 'food' && <FoodTab state={state} actions={actions} today={today} />}
        {tab === 'week' && <WeekTab state={state} actions={actions} today={today} openMeal={openMeal} />}
        {tab === 'progress' && <Progress state={state} actions={actions} today={today} />}
      </main>

      <button className="fab" onClick={() => setOverlay({ kind: 'free' })} aria-label="הוספת אוכל: בא לי או אכלתי">+ אוכל</button>

      <nav className="tabbar" aria-label="ניווט ראשי">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {overlay?.kind === 'meal' && current && (
        <MealSheet meal={current} state={state} actions={actions} startWithSwap={overlay.swap} onLogged={logged} onClose={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'noEnergy' && <NoEnergySheet meal={overlay.meal} mode={overlay.mode} state={state} actions={actions} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'free' && <FreeTextSheet state={state} actions={actions} onLogged={logged} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'settings' && <SettingsSheet state={state} actions={actions} today={today} cloudApi={cloudApi} onClose={() => setOverlay(null)} />}
      {cloudApi.choice && (
        <div className="sheet-backdrop">
          <div className="sheet" role="dialog" aria-modal="true" aria-label="בחירת נתונים">
            <div className="sheet-head"><h2>יש נתונים גם במכשיר וגם בחשבון</h2></div>
            <div className="sheet-body">
              <p>בחשבון יש {cloudApi.choice.state.log.filter((e) => !e.deleted).length} רישומי יומן, ובמכשיר {state.log.filter((e) => !e.deleted).length}. מה לשמור?</p>
              <div className="actions">
                <button className="btn primary" onClick={() => cloudApi.resolveChoice('merge')}>לאחד את שניהם (מומלץ)</button>
                <button className="btn" onClick={() => cloudApi.resolveChoice('account')}>להשתמש בנתוני החשבון</button>
                <button className="btn" onClick={() => cloudApi.resolveChoice('device')}>להעלות את נתוני המכשיר</button>
              </div>
              <p className="muted small">באיחוד, ארוחה שנרשמה בשני המקומות נספרת פעם אחת.</p>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
