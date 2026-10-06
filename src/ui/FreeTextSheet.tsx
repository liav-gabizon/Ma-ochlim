import { useEffect, useMemo, useState } from 'react'
import { FOODS } from '../data/foods'
import { localDate, localMinutes, hhmmToMinutes } from '../engine/dates'
import { calcItem, displayKcal } from '../engine/nutrition'
import { applyAnswer, draftTotal, parseFood, type Draft, type DraftLine } from '../engine/parse'
import { SLOT_LABEL } from '../notifications'
import { allRecipes, newIdemKey, snapshotDraft, type Actions } from '../store'
import type { AppState, Recipe, SlotId } from '../types'
import { SLOTS } from '../types'
import { Certainty, Sheet } from './common'
import { effortFromActive, exactMinutes } from '../engine/recipeBook'

const DRAFT_KEY = 'ma-ochlim:freetext'

function loadDraftText(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}
function saveDraftText(t: string) {
  try {
    if (t) localStorage.setItem(DRAFT_KEY, t)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* טיוטה לא נשמרה; הטקסט עדיין במסך */
  }
}

export function FreeTextSheet({ state, actions, onClose, initialText = '', onLogged }: {
  state: AppState
  actions: Actions
  onClose: () => void
  initialText?: string
  onLogged?: () => void
}) {
  const [text, setText] = useState(initialText || loadDraftText())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [intent, setIntent] = useState<'want' | 'ate' | null>(null)
  const [idemKey] = useState(newIdemKey)
  const [search, setSearch] = useState('')
  const now = new Date()
  const tz = state.profile.timezone
  const today = localDate(now, tz)
  const nowMin = localMinutes(now, tz)
  const plannedToday = state.plan.filter((p) => p.date === today && p.status === 'planned')
  const nearestSlot: SlotId | undefined = plannedToday
    .map((p) => p.slot)
    .sort((a, b) => Math.abs(hhmmToMinutes(state.profile.mealTimes[a]) - nowMin) - Math.abs(hhmmToMinutes(state.profile.mealTimes[b]) - nowMin))[0]
  const [slot, setSlot] = useState<SlotId | 'none'>(nearestSlot ?? 'none')

  useEffect(() => saveDraftText(text), [text])

  const run = () => {
    const d = parseFood(text, allRecipes(state))
    setDraft(d)
    setIntent(d.intent === 'unclear' ? null : d.intent)
  }

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    if (!draft) return
    setDraft({
      ...draft,
      lines: draft.lines.map((l) => {
        if (l.key !== key) return l
        const n = { ...l, ...patch }
        if (patch.grams != null && l.foodId) {
          const c = calcItem(l.foodId, patch.grams)
          n.kcal = c.kcal
          n.protein = c.protein
          n.assumption = undefined
        } else if (patch.grams != null && l.kcal != null && l.grams > 0) {
          const f = patch.grams / l.grams
          n.kcal = l.kcal * f
          n.protein = l.protein == null ? null : l.protein * f
        }
        return n
      }),
    })
  }

  const addFood = (foodId: string) => {
    const f = FOODS.find((x) => x.id === foodId)!
    const grams = f.units?.[0]?.grams ?? 100
    const c = calcItem(foodId, grams)
    const line: DraftLine = { key: `m${Date.now()}`, name: f.name, foodId, grams, kcal: c.kcal, protein: c.protein, source: f.source }
    setDraft((d) => (d ? { ...d, lines: [...d.lines, line] } : { intent: 'unclear', lines: [line], questions: [], unmatched: [] }))
    setSearch('')
  }

  const results = useMemo(
    () => (search.trim().length < 2 ? [] : FOODS.filter((f) => [f.name, ...(f.aliases ?? [])].some((a) => a.includes(search.trim()))).slice(0, 6)),
    [search],
  )

  const total = draft ? draftTotal(draft.lines) : null
  const title = text.trim().replace(/^(אכלתי|שתיתי|בא לי|מתחשק לי|רוצה)\s*/, '') || 'אוכל שנוסף'

  const confirmAte = (mode: 'replace' | 'add') => {
    if (!draft || draft.lines.length === 0) return
    actions.logEntry({ idemKey, title, items: snapshotDraft(draft.lines), slot: slot === 'none' ? undefined : slot, mode })
    saveDraftText('')
    onLogged?.()
    onClose()
  }

  const [totalRaw, setTotalRaw] = useState('')
  const [activeRaw, setActiveRaw] = useState('')

  const saveForPlan = (asFavorite: boolean) => {
    if (!draft) return
    actions.addIdea(title)
    if (asFavorite || slot !== 'none') {
      const items = draft.lines.flatMap((l) => (l.parts ? l.parts : l.foodId ? [{ foodId: l.foodId, grams: l.grams }] : []))
      // זמן רק אם הוזן; ריק = לא ידוע ולא נכלל ב״עד 30 דקות״
      const total = exactMinutes(totalRaw)
      const active = exactMinutes(activeRaw)
      const r: Recipe = {
        id: `custom_${idemKey.slice(0, 8)}`, name: title, kind: 'home', items, effort: effortFromActive(active),
        totalMinutes: total?.max ?? 0, activeMinutes: active?.max ?? 0, time: { active, total },
        slots: ['morning', 'evening'], custom: true, updatedAt: new Date().toISOString(), note: 'נוצר מכתיבה חופשית; הכמויות לפי הטיוטה שאושרה.',
      }
      if (draft.lines.some((l) => l.recipeId?.startsWith('out_'))) r.kind = 'outside'
      if (r.kind === 'outside') r.slots = ['outside']
      actions.saveCustomRecipe(r)
      if (asFavorite) actions.setFavorite(r.id, true)
      if (slot !== 'none') actions.replacePlanned(today, slot, r.id, 1, false)
    }
    saveDraftText('')
    onClose()
  }

  return (
    <Sheet title="מה בא לך או מה אכלת?" onClose={onClose}>
      <label className="field">
        <span className="sr-only">טקסט חופשי</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="למשל: אכלתי שלושה משולשים וקולה · בא לי לאפה שווארמה · חצי בגט שניצל בלי מיונז"
          rows={3}
        />
      </label>
      <div className="actions">
        <button className="btn primary" onClick={run} disabled={!text.trim()}>חשב</button>
      </div>

      {draft && (
        <section className="draft">
          {intent == null && (
            <div className="card soft">
              <strong>זה תכנון או משהו שכבר אכלת?</strong>
              <div className="actions">
                <button className="btn" onClick={() => setIntent('want')}>תכנון</button>
                <button className="btn" onClick={() => setIntent('ate')}>אכלתי בפועל</button>
              </div>
            </div>
          )}

          {draft.questions.map((q) => (
            <div key={q.key} className="card soft">
              <strong>{q.text}</strong>
              <div className="chips">
                {q.options.map((o) => (
                  <button key={o.label} className="chip" onClick={() => setDraft(applyAnswer(draft, q.key, o.grams))}>{o.label}</button>
                ))}
                <button className="chip" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((x) => x.key !== q.key) })}>לא יודע, תעריך</button>
              </div>
            </div>
          ))}

          {draft.lines.length === 0 && <p className="muted">לא זיהיתי מאכל מהמאגר. אפשר לחפש ולהוסיף ידנית למטה.</p>}
          <ul className="draft-lines">
            {draft.lines.map((l) => (
              <li key={l.key}>
                <div className="row">
                  <strong>{l.name}</strong>
                  <button className="icon-btn" aria-label={`הסר ${l.name}`} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((x) => x.key !== l.key) })}>✕</button>
                </div>
                <div className="row">
                  <label className="inline">
                    <input type="number" inputMode="decimal" min={0} value={Math.round(l.grams)} onChange={(e) => updateLine(l.key, { grams: Number(e.target.value) || 0 })} />
                    <span>ג׳</span>
                  </label>
                  <span>{l.kcal == null ? 'ערך לא ידוע' : `${Math.round(l.kcal)} קק״ל`}</span>
                  <Certainty source={l.source} />
                </div>
                {l.assumption && <div className="muted small">{l.assumption}</div>}
              </li>
            ))}
          </ul>
          {draft.unmatched.length > 0 && <p className="muted small">לא זיהיתי: {draft.unmatched.join(', ')}. אפשר להוסיף מהמאגר.</p>}

          <label className="field">
            <span>הוספה מהמאגר</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש מאכל" />
          </label>
          {results.length > 0 && (
            <div className="chips">
              {results.map((f) => <button key={f.id} className="chip" onClick={() => addFood(f.id)}>+ {f.name}</button>)}
            </div>
          )}

          {total && draft.lines.length > 0 && (
            <p className="total">
              סך משוער: כ־{displayKcal(total.kcal)} קק״ל{!total.complete && ' (חלקי: יש רכיב בלי ערך)'}
            </p>
          )}

          {intent && draft.lines.length > 0 && (
            <>
              <label className="field">
                <span>{intent === 'ate' ? 'לאיזו ארוחה זה שייך?' : 'לשבץ לארוחה של היום?'}</span>
                <select value={slot} onChange={(e) => setSlot(e.target.value as SlotId | 'none')}>
                  <option value="none">{intent === 'ate' ? 'בנוסף, לא במקום ארוחה' : 'לא, רק לשמור'}</option>
                  {SLOTS.filter((s) => plannedToday.some((p) => p.slot === s)).map((s) => (
                    <option key={s} value={s}>{SLOT_LABEL[s]}</option>
                  ))}
                </select>
              </label>
              {intent !== 'ate' && (
                <div className="range">
                  <label className="field"><span>זמן כולל (דק׳)</span><input type="number" min={0} inputMode="numeric" value={totalRaw} onChange={(e) => setTotalRaw(e.target.value)} placeholder="לא ידוע" aria-label="זמן כולל בדקות" /></label>
                  <label className="field"><span>זמן עבודה (דק׳)</span><input type="number" min={0} inputMode="numeric" value={activeRaw} onChange={(e) => setActiveRaw(e.target.value)} placeholder="לא ידוע" aria-label="זמן עבודה בדקות" /></label>
                </div>
              )}
              <div className="actions">
                {intent === 'ate' ? (
                  <>
                    {slot !== 'none' && <button className="btn primary" onClick={() => confirmAte('replace')}>אכלתי, במקום הארוחה המתוכננת</button>}
                    <button className={`btn ${slot === 'none' ? 'primary' : ''}`} onClick={() => confirmAte('add')}>אכלתי, בנוסף</button>
                  </>
                ) : (
                  <>
                    <button className="btn primary" onClick={() => saveForPlan(false)}>שמור לתכנון</button>
                    <button className="btn" onClick={() => saveForPlan(true)}>שמור כמועדף</button>
                    <button className="btn ghost" onClick={() => setIntent('ate')}>בעצם כבר אכלתי</button>
                  </>
                )}
              </div>
              <p className="muted small">רק ״אכלתי״ כותב ליומן. אפשר לערוך או לבטל אחר כך.</p>
            </>
          )}
        </section>
      )}
    </Sheet>
  )
}
