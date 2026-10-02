import type { PlannedMeal, Recipe, SlotId } from '../types'
import { SLOTS } from '../types'
import { addDays, isSaturday, hhmmToMinutes } from './dates'
import { kosherOf } from './nutrition'
import { bestMultiplier, eligible, prefScore, type RankContext } from './swaps'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** מועמדים מדורגים למשבצת; דטרמיניסטי לפי תאריך כדי שהתוכנית לא תקפוץ בין טעינות. */
export function rankForSlot(slot: SlotId, date: string, recipes: Recipe[], ctx: RankContext, targetKcal: number, usage: Record<string, number> = {}): Recipe[] {
  const homeForOutside = slot === 'outside' && isSaturday(date)
  return recipes
    .filter((r) => (homeForOutside ? r.kind === 'home' && eligible(r, 'evening', ctx) : eligible(r, slot, ctx)))
    .map((r) => {
      const { calc } = bestMultiplier(r, targetKcal)
      const fit = Math.abs(calc.kcal - targetKcal) / targetKcal
      const jitter = (hash(date + slot + r.id) % 1000) / 1000
      // גיוון: ארוחה שכבר חזרה השבוע יורדת מעט בדירוג, אבל לא נחסמת
      return { r, s: prefScore(r.id, ctx) - fit * 6 + jitter * 1.5 - (usage[r.id] ?? 0) * 1.2 }
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r)
}

/**
 * תכנון יום: שלוש ארוחות, אחת בחוץ. בשבת לא מניחים שמקום כשר פתוח, ולכן מתכננים מנה ביתית.
 * הפרדת בשר וחלב לפי שעות ההמתנה האישיות, רק אם הוגדרו.
 */
export function generateDay(date: string, recipes: Recipe[], ctx: RankContext, previous: PlannedMeal[] = []): PlannedMeal[] {
  const out: PlannedMeal[] = []
  const used = new Set(previous.filter((p) => p.date === addDays(date, -1)).map((p) => p.recipeId))
  const usage: Record<string, number> = {}
  for (const p of previous) if (p.date >= addDays(date, -6) && p.date < date) usage[p.recipeId] = (usage[p.recipeId] ?? 0) + 1
  for (const slot of SLOTS) {
    const target = ctx.profile.slotTargets[slot]
    const ranked = rankForSlot(slot, date, recipes, ctx, target, usage)
    const pick =
      ranked.find((r) => !used.has(r.id) && !out.some((o) => o.recipeId === r.id) && waitOk(r, slot, out, recipes, ctx)) ??
      ranked.find((r) => waitOk(r, slot, out, recipes, ctx)) ??
      ranked[0]
    if (!pick) continue
    out.push({ date, slot, recipeId: pick.id, multiplier: bestMultiplier(pick, target).multiplier, status: 'planned' })
  }
  return out
}

function waitOk(r: Recipe, slot: SlotId, sameDay: PlannedMeal[], recipes: Recipe[], ctx: RankContext): boolean {
  const wait = ctx.profile.meatDairyWaitHours
  if (wait == null) return true
  if (kosherOf(r.items) !== 'dairy') return true
  const t = hhmmToMinutes(ctx.profile.mealTimes[slot])
  return !sameDay.some((p) => {
    const pr = recipes.find((x) => x.id === p.recipeId)
    if (!pr || kosherOf(pr.items) !== 'meat') return false
    const pt = hhmmToMinutes(ctx.profile.mealTimes[p.slot])
    return pt <= t && t - pt < wait * 60
  })
}

export function generateWeek(start: string, recipes: Recipe[], ctx: RankContext, keep: PlannedMeal[] = []): PlannedMeal[] {
  const result: PlannedMeal[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i)
    const kept = keep.filter((p) => p.date === date)
    const fresh = generateDay(date, recipes, ctx, [...keep, ...result])
    for (const slot of SLOTS) {
      // תכנון מחדש לא נוגע בארוחות שכבר דווחו
      const k = kept.find((p) => p.slot === slot && p.status !== 'planned')
      const f = fresh.find((p) => p.slot === slot)
      if (k) result.push(k)
      else if (f) result.push(f)
    }
  }
  return result
}
