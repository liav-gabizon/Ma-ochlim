import { useState } from 'react'
import { FOOD_BY_ID } from '../data/foods'
import { calcRecipe } from '../engine/nutrition'
import { eligible, prefScore } from '../engine/swaps'
import { line } from '../engine/motivation'
import { allRecipes, newIdemKey, rankCtx, type Actions } from '../store'
import type { AppState, Effort, PlannedMeal, Recipe } from '../types'
import { Kcal, Sheet, timeText } from './common'

// מצב ״אין לי כוח״ (פרק 13): קצר, בלי מסך עמוס מתכונים ובלי דרישה לעדכן את כל המזווה.

type Filter = 'none' | '5' | 'heat' | 'outside'
const FILTERS: { id: Filter; label: string; efforts: Effort[] }[] = [
  { id: 'none', label: 'ללא בישול', efforts: ['none'] },
  { id: '5', label: 'עד 5 דקות', efforts: ['none', '5'] },
  { id: 'heat', label: 'חימום פשוט', efforts: ['none', '5', 'heat'] },
  { id: 'outside', label: 'קנייה בחוץ', efforts: [] },
]

/** מצרכים שלא מסומנים ״יש בבית״. שמן ותבלינים לא חוסמים גיבוי. */
export function missingFor(r: Recipe, pantry: Record<string, boolean>): string[] {
  return r.items.filter((i) => !i.optional && i.foodId !== 'olive_oil' && !pantry[i.foodId]).map((i) => i.foodId)
}

export function NoEnergySheet({ meal, state, actions, onClose, mode = 'energy' }: {
  meal: PlannedMeal | null
  state: AppState
  actions: Actions
  onClose: () => void
  mode?: 'energy' | 'ingredients'
}) {
  const [filter, setFilter] = useState<Filter>(mode === 'ingredients' ? 'heat' : 'none')
  const recipes = allRecipes(state)
  const ctx = rankCtx(state)
  const slot = meal?.slot ?? 'evening'
  const current = meal ? recipes.find((r) => r.id === meal.recipeId) : undefined
  const currentMissing = current && current.kind === 'home' ? missingFor(current, state.pantry) : []

  const f = FILTERS.find((x) => x.id === filter)!
  const pool =
    filter === 'outside'
      ? recipes.filter((r) => eligible(r, 'outside', ctx))
      : recipes.filter((r) => r.kind === 'home' && (r.backup || state.alwaysGood.includes(r.id)) && f.efforts.includes(r.effort) && eligible(r, r.slots.includes(slot) ? slot : r.slots[0], ctx))
  const ranked = pool
    .map((r) => ({ r, missing: r.kind === 'home' ? missingFor(r, state.pantry) : [], s: prefScore(r.id, ctx) + (state.alwaysGood.includes(r.id) ? 2 : 0) }))
    .sort((a, b) => a.missing.length - b.missing.length || b.s - a.s)
  const available = ranked.filter((x) => x.missing.length === 0).slice(0, 3)
  const unavailable = ranked.filter((x) => x.missing.length > 0).slice(0, 3)

  const choose = (r: Recipe, ate: boolean) => {
    const m = 1
    if (meal) actions.replacePlanned(meal.date, meal.slot, r.id, m, false)
    if (ate) {
      const c = calcRecipe(r, m)
      actions.logEntry({
        idemKey: newIdemKey(),
        title: r.name,
        slot: meal?.slot,
        mode: 'replace',
        items: c.items.map((it) => ({ name: it.name, grams: Math.round(it.grams), kcal: it.kcal, protein: it.protein, source: r.kind === 'outside' ? 'estimate' : it.source })),
      })
    }
    onClose()
  }

  const msg = line(state.profile, 'noEnergy')

  return (
    <Sheet title={mode === 'ingredients' ? 'אין לי מצרכים' : 'אין לי כוח'} onClose={onClose}>
      {msg && <p className="lead">{msg}</p>}
      {mode === 'ingredients' && current && currentMissing.length > 0 && (
        <div className="card soft">
          <strong>חסר ל{current.name}:</strong> {currentMissing.map((id) => FOOD_BY_ID[id]?.name).join(', ')}
          <div className="actions">
            <button className="btn small" onClick={() => actions.setPantry(currentMissing, true)}>בעצם יש לי</button>
          </div>
        </div>
      )}
      <div className="chips" role="tablist">
        {FILTERS.map((x) => (
          <button key={x.id} role="tab" aria-selected={filter === x.id} className={`chip ${filter === x.id ? 'on' : ''}`} onClick={() => setFilter(x.id)}>{x.label}</button>
        ))}
      </div>

      {available.length === 0 && (
        <p className="muted">
          {filter === 'outside' ? 'אין כרגע אפשרות קנייה מתאימה לאילוצים.' : 'אין גיבוי שכל המצרכים שלו מסומנים ״יש בבית״. אפשר לקנות בחוץ, או לסמן מה יש.'}
        </p>
      )}
      {available.map(({ r }) => {
        const c = calcRecipe(r, 1)
        return (
          <div key={r.id} className="card">
            <strong>{r.name}</strong>
            <div className="muted"><Kcal calc={c} /> · {timeText(r)}</div>
            <div className="actions">
              <button className="btn primary" onClick={() => choose(r, true)}>אכלתי את זה</button>
              {meal && <button className="btn" onClick={() => choose(r, false)}>זה מה שאוכל</button>}
            </div>
          </div>
        )
      })}

      {filter !== 'outside' && unavailable.length > 0 && (
        <details className="more">
          <summary>גיבויים שחסר להם מצרך ({unavailable.length})</summary>
          {unavailable.map(({ r, missing }) => (
            <div key={r.id} className="card soft">
              <strong>{r.name}</strong>
              <div className="muted">חסר: {missing.map((id) => FOOD_BY_ID[id]?.name).join(', ')}</div>
              <div className="actions">
                <button className="btn small" onClick={() => actions.setPantry(missing, true)}>יש לי את זה</button>
              </div>
            </div>
          ))}
        </details>
      )}
    </Sheet>
  )
}
