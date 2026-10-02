import { FOOD_BY_ID } from '../data/foods'
import type { PlannedMeal, Recipe, ShoppingLine } from '../types'

/**
 * המרה ממשקל מבושל במתכון לכמות שקונים. מקדמי בישול כלליים ומסומנים כהנחה:
 * אורז כ־2.9 פי משקלו היבש; עוף ובשר מאבדים כרבע ממשקלם.
 */
const BUY_AS: Record<string, { foodId: string; factor: number }> = {
  rice_cooked: { foodId: 'rice_dry', factor: 0.34 },
  chicken_thigh: { foodId: 'chicken_thigh', factor: 1.33 },
  chicken_breast: { foodId: 'chicken_breast', factor: 1.33 },
  beef_ground: { foodId: 'beef_ground', factor: 1.33 },
  salmon: { foodId: 'salmon', factor: 1.25 },
}

export interface ShoppingResult {
  toBuy: ShoppingLine[]
  covered: ShoppingLine[]
}

/** הרשימה מחושבת רק מארוחות בבית שעוד לא נאכלו; אוכל שקונים בחוץ לא מוסיף מצרכים. */
export function generateShopping(plan: PlannedMeal[], recipes: Recipe[], pantry: Record<string, boolean>): ShoppingResult {
  const need = new Map<string, number>()
  for (const p of plan) {
    if (p.status !== 'planned') continue
    const r = recipes.find((x) => x.id === p.recipeId)
    if (!r || r.kind !== 'home') continue
    for (const it of r.items) {
      const conv = BUY_AS[it.foodId]
      const id = conv ? conv.foodId : it.foodId
      const g = it.grams * p.multiplier * (conv ? conv.factor : 1)
      need.set(id, (need.get(id) ?? 0) + g)
    }
  }
  const toBuy: ShoppingLine[] = []
  const covered: ShoppingLine[] = []
  for (const [foodId, grams] of need) {
    const f = FOOD_BY_ID[foodId]
    if (!f || f.id === 'water') continue
    const packs = f.pack ? Math.max(1, Math.ceil(grams / f.pack.grams)) : 1
    const line: ShoppingLine = {
      foodId,
      name: f.name,
      category: f.category,
      neededGrams: Math.round(grams),
      packs,
      packLabel: f.pack ? f.pack.label : 'לפי הצורך',
    }
    if (pantry[foodId]) covered.push(line)
    else toBuy.push(line)
  }
  const byCat = (a: ShoppingLine, b: ShoppingLine) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'he')
  return { toBuy: toBuy.sort(byCat), covered: covered.sort(byCat) }
}

export interface ShoppingDiff {
  added: ShoppingLine[]
  removed: ShoppingLine[]
  changed: { from: ShoppingLine; to: ShoppingLine }[]
}

export function diffShopping(confirmed: ShoppingLine[], fresh: ShoppingLine[]): ShoppingDiff {
  const a = new Map(confirmed.map((l) => [l.foodId, l]))
  const b = new Map(fresh.map((l) => [l.foodId, l]))
  const added = fresh.filter((l) => !a.has(l.foodId))
  const removed = confirmed.filter((l) => !b.has(l.foodId))
  const changed = fresh
    .filter((l) => a.has(l.foodId) && a.get(l.foodId)!.packs !== l.packs)
    .map((l) => ({ from: a.get(l.foodId)!, to: l }))
  return { added, removed, changed }
}

export function isEmptyDiff(d: ShoppingDiff) {
  return d.added.length + d.removed.length + d.changed.length === 0
}
