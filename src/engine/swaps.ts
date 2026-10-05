import type { Pref, Profile, Recipe, SlotId } from '../types'
import { checkRecipe } from './constraints'
import { calcRecipe, type MealCalc } from './nutrition'
import { isPlannable } from './recipeBook'

/** מכפילי מנה מעשיים בלבד: לא חלקיק ביצה ולא כמות רוטב חריגה (פרק 8). */
export const PRACTICAL_MULTIPLIERS = [1, 0.75, 1.25, 1.5]

export interface SwapOption {
  recipe: Recipe
  multiplier: number
  calc: MealCalc
  diff: number
  similarOnlyByEstimate: boolean
}

export interface RankContext {
  profile: Profile
  prefs: Record<string, Pref>
  rejections: Record<string, number>
}

export function prefScore(id: string, ctx: RankContext): number {
  const p = ctx.prefs[id] ?? 'unknown'
  const base = p === 'love' ? 3 : p === 'try' ? 1 : p === 'dislike' ? -100 : 0
  return base - (ctx.rejections[id] ?? 0) * 0.75
}

const EFFORT_SCORE: Record<Recipe['effort'], number> = { none: 1, '5': 0.8, heat: 0.7, '15': 0.4, '30': 0 }

export function bestMultiplier(r: Recipe, target: number): { multiplier: number; calc: MealCalc } {
  let best = { multiplier: 1, calc: calcRecipe(r, 1) }
  for (const m of PRACTICAL_MULTIPLIERS) {
    const calc = calcRecipe(r, m)
    if (Math.abs(calc.kcal - target) < Math.abs(best.calc.kcal - target)) best = { multiplier: m, calc }
  }
  return best
}

export function eligible(r: Recipe, slot: SlotId, ctx: RankContext): boolean {
  // מתכון שהוסר או שחסרים בו נתונים לא נכנס לתכנון אוטומטי ולהחלפות ±10%
  if (!isPlannable(r)) return false
  if (!checkRecipe(r, ctx.profile).ok) return false
  if ((ctx.prefs[r.id] ?? 'unknown') === 'dislike') return false
  if (slot === 'outside') return r.kind === 'outside'
  return r.kind === 'home' && r.slots.includes(slot)
}

/**
 * עד שלוש חלופות בטווח ±tolerance מהארוחה המקורית (ברירת מחדל 10%).
 * אם אין התאמה, מחזירים רשימה ריקה ולא ממציאים מנה שקולה.
 */
export function suggestSwaps(params: {
  targetKcal: number
  slot: SlotId
  excludeId?: string
  recipes: Recipe[]
  ctx: RankContext
  tolerance?: number
  anyKind?: boolean
  targetIsEstimate?: boolean
}): SwapOption[] {
  const { targetKcal, slot, excludeId, recipes, ctx, tolerance = 0.1 } = params
  const lo = targetKcal * (1 - tolerance)
  const hi = targetKcal * (1 + tolerance)
  const opts: (SwapOption & { score: number })[] = []
  for (const r of recipes) {
    if (r.id === excludeId) continue
    if (params.anyKind ? !isPlannable(r) || !checkRecipe(r, ctx.profile).ok || ctx.prefs[r.id] === 'dislike' : !eligible(r, slot, ctx)) continue
    let pick: { multiplier: number; calc: MealCalc } | null = null
    for (const m of PRACTICAL_MULTIPLIERS) {
      const calc = calcRecipe(r, m)
      if (!calc.complete) continue
      if (calc.kcal < lo || calc.kcal > hi) continue
      if (!pick || Math.abs(calc.kcal - targetKcal) < Math.abs(pick.calc.kcal - targetKcal)) pick = { multiplier: m, calc }
    }
    if (!pick) continue
    const diff = pick.calc.kcal - targetKcal
    const score = prefScore(r.id, ctx) + EFFORT_SCORE[r.effort] - Math.abs(diff) / targetKcal * 5 - (pick.multiplier === 1 ? 0 : 0.2)
    opts.push({
      recipe: r,
      multiplier: pick.multiplier,
      calc: pick.calc,
      diff,
      similarOnlyByEstimate: pick.calc.certainty === 'estimate' && !!params.targetIsEstimate,
      score,
    })
  }
  return opts.sort((a, b) => b.score - a.score).slice(0, 3).map(({ score: _s, ...o }) => o)
}
