import { useState } from 'react'
import { CATEGORY_LABEL, FOODS } from '../data/foods'
import { checkRecipe } from '../engine/constraints'
import { calcRecipe } from '../engine/nutrition'
import { SLOT_LABEL } from '../notifications'
import { allRecipes, type Actions } from '../store'
import type { AppState, Pref, Recipe, SlotId } from '../types'
import { SLOTS } from '../types'
import { Certainty, EFFORT_LABEL, Kcal, KosherUnverified, proteinText, Sheet, timeText } from './common'
import { BookRecipeSheet, RecipeBook } from './RecipeBook'
import { completeness, isFavorite } from '../engine/recipeBook'
import { MAKO_LINKS, MAKO_CATEGORY_LABELS } from '../data/makoLinks'

// ״ספר מתכונים״ מחליף את ״בבית״ (אותם מתכוני בית + מתכונים אישיים)
type Seg = 'fav' | 'book' | 'outside' | 'db' | 'mako'
const PREF_LABEL: Record<Pref, string> = { love: 'אוהב', try: 'מוכן לנסות', dislike: 'לא אוהב', unknown: 'לא ידוע' }

export function FoodTab({ state, actions, today, openNoEnergy }: { state: AppState; actions: Actions; today: string; openNoEnergy: () => void }) {
  const [seg, setSeg] = useState<Seg>('fav')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Recipe | null>(null)
  const [editReq, setEditReq] = useState<Recipe | null>(null) // ״עריכה״ מרשימה אחרת פותחת את העורך בספר המתכונים
  const recipes = allRecipes(state).filter((r) => !r.archived)
  const match = (name: string) => !q.trim() || name.includes(q.trim())

  let list: Recipe[] = []
  if (seg === 'fav') list = recipes.filter((r) => isFavorite(state, r.id) || state.alwaysGood.includes(r.id) || r.custom || r.backup)
  if (seg === 'outside') list = recipes.filter((r) => r.kind === 'outside')
  list = list.filter((r) => match(r.name))

  return (
    <div className="screen">
      <div className="chips" role="tablist">
        {([['fav', 'מועדפים וגיבויים'], ['book', 'ספר מתכונים'], ['mako', 'מאקו'], ['outside', 'בחוץ'], ['db', 'מאגר']] as [Seg, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={seg === id} className={`chip ${seg === id ? 'on' : ''}`} onClick={() => setSeg(id)}>{label}</button>
        ))}
      </div>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש" aria-label="חיפוש" />

      {seg === 'book' ? (
        <RecipeBook state={state} actions={actions} today={today} q={q} openNoEnergy={openNoEnergy} editRequest={editReq} onEditHandled={() => setEditReq(null)} />
      ) : seg === 'mako' ? (
        <MakoList q={q} />
      ) : seg === 'db' ? (
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
                    <strong>{isFavorite(state, r.id) && '★ '}{r.name}</strong>
                    <span className="muted small">{timeText(r)} · {EFFORT_LABEL[r.effort]}{blocked && ' · לא מתאים לאילוצים'}</span>
                    {r.kind === 'outside' && <KosherUnverified />}
                  </span>
                  {completeness(r) === 'full' ? <Kcal calc={c} /> : <span className="tag tag-estimate">אין מספיק נתונים לחישוב</span>}
                </button>
              </li>
            )
          })}
          {list.length === 0 && <li className="muted">אין פריטים להצגה.</li>}
        </ul>
      )}

      {open && open.kind === 'home' && (
        <BookRecipeSheet r={allRecipes(state).find((x) => x.id === open.id) ?? open} state={state} actions={actions} today={today} onEdit={(r) => { setOpen(null); setSeg('book'); setEditReq(r) }} onClose={() => setOpen(null)} />
      )}
      {open && open.kind !== 'home' && <RecipeSheet r={open} state={state} actions={actions} today={today} onClose={() => setOpen(null)} />}
    </div>
  )
}

// קטלוג קישורים חיצוניים למתכוני מאקו. שם וקישור בלבד; לחיצה פותחת את המתכון המקורי במאקו.
// אין רכיבים, קלוריות או שיבוץ בתכנון — מופרד לגמרי ממנוע המתכונים.
function MakoList({ q }: { q: string }) {
  const query = q.trim()
  const items = MAKO_LINKS.filter((l) => !query || l.title.includes(query) || (MAKO_CATEGORY_LABELS[l.category] ?? '').includes(query))
  const groups = new Map<string, typeof MAKO_LINKS>()
  for (const l of items) groups.set(l.category, [...(groups.get(l.category) ?? []), l])
  return (
    <div className="book">
      <p className="muted small">
        קישורים למתכונים באתר מאקו. לחיצה פותחת את המתכון המקורי במאקו, בלי נתוני תזונה ובלי שיבוץ בתכנון. {MAKO_LINKS.length} מתכונים ב־{new Set(MAKO_LINKS.map((l) => l.category)).size} קטגוריות.
      </p>
      {items.length === 0 && <p className="muted">לא נמצאו מתכונים שתואמים לחיפוש.</p>}
      {[...groups.entries()].map(([cat, links]) => (
        <section key={cat}>
          <h3>{MAKO_CATEGORY_LABELS[cat] ?? cat} <span className="muted small">({links.length})</span></h3>
          <ul className="recipe-list">
            {links.map((l) => (
              <li key={l.url}>
                <a className="recipe-row" href={l.url} target="_blank" rel="noopener noreferrer">
                  <span>
                    <strong>{l.title}</strong>
                    <span className="muted small">מאקו ↗</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
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
