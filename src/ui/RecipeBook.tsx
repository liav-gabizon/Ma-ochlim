import { useMemo, useState } from 'react'
import { FOOD_BY_ID } from '../data/foods'
import { previewPlan, suggestFromBook } from '../engine/bookPlan'
import { allergenLabel, checkRecipe } from '../engine/constraints'
import { addDays, dayName, shortDate } from '../engine/dates'
import { kosherOf } from '../engine/nutrition'
import { applyAnswer, parseFood, type Draft } from '../engine/parse'
import {
  allergensKnown, allergensOf, bookNutrition, cleanLink, completeness, effortFromActive, fitsWithin, kosherLabel,
  parseRange, portionsOf, rangeText, recipeTimes, timeKnown,
} from '../engine/recipeBook'
import { isEmptyDiff } from '../engine/shopping'
import { SLOT_LABEL } from '../notifications'
import { allRecipes, rankCtx, type Actions } from '../store'
import type { AppState, MealItem, MinuteRange, Pref, Recipe, SlotId } from '../types'
import { Certainty, Kcal, proteinText, Sheet } from './common'

// ספר המתכונים (שלב 3): 19 ארוחות הבית הקיימות + מתכונים שהמשתמש הזין.
// אין תוכן ממקור חיצוני. מידע חסר מוצג ״לא ידוע״ / ״אין מספיק נתונים לחישוב״ ולא כאפס.

const PREF_LABEL: Record<Pref, string> = { love: 'אוהב', try: 'מוכן לנסות', dislike: 'לא אוהב', unknown: 'לא ידוע' }
const NO_DATA = 'אין מספיק נתונים לחישוב'
type KosherFilter = 'meat' | 'dairy' | 'parve'

export function RecipeBook({ state, actions, today, q, openNoEnergy }: {
  state: AppState
  actions: Actions
  today: string
  q: string
  openNoEnergy: () => void
}) {
  const [quick, setQuick] = useState(true) // ברירת מחדל אישית: עד 30 דקות
  const [fav, setFav] = useState(false)
  const [backups, setBackups] = useState(false)
  const [slot, setSlot] = useState<SlotId | null>(null)
  const [kosher, setKosher] = useState<KosherFilter | null>(null)
  const [showUnknownTime, setShowUnknownTime] = useState(false)
  const [skip, setSkip] = useState<string[]>([])
  const [open, setOpen] = useState<Recipe | null>(null)
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)

  const recipes = allRecipes(state)
  const book = recipes.filter((r) => r.kind === 'home' && !r.archived)
  const ctx = { ...rankCtx(state), alwaysGood: state.alwaysGood }
  const suggestSlot: SlotId = slot ?? 'evening'
  const suggestion = suggestFromBook(book, ctx, { slot: suggestSlot, maxMinutes: quick ? 30 : null, skip })

  const term = q.trim()
  const base = book.filter((r) => {
    if (term && !r.name.includes(term)) return false
    if (fav && !(state.prefs[r.id] === 'love' || state.alwaysGood.includes(r.id))) return false
    if (backups && !r.backup) return false
    if (slot && !r.slots.includes(slot)) return false
    // סינון בשרי/חלבי/פרווה רק כשיש רשימת רכיבים מלאה
    if (kosher && (completeness(r) !== 'full' || kosherOf(r.items) !== kosher)) return false
    return true
  })
  const unknownTime = base.filter((r) => !timeKnown(r))
  const list = base.filter((r) => timeKnown(r) && (!quick || fitsWithin(r, 30)))
  const longer = quick ? base.filter((r) => timeKnown(r) && !fitsWithin(r, 30)).length : 0

  return (
    <div className="book">
      <section className="card hero book-hero" aria-live="polite">
        <div className="eyebrow">הצעה בשבילך · {SLOT_LABEL[suggestSlot]}</div>
        {suggestion ? (
          <>
            <button className="next-title" onClick={() => setOpen(suggestion)}>
              <h2>{suggestion.name}</h2>
              <span className="muted"><BookKcal r={suggestion} /> · {rangeText(recipeTimes(suggestion).total)}</span>
            </button>
            <div className="actions">
              <button className="btn primary" onClick={() => setOpen(suggestion)}>לכרטיס</button>
              <button className="btn" onClick={() => setSkip((s) => [...s, suggestion.id])}>לא בא לי</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">אין כרגע הצעה שעומדת בסינון{quick ? ' של עד 30 דקות' : ''}.</p>
            <div className="actions">
              {skip.length > 0 && <button className="btn small" onClick={() => setSkip([])}>להתחיל מחדש</button>}
              {quick && <button className="btn small" onClick={() => setQuick(false)}>להציג גם ארוכים</button>}
            </div>
          </>
        )}
      </section>

      <div className="actions">
        <button className="btn" onClick={openNoEnergy}>אין לי כוח</button>
        <button className="btn primary" onClick={() => setEditing('new')}>+ מתכון חדש</button>
      </div>

      <div className="chips" aria-label="סינון">
        <button className={`chip ${quick ? 'on' : ''}`} aria-pressed={quick} onClick={() => setQuick(true)}>עד 30 דק׳</button>
        <button className={`chip ${!quick ? 'on' : ''}`} aria-pressed={!quick} onClick={() => setQuick(false)}>כל הזמנים</button>
        <button className={`chip ${fav ? 'on' : ''}`} aria-pressed={fav} onClick={() => setFav((v) => !v)}>★ מועדפים</button>
        <button className={`chip ${backups ? 'on' : ''}`} aria-pressed={backups} onClick={() => setBackups((v) => !v)}>גיבויים</button>
        {(['morning', 'evening'] as SlotId[]).map((s) => (
          <button key={s} className={`chip ${slot === s ? 'on' : ''}`} aria-pressed={slot === s} onClick={() => setSlot(slot === s ? null : s)}>{SLOT_LABEL[s]}</button>
        ))}
        {([['meat', 'בשרי'], ['dairy', 'חלבי'], ['parve', 'פרווה']] as [KosherFilter, string][]).map(([k, label]) => (
          <button key={k} className={`chip ${kosher === k ? 'on' : ''}`} aria-pressed={kosher === k} onClick={() => setKosher(kosher === k ? null : k)}>{label}</button>
        ))}
      </div>
      {kosher && <p className="muted small">הסינון לפי רכיבים בלבד, ולא מהווה תעודת כשרות. מתכונים בלי רשימת רכיבים מלאה לא מוצגים בו.</p>}

      <ul className="recipe-list">
        {list.map((r) => <BookRow key={r.id} r={r} state={state} onOpen={() => setOpen(r)} />)}
        {list.length === 0 && <li className="muted">אין מתכונים שעומדים בסינון.</li>}
      </ul>
      {longer > 0 && <button className="link" onClick={() => setQuick(false)}>עוד {longer} מתכונים ארוכים מ־30 דקות · הצג</button>}
      {unknownTime.length > 0 && (
        <>
          <button className="link block" onClick={() => setShowUnknownTime((v) => !v)} aria-expanded={showUnknownTime}>
            {unknownTime.length} מתכונים בלי זמן ידוע · {showUnknownTime ? 'הסתר' : 'הצג'}
          </button>
          {showUnknownTime && (
            <ul className="recipe-list">
              {unknownTime.map((r) => <BookRow key={r.id} r={r} state={state} onOpen={() => setOpen(r)} />)}
            </ul>
          )}
        </>
      )}

      {open && (
        <BookRecipeSheet
          r={recipes.find((x) => x.id === open.id) ?? open}
          state={state}
          actions={actions}
          today={today}
          onEdit={(r) => { setOpen(null); setEditing(r) }}
          onClose={() => setOpen(null)}
        />
      )}
      {editing && (
        <RecipeEditor
          initial={editing === 'new' ? null : editing}
          state={state}
          onSave={(r) => { actions.saveBookRecipe(r); setEditing(null); setOpen(r) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function BookKcal({ r }: { r: Recipe }) {
  const n = bookNutrition(r)
  if (!n.perServing) return <span className="tag tag-estimate">{NO_DATA}</span>
  return <Kcal calc={n.perServing} prefix={r.origin === 'book' ? 'למנה כ־' : 'כ־'} />
}

function BookRow({ r, state, onOpen }: { r: Recipe; state: AppState; onOpen: () => void }) {
  const blocked = completeness(r) === 'full' && !checkRecipe(r, state.profile).ok
  const t = recipeTimes(r)
  return (
    <li>
      <button className={`recipe-row ${blocked ? 'blocked' : ''}`} onClick={onOpen}>
        <span>
          <strong>
            {state.alwaysGood.includes(r.id) && '★ '}
            {r.name}
            {r.origin === 'book' && <span className="tag tag-mine">שלי</span>}
            {r.backup && <span className="tag">גיבוי</span>}
          </strong>
          <span className="muted small">
            כולל {rangeText(t.total)} · עבודה {rangeText(t.active)}{blocked && ' · לא מתאים לאילוצים'}
          </span>
        </span>
        <BookKcal r={r} />
      </button>
    </li>
  )
}

export function BookRecipeSheet({ r, state, actions, today, onEdit, onClose }: {
  r: Recipe
  state: AppState
  actions: Actions
  today: string
  onEdit: (r: Recipe) => void
  onClose: () => void
}) {
  const portions = portionsOf(r)
  const [cook, setCook] = useState<number>(portions ?? 1)
  const [planning, setPlanning] = useState(false)
  const status = completeness(r)
  const n = bookNutrition(r, cook)
  const check = checkRecipe(r, state.profile)
  const pref = state.prefs[r.id] ?? 'unknown'
  const t = recipeTimes(r)
  const isLoved = pref === 'love'
  const allergens = allergensKnown(r) ? [...allergensOf(r.items)].map(allergenLabel) : null

  return (
    <Sheet title={r.name} onClose={onClose}>
      <div className="chips">
        {r.origin === 'book' && <span className="tag tag-mine">שלי</span>}
        {r.backup && <span className="tag">גיבוי</span>}
        {r.slots.map((s) => <span key={s} className="tag">{SLOT_LABEL[s]}</span>)}
        <span className={`tag ${status === 'full' ? '' : 'tag-kosher'}`}>{kosherLabel(r)}</span>
      </div>

      <table className="items facts">
        <tbody>
          <tr><td>זמן עבודה</td><td className="num">{rangeText(t.active)}</td></tr>
          <tr><td>זמן כולל</td><td className="num">{rangeText(t.total)}</td></tr>
          <tr><td>מנות במתכון</td><td className="num">{portions == null ? 'לא ידוע' : r.origin === 'book' ? portions : 'ארוחה למנה אחת'}</td></tr>
          {r.difficulty && <tr><td>קושי</td><td className="num">{{ easy: 'קל', medium: 'בינוני', hard: 'מאתגר' }[r.difficulty]}</td></tr>}
          <tr>
            <td>למנה</td>
            <td className="num" data-testid="per-serving">{n.perServing ? <><Kcal calc={n.perServing} /> · {proteinText(n.perServing.protein)}</> : NO_DATA}</td>
          </tr>
          {r.origin === 'book' && (
            <tr>
              <td>
                לכל הכמות ({cook} מנות)
              </td>
              <td className="num" data-testid="whole">{n.whole ? <Kcal calc={n.whole} /> : NO_DATA}</td>
            </tr>
          )}
        </tbody>
      </table>
      {n.perServing && <p className="muted small">ודאות: <Certainty source={n.perServing.certainty} /> · הקלוריות לפי משקל הרכיבים כפי שהוזן (גולמי/יבש/מבושל לפי המאגר).</p>}
      {r.origin === 'book' && portions != null && status === 'full' && (
        <div className="stepper" aria-label="מספר מנות לבישול">
          <span>מבשל</span>
          <button className="icon-btn" onClick={() => setCook((c) => Math.max(1, c - 1))} aria-label="פחות מנות">−</button>
          <strong data-testid="cook-servings">{cook}</strong>
          <button className="icon-btn" onClick={() => setCook((c) => Math.min(20, c + 1))} aria-label="יותר מנות">+</button>
          <span>מנות</span>
        </div>
      )}

      {status !== 'full' && (
        <div className="banner warn">
          {NO_DATA}. {status === 'unknown' ? 'אין רשימת רכיבים.' : 'חלק מהרכיבים, הכמויות או מספר המנות חסרים.'} המתכון לא נכנס להחלפות ולרשימת הקניות.
        </div>
      )}
      {r.unresolved && r.unresolved.length > 0 && <p className="muted small">לא זוהו: {r.unresolved.join(', ')}</p>}
      {status === 'full' && !check.ok && <div className="banner warn">לא מתאים לאילוצים שהוגדרו: {check.reasons.join(', ')}</div>}
      <p className="muted small">אלרגנים: {allergens == null ? 'לא ידועים (אין רשימת רכיבים מלאה)' : allergens.length ? allergens.join(', ') : 'לא זוהו ברכיבים'}</p>

      {r.items.length > 0 && (
        <ul className="plain">
          {r.items.map((it, i) => <li key={i}>{FOOD_BY_ID[it.foodId]?.name ?? it.foodId}: {Math.round(it.grams)} ג׳{it.optional && ' (תוספת)'}</li>)}
        </ul>
      )}
      {r.note && <p className="note">{r.note}</p>}
      {r.origin !== 'book' && <p className="muted small">ארוחה מוכנה מראש באפליקציה: רכיבים וכמויות למנה אחת, בלי הוראות הכנה.</p>}

      <div className="actions">
        <button className={`btn ${isLoved ? 'primary' : ''}`} aria-pressed={isLoved} onClick={() => actions.setPref(r.id, isLoved ? 'unknown' : 'love')}>{isLoved ? '★ במועדפים' : '☆ שמור למועדפים'}</button>
        <button className={`btn ${pref === 'dislike' ? 'primary' : ''}`} aria-pressed={pref === 'dislike'} onClick={() => actions.setPref(r.id, pref === 'dislike' ? 'unknown' : 'dislike')}>לא לטעמי</button>
        {r.link && (
          <a className="btn" href={r.link} target="_blank" rel="noopener noreferrer">פתח קישור ↗</a>
        )}
      </div>
      {r.link && <p className="muted small">פתיחת הקישור לא נרשמת כאכילה.</p>}

      <label className="toggle">
        <input type="checkbox" checked={state.alwaysGood.includes(r.id)} onChange={() => actions.toggleAlwaysGood(r.id)} disabled={!state.alwaysGood.includes(r.id) && state.alwaysGood.length >= 3} />
        <span>תמיד מתאים לי (עד 3)</span>
      </label>
      {state.alwaysGood.length > 3 && <p className="note">באיחוד נשמרו כל {state.alwaysGood.length} המועדפים. אפשר להסיר פריטים כדי לחזור לעד 3.</p>}

      <h3>העדפה</h3>
      <div className="chips">
        {(['love', 'try', 'dislike', 'unknown'] as Pref[]).map((p) => (
          <button key={p} className={`chip ${pref === p ? 'on' : ''}`} onClick={() => actions.setPref(r.id, p)}>{PREF_LABEL[p]}</button>
        ))}
      </div>

      {status === 'full' && check.ok && !r.archived ? (
        <div className="actions">
          <button className="btn primary" onClick={() => setPlanning(true)}>שלב בתכנון</button>
        </div>
      ) : (
        <p className="muted small">״שלב בתכנון״ זמין רק למתכון עם רכיבים, כמויות ומספר מנות, שעומד באילוצים.</p>
      )}

      {r.origin === 'book' && (
        <div className="actions">
          <button className="btn ghost" onClick={() => onEdit(r)}>{status === 'full' ? 'עריכה' : 'הוסף רכיבים / ערוך'}</button>
          <button className="btn ghost danger" onClick={() => { actions.archiveRecipe(r.id); onClose() }}>הסר מהספר</button>
        </div>
      )}

      {planning && (
        <PlanSheet r={r} cook={cook} state={state} actions={actions} today={today} onDone={() => { setPlanning(false); onClose() }} onCancel={() => setPlanning(false)} />
      )}
    </Sheet>
  )
}

/** שיבוץ + רשימת קניות כפעולה אחת. ביטול לא משנה דבר. */
function PlanSheet({ r, cook, state, actions, today, onDone, onCancel }: {
  r: Recipe
  cook: number
  state: AppState
  actions: Actions
  today: string
  onDone: () => void
  onCancel: () => void
}) {
  const slots = r.slots.filter((s) => s !== 'outside')
  const [date, setDate] = useState(today)
  const [slot, setSlot] = useState<SlotId>(slots[0] ?? 'evening')
  const recipes = allRecipes(state)
  const preview = useMemo(() => previewPlan(state, recipes, date, slot, r.id, cook), [state, recipes, date, slot, r.id, cook])
  const current = state.plan.find((m) => m.date === date && m.slot === slot)
  const currentName = current ? recipes.find((x) => x.id === current.recipeId)?.name : null
  const eaten = current && current.status !== 'planned' && current.status !== 'cooking'
  const d = preview.diff

  return (
    <Sheet title={`לשבץ: ${r.name}`} onClose={onCancel}>
      <h3>יום</h3>
      <div className="chips">
        {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((x) => (
          <button key={x} className={`chip ${date === x ? 'on' : ''}`} onClick={() => setDate(x)}>{i18nDay(x, today)}</button>
        ))}
      </div>
      <h3>ארוחה</h3>
      <div className="chips">
        {slots.map((s) => <button key={s} className={`chip ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}>{SLOT_LABEL[s]}</button>)}
      </div>
      <p className="muted small">
        {currentName ? `במקום: ${currentName}` : 'המשבצת ריקה.'} מבשלים {cook} {cook === 1 ? 'מנה' : 'מנות'}. התכנון לא נרשם כאכילה; רק ״אכלתי״ מוסיף ליומן.
      </p>
      {eaten && <div className="banner warn">הארוחה במשבצת הזו כבר דווחה. השיבוץ לא ישנה את היומן.</div>}

      <h3>שינויים ברשימת הקניות</h3>
      {isEmptyDiff(d) ? (
        <p className="muted" data-testid="diff-empty">אין שינוי ברשימת הקניות.</p>
      ) : (
        <ul className="plain diff" data-testid="diff">
          {d.added.map((l) => <li key={`a${l.foodId}`}>+ {l.name} · {l.packs > 1 ? `${l.packs} × ` : ''}{l.packLabel}</li>)}
          {d.changed.map((c) => <li key={`c${c.to.foodId}`}>~ {c.to.name}: {c.from.packs} ← {c.to.packs}</li>)}
          {d.removed.map((l) => <li key={`r${l.foodId}`}>− {l.name}</li>)}
        </ul>
      )}
      {!preview.updatesConfirmed && !isEmptyDiff(d) && <p className="muted small">אין עדיין רשימה מאושרת; השינוי יופיע ברשימה בלשונית השבוע.</p>}
      <p className="muted small">פריטים שסימנת כ״נקנה״ נשארים מסומנים.</p>

      <div className="actions">
        <button className="btn primary" onClick={() => { actions.planFromBook(date, slot, r.id, cook); onDone() }}>אשר שיבוץ ורשימה</button>
        <button className="btn ghost" onClick={onCancel}>ביטול</button>
      </div>
    </Sheet>
  )
}

function i18nDay(date: string, today: string) {
  if (date === today) return 'היום'
  if (date === addDays(today, 1)) return 'מחר'
  return `${dayName(date)} ${shortDate(date)}`
}

/** הזנת מתכון: רכיבים דרך המפענח הקיים. כמות שהמפענח הניח או לא זוהתה לא נחשבת עד שמאשרים אותה. */
function RecipeEditor({ initial, state, onSave, onClose }: {
  initial: Recipe | null
  state: AppState
  onSave: (r: Recipe) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [ingredients, setIngredients] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmed, setConfirmed] = useState<MealItem[]>(initial?.items ?? [])
  const [unresolved, setUnresolved] = useState<string[]>(initial?.unresolved ?? [])
  const [servings, setServings] = useState(initial?.servings != null ? String(initial.servings) : '')
  const times = initial?.time
  const [aMin, setAMin] = useState(times?.active?.min != null ? String(times.active.min) : '')
  const [aMax, setAMax] = useState(times?.active?.max != null ? String(times.active.max) : '')
  const [tMin, setTMin] = useState(times?.total?.min != null ? String(times.total.min) : '')
  const [tMax, setTMax] = useState(times?.total?.max != null ? String(times.total.max) : '')
  const [difficulty, setDifficulty] = useState<Recipe['difficulty']>(initial?.difficulty ?? null)
  const [slots, setSlots] = useState<SlotId[]>(initial?.slots ?? ['evening'])
  const [link, setLink] = useState(initial?.link ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const parse = () => {
    const d = parseFood(ingredients, allRecipes(state).filter((r) => r.kind === 'home'))
    setDraft(d)
  }
  const unconfirmedLines = draft ? draft.lines.filter((l) => l.assumption || draft.questions.some((q) => q.key === l.key) || (!l.foodId && !l.parts)) : []

  const acceptDraft = () => {
    if (!draft) return
    const ok = draft.lines.filter((l) => !unconfirmedLines.includes(l))
    const items = ok.flatMap((l) => (l.parts ? l.parts : l.foodId ? [{ foodId: l.foodId, grams: l.grams }] : []))
    setConfirmed((c) => [...c, ...items])
    setUnresolved((u) => [...u, ...draft.unmatched, ...unconfirmedLines.map((l) => l.name)])
    setDraft(null)
    setIngredients('')
  }

  const save = () => {
    const nm = name.trim()
    if (!nm) return setError('צריך שם למתכון.')
    const cleaned = link.trim() ? cleanLink(link) : null
    if (link.trim() && !cleaned) return setError('הקישור צריך להתחיל ב־https://')
    const sv = servings.trim() ? Math.round(Number(servings)) : null
    if (servings.trim() && (!Number.isFinite(sv) || (sv ?? 0) < 1)) return setError('מספר מנות צריך להיות 1 ומעלה, או ריק אם לא ידוע.')
    if (slots.length === 0) return setError('צריך לבחור לפחות ארוחה אחת.')
    const active = parseRange(aMin, aMax)
    const total = parseRange(tMin, tMax)
    const exact = (x: MinuteRange | null) => (x && x.min != null && x.min === x.max ? x.max : 0)
    const r: Recipe = {
      id: initial?.id ?? `book_${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`,
      name: nm,
      kind: 'home',
      items: confirmed,
      unresolved,
      servings: sv,
      time: { active, total },
      // ערכים מספריים נדרשים לטיפוס הישן; 0 = לא מדויק, והתצוגה משתמשת ב־time
      totalMinutes: exact(total),
      activeMinutes: exact(active),
      effort: effortFromActive(active),
      difficulty,
      slots,
      note: note.trim() || undefined,
      ...(cleaned ? { link: cleaned } : {}),
      origin: 'book',
      custom: true,
    }
    onSave(r)
  }

  return (
    <Sheet title={initial ? 'עריכת מתכון' : 'מתכון חדש'} onClose={onClose}>
      <label className="field"><span>שם</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: פסטה ברוטב עגבניות" /></label>

      <h3>רכיבים</h3>
      {confirmed.length > 0 ? (
        <ul className="plain">
          {confirmed.map((it, i) => (
            <li key={i}>
              {FOOD_BY_ID[it.foodId]?.name ?? it.foodId}: {Math.round(it.grams)} ג׳{' '}
              <button className="link" onClick={() => setConfirmed((c) => c.filter((_, j) => j !== i))} aria-label="הסר רכיב">הסר</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">אין עדיין רכיבים. אפשר לשמור גם בלי, עם שם וקישור בלבד.</p>}
      {unresolved.length > 0 && (
        <p className="muted small">
          לא זוהו / כמות לא אושרה: {unresolved.join(', ')}{' '}
          <button className="link" onClick={() => setUnresolved([])}>נקה</button>
        </p>
      )}
      <label className="field">
        <span>הוספת רכיבים (כמות לכל המתכון)</span>
        <textarea rows={3} value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="למשל: 200 גרם פסטה, 2 כפות שמן זית, 400 גרם רסק עגבניות" />
      </label>
      <div className="actions"><button className="btn" onClick={parse} disabled={!ingredients.trim()}>זהה רכיבים</button></div>
      {draft && (
        <div className="card soft">
          {draft.lines.map((l) => {
            const q = draft.questions.find((x) => x.key === l.key)
            const pending = unconfirmedLines.includes(l)
            return (
              <div key={l.key} className="draft-line">
                <span>{l.name}{l.foodId && `: ${Math.round(l.grams)} ג׳`}{pending && ' · כמות לא אושרה'}</span>
                {q && (
                  <div className="chips">
                    {q.options.map((o) => <button key={o.label} className="chip" onClick={() => setDraft(applyAnswer(draft, l.key, o.grams))}>{o.label}</button>)}
                  </div>
                )}
                {l.foodId && pending && !q && (
                  <label className="inline">
                    גרם:{' '}
                    <input type="number" inputMode="decimal" min={1} defaultValue={Math.round(l.grams)}
                      onBlur={(e) => { const g = Number(e.target.value); if (g > 0) setDraft(applyAnswer(draft, l.key, g)) }} />
                    <button className="link" onClick={(e) => { const input = (e.currentTarget.previousSibling as HTMLInputElement); const g = Number(input?.value); if (g > 0) setDraft(applyAnswer(draft, l.key, g)) }}>אשר</button>
                  </label>
                )}
              </div>
            )
          })}
          {draft.unmatched.length > 0 && <p className="muted small">לא זוהו במאגר: {draft.unmatched.join(', ')}</p>}
          <div className="actions">
            <button className="btn primary" onClick={acceptDraft}>הוסף למתכון</button>
            <button className="btn ghost" onClick={() => setDraft(null)}>ביטול</button>
          </div>
          {unconfirmedLines.length > 0 && <p className="muted small">שורות בלי כמות מאושרת יישמרו כ״לא זוהו״, והמתכון יסומן חלקי.</p>}
        </div>
      )}

      <label className="field"><span>מספר מנות במתכון (ריק = לא ידוע)</span><input type="number" inputMode="numeric" min={1} value={servings} onChange={(e) => setServings(e.target.value)} /></label>

      <fieldset className="field">
        <legend>זמן עבודה (דקות; ריק = לא ידוע)</legend>
        <div className="range"><label>מ־ <input type="number" min={0} inputMode="numeric" value={aMin} onChange={(e) => setAMin(e.target.value)} aria-label="זמן עבודה מ" /></label><label>עד <input type="number" min={0} inputMode="numeric" value={aMax} onChange={(e) => setAMax(e.target.value)} aria-label="זמן עבודה עד" /></label></div>
      </fieldset>
      <fieldset className="field">
        <legend>זמן כולל (דקות; ריק = לא ידוע)</legend>
        <div className="range"><label>מ־ <input type="number" min={0} inputMode="numeric" value={tMin} onChange={(e) => setTMin(e.target.value)} aria-label="זמן כולל מ" /></label><label>עד <input type="number" min={0} inputMode="numeric" value={tMax} onChange={(e) => setTMax(e.target.value)} aria-label="זמן כולל עד" /></label></div>
        <span className="muted small">זמן מדויק: אותו מספר בשני השדות. ״עד שעה״: רק ״עד 60״.</span>
      </fieldset>

      <h3>מתאים ל</h3>
      <div className="chips">
        {(['morning', 'evening'] as SlotId[]).map((s) => (
          <button key={s} className={`chip ${slots.includes(s) ? 'on' : ''}`} aria-pressed={slots.includes(s)} onClick={() => setSlots((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>{SLOT_LABEL[s]}</button>
        ))}
      </div>
      <h3>קושי</h3>
      <div className="chips">
        {([[null, 'לא ידוע'], ['easy', 'קל'], ['medium', 'בינוני'], ['hard', 'מאתגר']] as [Recipe['difficulty'], string][]).map(([v, l]) => (
          <button key={l} className={`chip ${difficulty === v ? 'on' : ''}`} onClick={() => setDifficulty(v)}>{l}</button>
        ))}
      </div>
      <label className="field"><span>קישור (אופציונלי, פרטי)</span><input type="url" inputMode="url" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></label>
      <label className="field"><span>הערה</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>

      {error && <div className="banner warn" role="alert">{error}</div>}
      <div className="actions">
        <button className="btn primary" onClick={save}>שמור מתכון</button>
        <button className="btn ghost" onClick={onClose}>ביטול</button>
      </div>
      <p className="muted small">קלוריות יחושבו רק כשכל הרכיבים זוהו, הכמויות אושרו ומספר המנות ידוע.</p>
    </Sheet>
  )
}
