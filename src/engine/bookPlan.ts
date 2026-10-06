import type { AppState, Recipe, ShoppingLine, SlotId } from '../types'
import { checkRecipe } from './constraints'
import { replacePlannedState } from './meal'
import { fitsWithin, isPlannable } from './recipeBook'
import { diffShopping, generateShopping, type ShoppingDiff } from './shopping'
import { prefScore, type RankContext } from './swaps'

/**
 * הצעה אחת מספר המתכונים. רק מתכון מלא, שעומד באילוצים, לא סומן ״לא לטעמי״ ובטווח הזמן.
 * מועדפים ו״תמיד מתאים לי״ קודם. skip = מה שכבר נדחה ב״לא בא לי״ במסך הזה (לא נוגע ביומן).
 */
export function suggestFromBook(recipes: Recipe[], ctx: RankContext & { alwaysGood: string[]; favorites?: string[] }, opts: { slot: SlotId; maxMinutes: number | null; skip: string[] }): Recipe | null {
  const pool = recipes.filter(
    (r) =>
      r.kind === 'home' &&
      isPlannable(r) &&
      r.slots.includes(opts.slot) &&
      checkRecipe(r, ctx.profile).ok &&
      (ctx.prefs[r.id] ?? 'unknown') !== 'dislike' &&
      (opts.maxMinutes == null || fitsWithin(r, opts.maxMinutes)) &&
      !opts.skip.includes(r.id),
  )
  pool.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'he'))
  return pool[0] ?? null
  function score(r: Recipe) {
    return prefScore(r.id, ctx) + (ctx.alwaysGood.includes(r.id) ? 2 : 0) + (ctx.favorites?.includes(r.id) ? 1 : 0)
  }
}

export interface PlanPreview {
  next: AppState
  /** שינוי ברשימת הקניות שנגרם רק מהשיבוץ הזה */
  diff: ShoppingDiff
  /** האם יש רשימה מאושרת שתתעדכן */
  updatesConfirmed: boolean
}

/**
 * שיבוץ מתכון ועדכון רשימת הקניות כפעולה אחת. הפונקציה טהורה: מחזירה מצב חדש לאישור,
 * וביטול פשוט לא מחיל אותו, כך ששני הדברים נשארים כמו שהיו.
 * הרשימה המאושרת מתעדכנת רק בהפרש שנובע מהשיבוץ (לא שינויים אחרים שממתינים),
 * וסימוני ״נקנה״ נשמרים כי הם לפי מזהה מצרך.
 */
export function previewPlan(state: AppState, recipes: Recipe[], date: string, slot: SlotId, recipeId: string, cookServings: number): PlanPreview {
  const before = generateShopping(state.plan, recipes, state.pantry)
  const replaced = replacePlannedState(state, date, slot, recipeId, 1, false)
  const plan = replaced.plan.map((m) => (m.date === date && m.slot === slot ? { ...m, cookServings } : m))
  const after = generateShopping(plan, recipes, state.pantry)
  const diff = diffShopping(before.toBuy, after.toBuy)
  const confirmed = state.shopping.confirmed
  const nextConfirmed = confirmed ? applyDiff(confirmed, diff) : null
  return {
    next: { ...replaced, plan, shopping: { ...state.shopping, confirmed: nextConfirmed, confirmedAt: confirmed ? state.shopping.confirmedAt : null } },
    diff,
    updatesConfirmed: !!confirmed,
  }
}

function applyDiff(list: ShoppingLine[], d: ShoppingDiff): ShoppingLine[] {
  const removed = new Set(d.removed.map((l) => l.foodId))
  const changed = new Map(d.changed.map((c) => [c.to.foodId, c.to]))
  const out = list.filter((l) => !removed.has(l.foodId)).map((l) => changed.get(l.foodId) ?? l)
  for (const a of d.added) if (!out.some((l) => l.foodId === a.foodId)) out.push(a)
  return out
}
