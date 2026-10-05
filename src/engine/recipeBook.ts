import type { MinuteRange, Recipe } from '../types'
import { calcRecipe, kosherOf, allergensOf, servingDivisor, type MealCalc } from './nutrition'

// ספר המתכונים (שלב 3). עזרים טהורים בלבד: בלי React ובלי מצב.
// עיקרון: מידע חסר נשאר ״לא ידוע״. לא משלימים כמות, זמן או מספר מנות בניחוש.

export type Completeness = 'full' | 'partial' | 'unknown'

/** מספר המנות שהמתכון מניב. ארוחה קיימת או מטקסט חופשי היא מנה אחת; מתכון מהספר לפי מה שהוזן. */
export function portionsOf(r: Recipe): number | null {
  if (r.origin !== 'book') return 1
  return r.servings && r.servings > 0 ? r.servings : null
}

/**
 * full: כל הרכיבים זוהו, לכולם ערך קלורי, ומספר המנות ידוע.
 * partial: יש רכיבים, אבל חלקם לא זוהו / חסר ערך / חסר מספר מנות.
 * unknown: אין רכיבים כלל (שם וקישור בלבד).
 */
export function completeness(r: Recipe): Completeness {
  if (r.items.length === 0) return 'unknown'
  if ((r.unresolved?.length ?? 0) > 0) return 'partial'
  if (portionsOf(r) == null) return 'partial'
  return calcRecipe(r, 1).complete ? 'full' : 'partial'
}

/** רק מתכון מלא שלא הוסר נכנס לתכנון, להחלפות ולרשימת הקניות */
export function isPlannable(r: Recipe): boolean {
  return !r.archived && completeness(r) === 'full'
}

/** זמן עבודה וזמן כולל כשדות נפרדים. ארוחות קיימות: ערך מדויק מהנתונים. */
export function recipeTimes(r: Recipe): { active: MinuteRange | null; total: MinuteRange | null } {
  if (r.time) return r.time
  return {
    active: { min: r.activeMinutes, max: r.activeMinutes },
    total: { min: r.totalMinutes, max: r.totalMinutes },
  }
}

export function rangeText(x: MinuteRange | null): string {
  if (!x || (x.min == null && x.max == null)) return 'לא ידוע'
  if (x.min != null && x.max != null) return x.min === x.max ? `${x.max} דק׳` : `${x.min}–${x.max} דק׳`
  if (x.max != null) return `עד ${x.max} דק׳`
  return `${x.min} דק׳ ומעלה`
}

/** ״עד N דקות״ רק כשהזמן הכולל ידוע וגבולו העליון ≤ N. זמן לא ידוע לא נכלל. */
export function fitsWithin(r: Recipe, maxMinutes: number): boolean {
  const t = recipeTimes(r).total
  return t != null && t.max != null && t.max <= maxMinutes
}

export function timeKnown(r: Recipe): boolean {
  const t = recipeTimes(r).total
  return t != null && (t.max != null || t.min != null)
}

export interface BookNutrition {
  status: Completeness
  /** null כשאין מספיק נתונים */
  perServing: MealCalc | null
  /** לכל הכמות שמבשלים (servings מנות) */
  whole: MealCalc | null
}

export function bookNutrition(r: Recipe, cookServings?: number): BookNutrition {
  const status = completeness(r)
  if (status !== 'full') return { status, perServing: null, whole: null }
  const portions = cookServings ?? portionsOf(r) ?? 1
  return { status, perServing: calcRecipe(r, 1), whole: calcRecipe(r, portions) }
}

/** בשרי/חלבי/פרווה מחושב מהרכיבים; בלי רשימה מלאה, ״לא נבדק״ */
export function kosherLabel(r: Recipe): string {
  if (completeness(r) !== 'full') return 'התאמה לכשרות לא נבדקה'
  return { meat: 'בשרי', dairy: 'חלבי', parve: 'פרווה', conflict: 'בשר וחלב יחד: חסום' }[kosherOf(r.items)]
}

/** אלרגנים מוצגים רק כשרשימת הרכיבים מלאה; אחרת לא מסמנים ״בטוח״ */
export function allergensKnown(r: Recipe): boolean {
  return completeness(r) === 'full'
}

export { allergensOf, servingDivisor }

/** קישור שהמשתמש הזין: רק http/https, נשמר כפי שהוזן (אחרי trim) */
export function cleanLink(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** קריאת זמן משני שדות: ״מ־״ ו״עד״. שניהם ריקים = לא ידוע. */
export function parseRange(minRaw: string, maxRaw: string): MinuteRange | null {
  const n = (v: string) => {
    const t = v.trim()
    if (!t) return null
    const x = Number(t)
    return Number.isFinite(x) && x >= 0 ? Math.round(x) : null
  }
  const min = n(minRaw)
  const max = n(maxRaw)
  if (min == null && max == null) return null
  if (min != null && max != null && min > max) return { min: max, max: min }
  return { min, max }
}

/** מאמץ הכנה נגזר מזמן העבודה; זמן לא ידוע נחשב ״30״, כך שלא יופיע במסלולים המהירים */
export function effortFromActive(active: MinuteRange | null): Recipe['effort'] {
  const m = active?.max ?? null
  if (m == null) return '30'
  if (m <= 2) return 'none'
  if (m <= 5) return '5'
  if (m <= 15) return '15'
  return '30'
}
