import { useState } from 'react'
import { CATEGORY_LABEL, FOODS } from '../data/foods'
import { checkRecipe } from '../engine/constraints'
import { calcRecipe } from '../engine/nutrition'
import { SLOT_LABEL } from '../notifications'
import { allRecipes, type Actions } from '../store'
import type { AppState, Pref, Recipe, SlotId } from '../types'
import { SLOTS } from '../types'
import { Certainty, EFFORT_LABEL, Kcal, KosherUnverified, proteinText, Sheet, timeText } from './common'

type Seg = 'fav' | 'home' | 'outside' | 'db'
const PREF_LABEL: Record<Pref, string> = { love: 'אוהב', try: 'מוכן לנסות', dislike: 'לא אוהב', unknown: 'לא ידוע' }

export function FoodTab({ state, actions, today }: { state: AppState; actions: Actions; today: string }) {
  const [seg, setSeg] = useState<Seg>('fav')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Recipe | null>(null)
  const recipes = allRecipes(state)
  const match = (name: string) => !q.trim() || name.includes(q.trim())

  let list: Recipe[] = []
  if (seg === 'fav') list = recipes.filter((r) => state.alwaysGood.includes(r.id) || r.custom || r.backup)
  if (seg === 'home') list = recipes.filter((r) => r.kind === 'home')
  if (seg === 'outside') list = recipes.filter((r) => r.kind === 'outside')
  list = list.filter((r) => match(r.name))

  return (
    <div className="screen">
      <div className="chips" role="tablist">
        {([['fav', 'מועדפים וגיבויים'], ['home', 'בבית'], ['outside', 'בחוץ'], ['db', 'מאגר']] as [Seg, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={seg === id} className={`chip ${seg === id ? 'on' : ''}`} onClick={() => setSeg(id)}>{label}</button>
        ))}
      </div>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש" aria-label="חיפוש" />

      {seg === 'db' ? (
        <ul className="db-list">
          {FOODS.filter((f) => match(f.name) || (f.aliases ?? []).some(match)).map((f) => (
            <li key={f.id} className="card soft">
              <div className="row">
                <strong>{f.name}</strong>
                <Certainty source={f.source} />
              </div>
              <div className="muted small">
                {f.kcal100 == null ? 'אנרגיה לא ידועה' : `${f.kcal100} קק״ל ל־100 ג׳`} · {f.protein100 == null ? 'חלבון לא ידוע' : `${f.protein100} ג׳ חלבון`} ·{' '}
                {{ raw: 'טרי', dry: 'יבש', cooked: 'מבושל', ready: 'מוכן', liquid: 'נוזל' }[f.state]} · {CATEGORY_LABEL[f.category]}
                {f.units?.[0] && ` · ${f.units[0].name} = ${f.units[0].grams} ג׳`}
              </div>
              {f.sourceNote && <div className="muted small">{f.sourceNote}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="recipe-list">
          {seg === 'fav' && state.ideas.length > 0 && (
            <li className="card soft">
              <strong>רעיונות ששמרת</strong>
              <div className="chips">
                {state.ideas.map((i) => <button key={i} className="chip" onClick={() => actions.removeIdea(i)} aria-label={`הסר ${i}`}>{i} ✕</button>)}
              </div>
            </li>
          )}
          {list.map((r) => {
            const c = calcRecipe(r, 1)
            const blocked = !checkRecipe(r, state.profile).ok
            return (
              <li key={r.id}>
                <button className={`recipe-row ${blocked ? 'blocked' : ''}`} onClick={() => setOpen(r)}>
                  <span>
                    <strong>{state.alwaysGood.includes(r.id) && '★ '}{r.name}</strong>
                    <span className="muted small">{timeText(r)} · {EFFORT_LABEL[r.effort]}{blocked && ' · לא מתאים לאילוצים'}</span>
                    {r.kind === 'outside' && <KosherUnverified />}
                  </span>
                  <Kcal calc={c} />
                </button>
              </li>
            )
          })}
          {list.length === 0 && <li className="muted">אין פריטים להצגה.</li>}
        </ul>
      )}

      {open && <RecipeSheet r={open} state={state} actions={actions} today={today} onClose={() => setOpen(null)} />}
    </div>
  )
}

function RecipeSheet({ r, state, actions, today, onClose }: { r: Recipe; state: AppState; actions: Actions; today: string; onClose: () => void }) {
  const c = calcRecipe(r, 1)
  const pref = state.prefs[r.id] ?? 'unknown'
  const check = checkRecipe(r, state.profile)
  const slots: SlotId[] = r.kind === 'outside' ? ['outside'] : SLOTS.filter((s) => s !== 'outside' && r.slots.includes(s))
  return (
    <Sheet title={r.name} onClose={onClose}>
      <p><Kcal calc={c} /> · {proteinText(c.protein)} · <Certainty source={c.certainty} /></p>
      <p className="muted">{timeText(r)} · {EFFORT_LABEL[r.effort]}</p>
      {r.kind === 'outside' && <p><KosherUnverified /></p>}
      {!check.ok && <div className="banner warn">חסום: {check.reasons.join(', ')}</div>}
      {r.note && <p className="note">{r.note}</p>}
      <ul className="plain">
        {c.items.map((it, i) => <li key={i}>{it.name}: {Math.round(it.grams)} ג׳{it.optional && ' (תוספת)'}</li>)}
      </ul>
      <h3>העדפה</h3>
      <div className="chips">
        {(['love', 'try', 'dislike', 'unknown'] as Pref[]).map((p) => (
          <button key={p} className={`chip ${pref === p ? 'on' : ''}`} onClick={() => actions.setPref(r.id, p)}>{PREF_LABEL[p]}</button>
        ))}
      </div>
      {r.kind === 'home' && (
        <label className="toggle">
          <input type="checkbox" checked={state.alwaysGood.includes(r.id)} onChange={() => actions.toggleAlwaysGood(r.id)} disabled={!state.alwaysGood.includes(r.id) && state.alwaysGood.length >= 3} />
          <span>תמיד מתאים לי (עד 3)</span>
        </label>
      )}
      {state.alwaysGood.length > 3 && <p className="note">באיחוד נשמרו כל {state.alwaysGood.length} המועדפים. אפשר להסיר פריטים כדי לחזור לעד 3.</p>}
      {check.ok && (
        <>
          <h3>לשבץ להיום</h3>
          <div className="actions">
            {slots.map((s) => (
              <button key={s} className="btn" onClick={() => { actions.replacePlanned(today, s, r.id, 1, false); onClose() }}>{SLOT_LABEL[s]}</button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}
