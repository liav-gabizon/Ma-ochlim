import { FOOD_BY_ID } from '../data/foods'
import type { Allergen, KosherClass, MealItem, Recipe, Source } from '../types'

export interface ItemCalc {
  foodId: string
  name: string
  grams: number
  kcal: number | null
  protein: number | null
  source: Source
  optional?: boolean
}

export interface MealCalc {
  items: ItemCalc[]
  /** סכום הערכים הידועים */
  kcal: number
  /** false כשלפחות לרכיב אחד אין ערך קלורי: הסך חלקי */
  complete: boolean
  /** null כשחלבון לא ידוע לאחד הרכיבים */
  protein: number | null
  certainty: Source
}

// סדר ודאות מהגבוה לנמוך (פרק 11)
const CERTAINTY_ORDER: Source[] = ['label', 'restaurant', 'usda', 'recipe', 'estimate']

export function calcItem(foodId: string, grams: number): ItemCalc {
  const f = FOOD_BY_ID[foodId]
  if (!f) return { foodId, name: foodId, grams, kcal: null, protein: null, source: 'estimate' }
  // נוסחת הבסיס: ערך ל־100 גרם × משקל ÷ 100
  return {
    foodId,
    name: f.name,
    grams,
    kcal: f.kcal100 == null ? null : (f.kcal100 * grams) / 100,
    protein: f.protein100 == null ? null : (f.protein100 * grams) / 100,
    source: f.source,
  }
}

export function calcItems(items: MealItem[], multiplier = 1, skipOptional: string[] = []): MealCalc {
  const calc = items
    .filter((i) => !(i.optional && skipOptional.includes(i.foodId)))
    .map((i) => ({ ...calcItem(i.foodId, i.grams * multiplier), optional: i.optional }))
  return summarize(calc)
}

export function summarize(calc: ItemCalc[]): MealCalc {
  let kcal = 0
  let complete = true
  let protein: number | null = 0
  let worst = 0
  for (const c of calc) {
    if (c.kcal == null) complete = false
    else kcal += c.kcal
    if (c.protein == null) protein = null
    else if (protein != null) protein += c.protein
    worst = Math.max(worst, CERTAINTY_ORDER.indexOf(c.source))
  }
  return { items: calc, kcal, complete, protein, certainty: CERTAINTY_ORDER[worst] ?? 'estimate' }
}

export function calcRecipe(r: Recipe, multiplier = 1, skipOptional: string[] = []): MealCalc {
  const c = calcItems(r.items, multiplier, skipOptional)
  // ארוחה שכל רכיביה ממאגר מוכר היא ״לפי מתכון״; אוכל בחוץ נשאר אומדן
  if (r.kind === 'outside') c.certainty = 'estimate'
  else if (c.certainty === 'usda' || c.certainty === 'label') c.certainty = 'recipe'
  return c
}

export function kosherOf(items: MealItem[]): KosherClass | 'conflict' {
  let meat = false
  let dairy = false
  for (const i of items) {
    const k = FOOD_BY_ID[i.foodId]?.kosher
    if (k === 'meat') meat = true
    if (k === 'dairy') dairy = true
  }
  if (meat && dairy) return 'conflict'
  return meat ? 'meat' : dairy ? 'dairy' : 'parve'
}

export function allergensOf(items: MealItem[]): Set<Allergen> {
  const s = new Set<Allergen>()
  for (const i of items) for (const a of FOOD_BY_ID[i.foodId]?.allergens ?? []) s.add(a)
  return s
}

export function round(n: number): number {
  return Math.round(n)
}

/** עיגול לתצוגה: עד 10 קק״ל, כדי לא להציג דיוק מזויף */
export function displayKcal(n: number): string {
  return (Math.round(n / 10) * 10).toLocaleString('he-IL')
}
