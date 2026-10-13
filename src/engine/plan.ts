import type { PlannedMeal, Recipe, SlotId } from '../types'
import { SLOTS } from '../types'
import { checkRecipe } from './constraints'
import { addDays, isSaturday, hhmmToMinutes } from './dates'
import { kosherOf } from './nutrition'
import { bestMultiplier, eligible, prefScore, type RankContext } from './swaps'
import { slotTarget } from './targets'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * מועמדים מדורגים למשבצת; דטרמיניסטי לפי תאריך כדי שהתוכנית לא תקפוץ בין טעינות.
 * targetKcal=null (אין יעד ידוע): לא מדרגים לפי קרבה ליעד, ולא מניחים יעד אפס.
 */
export function rankForSlot(slot: SlotId, date: string, recipes: Recipe[], ctx: RankContext, targetKcal: number | null, usage: Record<string, number> = {}): Recipe[] {
  const homeForOutside = slot === 'outside' && isSaturday(date)
  return recipes
    .filter((r) => (homeForOutside ? r.kind === 'home' && eligible(r, 'evening', ctx) : eligible(r, slot, ctx)))
    .map((r) => {
      const fit = targetKcal == null ? 0 : Math.abs(bestMultiplier(r, targetKcal).calc.kcal - targetKcal) / targetKcal
      const jitter = (hash(date + slot + r.id) % 1000) / 1000
      // גיוון: ארוחה שכבר חזרה השבוע יורדת מעט בדירוג, אבל לא נחסמת
      return { r, s: prefScore(r.id, ctx) - fit * 6 + jitter * 1.5 - (usage[r.id] ?? 0) * 1.2 }
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r)
}

/** ארוחה שדולגה או הוחלפה לא נאכלה כמתוכנן, ולכן אינה יוצרת זמן המתנה בין בשר לחלב. */
const countsForWait = (p: PlannedMeal) => p.status !== 'skipped' && p.status !== 'swapped'

type WaitClash = { other: PlannedMeal; side: 'dairyAfterMeat' | 'meatBeforeDairy' }

/**
 * התנגשות המתנה בין בשר לחלב באותו יום, לשני הכיוונים: מנה חלבית פחות מ־N שעות אחרי בשרית,
 * או מנה בשרית שפחות מ־N שעות לפני חלבית. רק אם המשתמש הגדיר שעות המתנה.
 */
function waitClashes(r: Recipe, slot: SlotId, others: PlannedMeal[], recipes: Recipe[], ctx: RankContext): WaitClash[] {
  const wait = ctx.profile.meatDairyWaitHours
  if (wait == null) return []
  const k = kosherOf(r.items)
  if (k !== 'dairy' && k !== 'meat') return []
  const t = hhmmToMinutes(ctx.profile.mealTimes[slot])
  const out: WaitClash[] = []
  for (const p of others) {
    if (p.slot === slot || !countsForWait(p)) continue
    const pr = recipes.find((x) => x.id === p.recipeId)
    if (!pr) continue
    const pk = kosherOf(pr.items)
    const pt = hhmmToMinutes(ctx.profile.mealTimes[p.slot])
    if (k === 'dairy' && pk === 'meat' && pt <= t && t - pt < wait * 60) out.push({ other: p, side: 'dairyAfterMeat' })
    if (k === 'meat' && pk === 'dairy' && t <= pt && pt - t < wait * 60) out.push({ other: p, side: 'meatBeforeDairy' })
  }
  return out
}

/**
 * בחירה למשבצת: רק מנה שעומדת באילוצים (אלרגיות, בשר וחלב, זמן המתנה מול שאר ארוחות היום).
 * האילוצים קודמים לדירוג: אם אין מנה שעומדת בהם מחזירים undefined, ולא את המדורגת הראשונה.
 */
function pickForSlot(slot: SlotId, date: string, recipes: Recipe[], ctx: RankContext, day: PlannedMeal[], previous: PlannedMeal[]): { recipe: Recipe; multiplier: number } | undefined {
  const used = new Set(previous.filter((p) => p.date === addDays(date, -1)).map((p) => p.recipeId))
  const usage: Record<string, number> = {}
  for (const p of previous) if (p.date >= addDays(date, -6) && p.date < date) usage[p.recipeId] = (usage[p.recipeId] ?? 0) + 1
  const target = slotTarget(ctx, date, slot)
  const ok = rankForSlot(slot, date, recipes, ctx, target, usage).filter((r) => waitClashes(r, slot, day, recipes, ctx).length === 0)
  const pick = ok.find((r) => !used.has(r.id) && !day.some((o) => o.recipeId === r.id)) ?? ok[0]
  if (!pick) return undefined
  return { recipe: pick, multiplier: target == null ? 1 : bestMultiplier(pick, target).multiplier }
}

/**
 * תכנון יום: שלוש ארוחות, אחת בחוץ. בשבת לא מניחים שמקום כשר פתוח, ולכן מתכננים מנה ביתית.
 * הפרדת בשר וחלב לפי שעות ההמתנה האישיות, רק אם הוגדרו.
 * fixed = ארוחות של אותו יום שלא מתכננים מחדש (כבר דווחו); הן נשארות ונלקחות בחשבון בהפרדה.
 */
export function generateDay(date: string, recipes: Recipe[], ctx: RankContext, previous: PlannedMeal[] = [], fixed: PlannedMeal[] = []): PlannedMeal[] {
  const day: PlannedMeal[] = fixed.filter((p) => p.date === date)
  for (const slot of SLOTS) {
    if (day.some((p) => p.slot === slot)) continue
    const pick = pickForSlot(slot, date, recipes, ctx, day, previous)
    if (!pick) continue
    day.push({ date, slot, recipeId: pick.recipe.id, multiplier: pick.multiplier, status: 'planned' })
  }
  return SLOTS.flatMap((slot) => day.filter((p) => p.slot === slot))
}

export function generateWeek(start: string, recipes: Recipe[], ctx: RankContext, keep: PlannedMeal[] = []): PlannedMeal[] {
  const result: PlannedMeal[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i)
    // תכנון מחדש לא נוגע בארוחות שכבר דווחו
    const kept = SLOTS.flatMap((slot) => keep.filter((p) => p.date === date && p.slot === slot && p.status !== 'planned').slice(0, 1))
    result.push(...generateDay(date, recipes, ctx, [...keep, ...result], kept))
  }
  return result
}

export interface ConstraintChange {
  date: string
  slot: SlotId
  from: string
  /** null = לא נמצאה חלופה שעומדת באילוצים, והמשבצת התרוקנה */
  to: string | null
  reasons: string[]
}

/**
 * למה ארוחה אינה עומדת באילוצים הנוכחיים: אלרגיות, בשר וחלב באותה מנה, וזמן המתנה מול שאר ארוחות היום.
 * כששתי ארוחות מתוכננות מתנגשות בזמן ההמתנה, החלבית המאוחרת היא המפרה (כמו בתכנון יום);
 * ארוחה בשרית מתוכננת מפרה רק מול חלבית שכבר אינה ״מתוכננת״ ולכן לא תוחלף.
 */
export function planViolations(meal: PlannedMeal, day: PlannedMeal[], recipes: Recipe[], ctx: RankContext): string[] {
  const r = recipes.find((x) => x.id === meal.recipeId)
  if (!r) return []
  const reasons = [...checkRecipe(r, ctx.profile).reasons]
  const others = day.filter((p) => p.date === meal.date && p.slot !== meal.slot)
  const wait = ctx.profile.meatDairyWaitHours
  for (const c of waitClashes(r, meal.slot, others, recipes, ctx)) {
    if (c.side === 'dairyAfterMeat') reasons.push(`פחות מ־${wait} שעות אחרי ארוחה בשרית`)
    else if (c.other.status !== 'planned') reasons.push(`פחות מ־${wait} שעות לפני ארוחה חלבית`)
  }
  return [...new Set(reasons)]
}

/**
 * אכיפת האילוצים על תכנון קיים (אחרי שינוי אלרגיות, שעות המתנה או שעות ארוחה), מתאריך from:
 * ארוחה ״מתוכננת״ שמפרה אילוץ מוחלפת במנה המדורגת הבאה שעומדת בכל האילוצים; אם אין כזו, היא מוסרת
 * מהתכנון ואינה נשארת בשקט. ארוחות שדווחו (נאכלה, חלקית, הוחלפה, דולגה) וארוחה בהכנה לא משתנות,
 * וארוחות שאינן מפרות נשארות במקומן. אין שינוי ב״לא בא לי״ (rejections): זו אינה דחייה של המנה.
 */
export function enforceConstraints(plan: PlannedMeal[], recipes: Recipe[], ctx: RankContext, from: string): { plan: PlannedMeal[]; changes: ConstraintChange[] } {
  let next = plan
  const changes: ConstraintChange[] = []
  const dates = [...new Set(plan.filter((p) => p.date >= from).map((p) => p.date))].sort()
  for (const date of dates) {
    for (const slot of SLOTS) {
      const meal = next.find((p) => p.date === date && p.slot === slot)
      if (!meal || meal.status !== 'planned') continue
      const reasons = planViolations(meal, next.filter((p) => p.date === date), recipes, ctx)
      if (reasons.length === 0) continue
      const rest = next.filter((p) => p !== meal)
      const pick = pickForSlot(slot, date, recipes, ctx, rest.filter((p) => p.date === date), rest)
      const replacement: PlannedMeal | null = pick ? { date, slot, recipeId: pick.recipe.id, multiplier: pick.multiplier, status: 'planned' } : null
      next = next.flatMap((p) => (p === meal ? (replacement ? [replacement] : []) : [p]))
      changes.push({ date, slot, from: meal.recipeId, to: replacement?.recipeId ?? null, reasons })
    }
  }
  return { plan: next, changes }
}
