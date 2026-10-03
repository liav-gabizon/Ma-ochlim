import { FOODS } from '../data/foods'
import { allRecipes, type Actions } from '../store'
import type { AppState, Pref } from '../types'

const PREF_LABEL: Record<Pref, string> = { love: 'אוהב', try: 'מוכן לנסות', dislike: 'לא אוהב', unknown: 'לא ידוע' }

export function MergeConflicts({ state, actions }: { state: AppState; actions: Actions }) {
  if (!state.mergeConflicts?.length) return null
  const recipes = allRecipes(state)
  return (
    <section className="card" aria-label="בחירה אחרי איחוד נתונים">
      <h3>יש בחירות שונות במכשיר ובחשבון</h3>
      <p>שמרנו את האפשרויות מכל המכשירים. בחר מה להשתמש בו לכל פריט. עד הבחירה, העדפה שלילית קודמת ופריט קנייה סותר נשאר לא מסומן.</p>
      {state.mergeConflicts.map((conflict) => {
        const name = FOODS.find((f) => f.id === conflict.key)?.name ?? recipes.find((r) => r.id === conflict.key)?.name ?? conflict.key
        return (
          <div key={`${conflict.field}:${conflict.key}`} className="card soft">
            <strong>{name} · {conflict.field === 'prefs' ? 'העדפה' : 'רשימת קניות'}</strong>
            <div className="actions">
              {conflict.values.map((value) => (
                <button key={String(value)} className="btn" onClick={() => actions.resolveMergeConflict(conflict.field, conflict.key, value)}>
                  {typeof value === 'boolean' ? value ? 'נקנה' : 'לא נקנה' : PREF_LABEL[value]}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}
