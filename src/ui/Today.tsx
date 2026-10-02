import { useState } from 'react'
import { hhmmToMinutes, localMinutes } from '../engine/dates'
import { calcRecipe, displayKcal } from '../engine/nutrition'
import { line, smallWins } from '../engine/motivation'
import { SLOT_LABEL } from '../notifications'
import { allRecipes, dayTotals, entryKcal, goalFor, type Actions } from '../store'
import type { AppState, PlannedMeal, SlotStatus } from '../types'
import { SLOTS } from '../types'
import { Kcal, KosherUnverified, timeText } from './common'

const STATUS_LABEL: Record<SlotStatus, string> = {
  planned: 'מתוכננת',
  cooking: 'בהכנה',
  eaten: 'נאכלה',
  partial: 'נאכלה חלקית',
  swapped: 'הוחלפה',
  skipped: 'דולגה',
}

export function Today({ state, actions, today, openMeal, openNoEnergy, openFreeText, openSettings }: {
  state: AppState
  actions: Actions
  today: string
  openMeal: (m: PlannedMeal, swap?: boolean) => void
  openNoEnergy: (m: PlannedMeal | null, mode?: 'energy' | 'ingredients') => void
  openFreeText: () => void
  openSettings: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  // אחרי ״אכלתי״ הכרטיס מתחלף לארוחה הבאה; נעילה קצרה מונעת שלחיצה כפולה תרשום גם אותה
  const [locked, setLocked] = useState(false)
  const lockBriefly = () => { setLocked(true); setTimeout(() => setLocked(false), 1200) }
  const recipes = allRecipes(state)
  const goal = goalFor(state.goals, today)
  const totals = dayTotals(state, today)
  const nowMin = localMinutes(new Date(), state.profile.timezone)
  const meals = SLOTS.map((s) => state.plan.find((p) => p.date === today && p.slot === s)).filter(Boolean) as PlannedMeal[]
  const next = meals.find((m) => m.status === 'planned' || m.status === 'cooking')
  const nextRecipe = next && recipes.find((r) => r.id === next.recipeId)
  const pct = Math.min(100, (totals.kcal / goal) * 100)
  const eatenCount = meals.filter((m) => m.status === 'eaten' || m.status === 'partial' || m.status === 'swapped').length
  const usedBackup = meals.some((m) => (m.status === 'eaten' || m.status === 'swapped') && recipes.find((r) => r.id === m.recipeId)?.backup)
  const win = state.profile.motivationOn ? smallWins(eatenCount, usedBackup) : null
  const pastDue = meals.filter((m) => m.status === 'planned' && nowMin > hhmmToMinutes(state.profile.mealTimes[m.slot]) + 90)
  const motivation = pastDue.length >= 2 ? line(state.profile, 'lowLogging') : line(state.profile, 'start')
  const complete = !!state.dayComplete[today]

  return (
    <div className="screen">
      <section className="summary card" aria-live="polite">
        <p className="big">
          דיווחת על <strong>{displayKcal(totals.kcal)}</strong> מתוך {goal.toLocaleString('he-IL')} קלוריות
        </p>
        <div className="bar" role="progressbar" aria-valuenow={Math.round(totals.kcal)} aria-valuemin={0} aria-valuemax={goal} aria-label="התקדמות דיווח היום">
          <div style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">
          {complete ? 'סימנת שהיום תועד במלואו.' : 'המספר כולל רק מה שתיעדת.'}
          {!totals.complete && ' לחלק מהפריטים אין ערך ידוע, ולכן הסך חלקי.'}
        </p>
      </section>

      {state.profile.allergies === 'unanswered' && (
        <button className="banner info" onClick={openSettings}>עדיין לא הוגדרו אלרגיות ורגישויות. סינון בטוח יופעל אחרי ההגדרה ←</button>
      )}

      {motivation && <p className="lead">{motivation}</p>}

      {next && nextRecipe ? (
        <section className="next card hero">
          <div className="eyebrow">הארוחה הבאה · {SLOT_LABEL[next.slot]} · {state.profile.mealTimes[next.slot]}</div>
          <button className="next-title" onClick={() => openMeal(next)}>
            <h2>{nextRecipe.name}</h2>
            <span className="muted">
              <Kcal calc={calcRecipe(nextRecipe, next.multiplier)} /> · {nextRecipe.items.length} רכיבים · {timeText(nextRecipe)}
            </span>
            {nextRecipe.kind === 'outside' && <KosherUnverified />}
          </button>
          <div className="grid-actions">
            <button className="btn primary" disabled={locked} onClick={() => { actions.eatPlanned(next); lockBriefly() }}>אכלתי</button>
            <button className="btn" disabled={locked} onClick={() => openMeal(next, true)}>החלף</button>
            <button className="btn" disabled={locked} onClick={() => openNoEnergy(next)}>אין לי כוח</button>
            <button className="btn" disabled={locked} onClick={() => openNoEnergy(next, 'ingredients')}>אין לי מצרכים</button>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>אין עוד ארוחה מתוכננת להיום</h2>
          <p className="muted">אם בא לך משהו, אפשר לכתוב אותו. מחר מתחיל בלי פיצוי על היום.</p>
          <button className="btn" onClick={() => openNoEnergy(null)}>משהו קל</button>
        </section>
      )}

      <section>
        <h3>היום</h3>
        <ul className="day-list">
          {meals.map((m) => {
            const r = recipes.find((x) => x.id === m.recipeId)
            const overdue = m.status === 'planned' && nowMin > hhmmToMinutes(state.profile.mealTimes[m.slot]) + 60
            return (
              <li key={m.slot}>
                <button className="day-row" onClick={() => openMeal(m)}>
                  <span className="slot-time">{state.profile.mealTimes[m.slot]}</span>
                  <span className="slot-name">
                    <strong>{r?.name ?? 'ארוחה'}</strong>
                    <span className="muted small">{SLOT_LABEL[m.slot]}</span>
                  </span>
                  <span className={`status s-${overdue ? 'overdue' : m.status}`}>
                    {m.status === 'eaten' && '✓ '}
                    {overdue ? 'טרם דווח' : STATUS_LABEL[m.status]}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <div className="row">
          <h3>יומן היום</h3>
          <button className="btn small" onClick={openFreeText}>+ הוספה</button>
        </div>
        {totals.entries.length === 0 ? (
          <p className="muted">עוד לא נרשם כלום היום. זה לא אומר שלא אכלת.</p>
        ) : (
          <ul className="log-list">
            {totals.entries.map((e) => {
              const t = entryKcal(e)
              return (
                <li key={e.id} className="card soft">
                  <div className="row">
                    <strong>{e.title}{e.portion !== 1 && ` · ${e.portion === 0.5 ? 'חצי מנה' : `×${e.portion}`}`}</strong>
                    <span>{t.complete ? `כ־${displayKcal(t.kcal)}` : `${displayKcal(t.kcal)} (חלקי)`}</span>
                  </div>
                  {editing === e.id ? (
                    <div className="actions">
                      {[0.5, 1, 1.5].map((p) => (
                        <button key={p} className={`chip ${e.portion === p ? 'on' : ''}`} onClick={() => actions.updatePortion(e.id, p)}>
                          {p === 0.5 ? 'חצי' : p === 1 ? 'מנה מלאה' : 'מנה וחצי'}
                        </button>
                      ))}
                      <button className="btn small danger" onClick={() => { actions.deleteLog(e.id); setEditing(null) }}>ביטול הרישום</button>
                      <button className="btn small ghost" onClick={() => setEditing(null)}>סגור</button>
                    </div>
                  ) : (
                    <button className="link" onClick={() => setEditing(e.id)}>עריכה</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <label className="toggle">
          <input type="checkbox" checked={complete} onChange={(e) => actions.setDayComplete(today, e.target.checked)} />
          <span>היום תועד במלואו</span>
        </label>
        {win && <p className="win">{win}</p>}
      </section>
    </div>
  )
}
