import { useState } from 'react'
import { checkRecipe } from '../engine/constraints'
import { kosherOf, calcRecipe } from '../engine/nutrition'
import { suggestSwaps } from '../engine/swaps'
import { SLOT_LABEL } from '../notifications'
import { allRecipes, rankCtx, type Actions } from '../store'
import type { AppState, PlannedMeal } from '../types'
import { Certainty, diffText, EFFORT_LABEL, Kcal, KosherUnverified, multiplierText, proteinText, Sheet, timeText } from './common'

const KOSHER_LABEL = { meat: 'בשרי', dairy: 'חלבי', parve: 'פרווה', conflict: 'בשר וחלב יחד: חסום' }

export function MealSheet({ meal, state, actions, onClose, startWithSwap = false, onLogged }: {
  meal: PlannedMeal
  state: AppState
  actions: Actions
  onClose: () => void
  startWithSwap?: boolean
  onLogged?: () => void
}) {
  const recipes = allRecipes(state)
  const r = recipes.find((x) => x.id === meal.recipeId)
  const [showSwap, setShowSwap] = useState(startWithSwap)
  const [tolerance, setTolerance] = useState(0.1)
  if (!r) return null
  const calc = calcRecipe(r, meal.multiplier)
  const constraint = checkRecipe(r, state.profile)
  const swaps = showSwap
    ? suggestSwaps({ targetKcal: calc.kcal, slot: meal.slot, excludeId: r.id, recipes, ctx: rankCtx(state), tolerance, targetIsEstimate: calc.certainty === 'estimate' })
    : []
  const done = meal.status !== 'planned' && meal.status !== 'cooking'

  return (
    <Sheet title={`${SLOT_LABEL[meal.slot]} · ${r.name}`} onClose={onClose}>
      <div className="meal-meta">
        <Kcal calc={calc} /> · {proteinText(calc.protein)} · <Certainty source={calc.certainty} />
        <div className="muted">
          {timeText(r)} · {EFFORT_LABEL[r.effort]} · {KOSHER_LABEL[kosherOf(r.items)]}
          {multiplierText(meal.multiplier)}
        </div>
      </div>
      {!constraint.ok && <div className="banner warn">לא מתאים לאילוצים שהוגדרו: {constraint.reasons.join(', ')}</div>}
      {r.note && <p className="note">{r.note}</p>}
      <table className="items">
        <tbody>
          {calc.items.map((it, i) => (
            <tr key={i}>
              <td>{it.name}{it.optional && <span className="muted"> (תוספת)</span>}</td>
              <td className="num">{Math.round(it.grams)} ג׳</td>
              <td className="num">{it.kcal == null ? 'לא ידוע' : `${Math.round(it.kcal)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.kind === 'outside' && (
        <p className="muted small">
          <KosherUnverified /> אומדן לפי רכיבים. בדוק תעודת כשרות בסניף עצמו; שם הרשת לא מספיק.
        </p>
      )}

      {!done ? (
        <div className="actions">
          <button className="btn primary" onClick={() => { actions.eatPlanned(meal, 1); onLogged?.(); onClose() }}>אכלתי</button>
          <button className="btn" onClick={() => { actions.eatPlanned(meal, 0.5); onLogged?.(); onClose() }}>אכלתי חצי</button>
          <button className="btn" onClick={() => setShowSwap((v) => !v)}>לא בא לי, החלף</button>
          {meal.status === 'planned' && r.kind === 'home' && (
            <button className="btn ghost" onClick={() => actions.setSlotStatus(meal.date, meal.slot, 'cooking')}>מתחיל להכין</button>
          )}
          {meal.status === 'planned' && (
            <button className="btn ghost" onClick={() => { actions.snooze(`${meal.date}:${meal.slot}`, new Date(Date.now() + state.notifications.snoozeMinutes * 60000).toISOString()); onClose() }}>
              הזכר לי בעוד {state.notifications.snoozeMinutes} דקות
            </button>
          )}
          <button className="btn ghost" onClick={() => { actions.setSlotStatus(meal.date, meal.slot, 'skipped'); onClose() }}>דילגתי על הארוחה</button>
        </div>
      ) : (
        <div className="actions">
          <button className="btn ghost" onClick={() => { actions.setSlotStatus(meal.date, meal.slot, 'planned'); }}>החזר למתוכנן</button>
        </div>
      )}

      {showSwap && (
        <section className="swaps">
          <h3>חלופות בטווח {Math.round(tolerance * 100)}% (כ־{Math.round(calc.kcal * (1 - tolerance))}–{Math.round(calc.kcal * (1 + tolerance))})</h3>
          {swaps.length === 0 ? (
            <div className="empty">
              <p>לא מצאתי ארוחה מתאימה בטווח הזה, ולא אציע מנה שאינה שקולה.</p>
              {tolerance < 0.2 && <button className="btn" onClick={() => setTolerance(0.2)}>הרחב טווח ל־20%</button>}
            </div>
          ) : (
            swaps.map((s) => (
              <button key={s.recipe.id} className="swap-card" onClick={() => { actions.replacePlanned(meal.date, meal.slot, s.recipe.id, s.multiplier); onClose() }}>
                <strong>{s.recipe.name}</strong>
                <span>
                  <Kcal calc={s.calc} /> · {s.similarOnlyByEstimate ? 'דומה בהערכה' : diffText(s.diff)} · {proteinText(s.calc.protein)}
                </span>
                <span className="muted">{timeText(s.recipe)}{multiplierText(s.multiplier)}</span>
              </button>
            ))
          )}
        </section>
      )}
    </Sheet>
  )
}
