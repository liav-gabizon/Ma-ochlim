import { useEffect, useState } from 'react'
import { CATEGORY_LABEL } from '../data/foods'
import { addDays, dayName, isSaturday, shortDate } from '../engine/dates'
import { calcRecipe, displayKcal } from '../engine/nutrition'
import { diffShopping, generateShopping, isEmptyDiff } from '../engine/shopping'
import { SLOT_LABEL } from '../notifications'
import { allRecipes, goalFor, type Actions } from '../store'
import type { AppState, PlannedMeal, ShoppingLine } from '../types'
import { SLOTS } from '../types'

export function WeekTab({ state, actions, today, openMeal }: {
  state: AppState
  actions: Actions
  today: string
  openMeal: (m: PlannedMeal, swap?: boolean) => void
}) {
  const [seg, setSeg] = useState<'week' | 'shop'>('week')
  useEffect(() => actions.ensureWeek(today), [today]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="screen">
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={seg === 'week'} className={`chip ${seg === 'week' ? 'on' : ''}`} onClick={() => setSeg('week')}>תכנון שבועי</button>
        <button role="tab" aria-selected={seg === 'shop'} className={`chip ${seg === 'shop' ? 'on' : ''}`} onClick={() => setSeg('shop')}>רשימת קניות</button>
      </div>
      {seg === 'week' ? <Week state={state} actions={actions} today={today} openMeal={openMeal} /> : <Shopping state={state} actions={actions} today={today} />}
    </div>
  )
}

function Week({ state, actions, today, openMeal }: { state: AppState; actions: Actions; today: string; openMeal: (m: PlannedMeal, swap?: boolean) => void }) {
  const recipes = allRecipes(state)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  return (
    <>
      <p className="muted small">21 משבצות, אחת בחוץ בכל יום. בשבת מתוכננת מנה ביתית במקום יציאה, כי לא מניחים שמקום כשר פתוח.</p>
      {days.map((d) => {
        const meals = SLOTS.map((s) => state.plan.find((p) => p.date === d && p.slot === s)).filter(Boolean) as PlannedMeal[]
        const total = meals.reduce((sum, m) => {
          const r = recipes.find((x) => x.id === m.recipeId)
          return sum + (r ? calcRecipe(r, m.multiplier).kcal : 0)
        }, 0)
        const goal = goalFor(state.goals, d)
        const gap = total - goal
        const within = Math.abs(gap) <= goal * 0.05
        return (
          <section key={d} className="card day-card">
            <div className="row">
              <h3>{d === today ? 'היום' : `יום ${dayName(d)}`} <span className="muted small">{shortDate(d)}</span></h3>
              <span className={`small ${within ? 'ok' : 'muted'}`}>
                צפוי כ־{displayKcal(total)}{within ? '' : ` · ${gap < 0 ? 'חסרים' : 'מעל'} כ־${displayKcal(Math.abs(gap))}`}
              </span>
            </div>
            <ul className="week-slots">
              {meals.map((m) => {
                const r = recipes.find((x) => x.id === m.recipeId)
                return (
                  <li key={m.slot}>
                    <button className="day-row" onClick={() => openMeal(m)}>
                      <span className="slot-time">{m.slot === 'outside' && !isSaturday(d) ? 'בחוץ' : SLOT_LABEL[m.slot].replace('ארוחת ', '').replace('ארוחה ', '')}</span>
                      <span className="slot-name"><strong>{r?.name}</strong></span>
                      {m.status !== 'planned' && <span className="status s-eaten">{m.status === 'skipped' ? 'דולגה' : 'דווחה'}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <div className="actions">
        <button className="btn" onClick={() => actions.regenerateWeek(today)}>תכנן מחדש ארוחות שלא דווחו</button>
      </div>
    </>
  )
}

function shoppingText(lines: ShoppingLine[]) {
  return lines.map((l) => `• ${l.name}: ${l.packs > 1 ? `${l.packs} × ` : ''}${l.packLabel}`).join('\n')
}

function Shopping({ state, actions, today }: { state: AppState; actions: Actions; today: string }) {
  const recipes = allRecipes(state)
  const weekPlan = state.plan.filter((p) => p.date >= today && p.date <= addDays(today, 6))
  const fresh = generateShopping(weekPlan, recipes, state.pantry)
  const confirmed = state.shopping.confirmed
  const diff = confirmed ? diffShopping(confirmed, fresh.toBuy) : null
  const lines = confirmed ?? fresh.toBuy
  const cats = [...new Set(lines.map((l) => l.category))]

  const share = async () => {
    const text = `רשימת קניות\n${shoppingText(lines.filter((l) => !state.shopping.bought[l.foodId]))}`
    try {
      if (navigator.share) await navigator.share({ title: 'רשימת קניות', text })
      else await navigator.clipboard.writeText(text)
    } catch {
      /* המשתמש ביטל שיתוף */
    }
  }

  return (
    <>
      <p className="muted small">מחושב רק מארוחות בבית שעוד לא נאכלו בשבעת הימים הקרובים. ארוחות בחוץ לא מוסיפות מצרכים. ״דרוש״ הוא מה שהמתכונים צריכים; ״לקנייה״ מעוגל לאריזה.</p>
      {confirmed && diff && !isEmptyDiff(diff) && (
        <div className="banner warn">
          <strong>התכנון השתנה מאז שאישרת את הרשימה.</strong>
          <ul className="plain small">
            {diff.added.map((l) => <li key={'a' + l.foodId}>+ {l.name}</li>)}
            {diff.removed.map((l) => <li key={'r' + l.foodId}>− {l.name}</li>)}
            {diff.changed.map(({ from, to }) => <li key={'c' + to.foodId}>{to.name}: {from.packs} ← {to.packs}</li>)}
          </ul>
          <button className="btn small" onClick={() => actions.confirmShopping(fresh.toBuy)}>אשר עדכון הרשימה</button>
        </div>
      )}
      {lines.length === 0 && <p className="muted">אין מה לקנות לפי התכנון והמלאי שסומן.</p>}
      {cats.map((c) => (
        <section key={c} className="card">
          <h3>{CATEGORY_LABEL[c]}</h3>
          <ul className="shop-list">
            {lines.filter((l) => l.category === c).map((l) => (
              <li key={l.foodId} className={state.shopping.bought[l.foodId] ? 'done' : ''}>
                <label className="toggle">
                  <input type="checkbox" checked={!!state.shopping.bought[l.foodId]} onChange={(e) => actions.markBought(l.foodId, e.target.checked)} />
                  <span>
                    <strong>{l.name}</strong>
                    <span className="muted small"> · לקנייה: {l.packs > 1 ? `${l.packs} × ` : ''}{l.packLabel} · דרוש: {l.neededGrams.toLocaleString('he-IL')} ג׳</span>
                  </span>
                </label>
                {!state.pantry[l.foodId] && (
                  <button className="link small" onClick={() => actions.setPantry([l.foodId], true)}>יש בבית</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {fresh.covered.length > 0 && (
        <details className="more">
          <summary>מכוסה ממה שסימנת שיש בבית ({fresh.covered.length})</summary>
          <ul className="plain">
            {fresh.covered.map((l) => (
              <li key={l.foodId} className="row">
                <span>{l.name}</span>
                <button className="link small" onClick={() => actions.setPantry([l.foodId], false)}>נגמר</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="actions">
        {!confirmed && lines.length > 0 && <button className="btn primary" onClick={() => actions.confirmShopping(fresh.toBuy)}>אשר רשימה</button>}
        {lines.length > 0 && <button className="btn" onClick={share}>שיתוף</button>}
        {confirmed && <button className="btn ghost" onClick={() => actions.resetShopping()}>רשימה חדשה</button>}
      </div>
      <p className="muted small">סימון ״נקנה״ מוסיף למלאי, אבל לא מבטיח שהמוצר נשאר לנצח. כמויות לאדם אחד, לפני התאמת אריזות בחנות.</p>
    </>
  )
}
