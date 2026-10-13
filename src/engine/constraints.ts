import type { MealItem, Profile, Recipe } from '../types'
import { allergensOf, kosherOf } from './nutrition'

export interface ConstraintResult {
  ok: boolean
  reasons: string[]
}

const ALLERGEN_HE: Record<string, string> = {
  gluten: 'גלוטן', milk: 'חלב', egg: 'ביצים', peanut: 'בוטנים', nuts: 'אגוזים', sesame: 'שומשום', fish: 'דגים', soy: 'סויה',
}
export const ALLERGEN_OPTIONS = Object.entries(ALLERGEN_HE).map(([id, label]) => ({ id, label }))
export function allergenLabel(id: string) {
  return ALLERGEN_HE[id] ?? id
}

/** אילוצי אלרגיות וכשרות קודמים לכל ניקוד העדפות (פרק 8). */
export function checkItems(items: MealItem[], profile: Profile): ConstraintResult {
  const reasons: string[] = []
  if (kosherOf(items) === 'conflict') reasons.push('בשר וחלב באותה ארוחה')
  if (Array.isArray(profile.allergies)) {
    const found = allergensOf(items)
    for (const a of profile.allergies) if (found.has(a)) reasons.push(`מכיל ${allergenLabel(a)}`)
  }
  return { ok: reasons.length === 0, reasons }
}

export function checkRecipe(r: Recipe, profile: Profile): ConstraintResult {
  return checkItems(r.items, profile)
}

/**
 * אותה בדיקה לטיוטה של טקסט חופשי: כל השורות יחד הן ארוחה אחת.
 * מנה מורכבת נבדקת לפי הרכיבים שנשארו בה (אחרי ״בלי X״), מאכל בודד לפי הרשומה במאגר.
 */
export function checkDraft(lines: { foodId?: string; parts?: MealItem[]; grams: number }[], profile: Profile): ConstraintResult {
  return checkItems(lines.flatMap((l) => l.parts ?? (l.foodId ? [{ foodId: l.foodId, grams: l.grams }] : [])), profile)
}
