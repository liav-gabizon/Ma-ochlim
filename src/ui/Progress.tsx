import { useState } from 'react'
import { addDays, shortDate } from '../engine/dates'
import { displayKcal } from '../engine/nutrition'
import { summarizeWeight } from '../engine/weight'
import { allRecipes, dayTotals, type Actions } from '../store'
import type { AppState } from '../types'

export function Progress({ state, actions, today }: { state: AppState; actions: Actions; today: string }) {
  const [kg, setKg] = useState('')
  const [date, setDate] = useState(today)
  const w = summarizeWeight(state.weights, today)
  const recipes = allRecipes(state)

  // סיכום 7 ימים: ימים ללא דיווח לא נספרים כאפס
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i))
  const stats = days.map((d) => ({ d, t: dayTotals(state, d), full: !!state.dayComplete[d] }))
  const logged = stats.filter((s) => s.t.count > 0)
  const full = stats.filter((s) => s.full && s.t.count > 0)
  const avgFull = full.length ? full.reduce((s, x) => s + x.t.kcal, 0) / full.length : null
  const mealsLogged = state.log.filter((e) => !e.deleted && e.localDate >= days[6]).length
  const backups = state.plan.filter((p) => p.date >= days[6] && p.date <= today && (p.status === 'eaten' || p.status === 'swapped') && recipes.find((r) => r.id === p.recipeId)?.backup).length

  const add = () => {
    const n = Number(kg.replace(',', '.'))
    // גבולות פיזיקליים בסיסיים
    if (!(n > 25 && n < 350)) return
    actions.addWeight(date, n)
    setKg('')
  }

  const sorted = [...state.weights].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="screen">
      <section className="card">
        <h2>השבוע</h2>
        <ul className="stats">
          <li><strong>{logged.length}</strong><span>ימים עם תיעוד</span></li>
          <li><strong>{full.length}</strong><span>ימים שסומנו מלאים</span></li>
          <li><strong>{mealsLogged}</strong><span>רישומים ביומן</span></li>
          <li><strong>{backups}</strong><span>פעמים שגיבוי עזר</span></li>
        </ul>
        <p className="muted small">
          {avgFull == null
            ? 'ממוצע צריכה יוצג רק מימים שסימנת כמתועדים במלואם.'
            : `ממוצע בימים מלאים: כ־${displayKcal(avgFull)} קק״ל (${full.length} ימים). ימים חלקיים לא נכללים.`}
        </p>
        <p className="muted small">יום שלא תועד אינו מאפס הישגים ואינו נחשב יום בלי אוכל.</p>
      </section>

      <section className="card">
        <h2>משקל</h2>
        <div className="row wrap">
          <label className="inline">
            <span>תאריך</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="inline">
            <span>ק״ג</span>
            <input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0.0" aria-label="משקל בקילוגרם" />
          </label>
          <button className="btn" onClick={add}>הוסף שקילה</button>
        </div>
        {w.count === 0 ? (
          <p className="muted">אין עדיין שקילות. אין חובה לשקילה יומית.</p>
        ) : (
          <>
            <p>
              אחרון: <strong>{w.latest!.kg} ק״ג</strong> ({shortDate(w.latest!.date)}) · שינוי מההתחלה: {(w.latest!.kg - w.first!.kg >= 0 ? '+' : '') + (w.latest!.kg - w.first!.kg).toFixed(1)} ק״ג · {w.count} מדידות
            </p>
            <p className="muted small">
              {w.weeklyTrend == null
                ? 'עדיין אין מספיק נתונים למגמה (צריך 3 שקילות בכל אחד משני שבועות סמוכים).'
                : `מגמה שבועית: ${w.weeklyTrend >= 0 ? '+' : ''}${w.weeklyTrend.toFixed(1)} ק״ג בממוצע לעומת השבוע הקודם.`}
            </p>
            <WeightChart points={sorted} />
            <details className="more">
              <summary>כל המדידות</summary>
              <ul className="plain">
                {sorted.slice().reverse().map((e) => (
                  <li key={e.id} className="row">
                    <span>{shortDate(e.date)} · {e.kg} ק״ג</span>
                    <button className="link small" onClick={() => actions.deleteWeight(e.id)}>מחיקה</button>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        <p className="muted small">אין שינוי אוטומטי ביעד ואין תחזית. אם הירידה במשקל נמשכת בלי הסבר או מלווה בתסמינים, כדאי לבדוק אצל רופא.</p>
      </section>
    </div>
  )
}

function WeightChart({ points }: { points: { date: string; kg: number }[] }) {
  if (points.length < 2) return null
  const W = 320
  const H = 120
  const pad = 16
  const ts = points.map((p) => Date.parse(p.date))
  const minT = Math.min(...ts)
  const maxT = Math.max(...ts)
  const kgs = points.map((p) => p.kg)
  const minK = Math.min(...kgs) - 0.5
  const maxK = Math.max(...kgs) + 0.5
  const x = (t: number) => pad + ((t - minT) / Math.max(1, maxT - minT)) * (W - pad * 2)
  const y = (k: number) => H - pad - ((k - minK) / (maxK - minK)) * (H - pad * 2)
  // ציר הזמן משמאל לימין גם בממשק עברי, כמו בגרפים מקובלים
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`גרף משקל, ${points.length} מדידות`}>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={points.map((p, i) => `${x(ts[i])},${y(p.kg)}`).join(' ')} />
      {points.map((p, i) => <circle key={p.date} cx={x(ts[i])} cy={y(p.kg)} r="3.5" fill="var(--accent)" />)}
    </svg>
  )
}
