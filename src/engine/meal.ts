import type { AppState, PlannedMeal, SlotId } from '../types'

/** החלפת המנה אינה דיווח אכילה ואינה מבטלת את התזכורת: התזכורת נשלחת לארוחה הנוכחית במשבצת, פעם אחת ביום (ראו notifications.ts). */
export function replacePlannedState(s: AppState, date: string, slot: SlotId, recipeId: string, multiplier: number, rejectOld = true): AppState {
  const old = s.plan.find((m) => m.date === date && m.slot === slot)
  const rejections = { ...s.rejections }
  if (old && rejectOld) rejections[old.recipeId] = (rejections[old.recipeId] ?? 0) + 1
  const meal: PlannedMeal = { date, slot, recipeId, multiplier, status: 'planned' }
  return {
    ...s,
    rejections,
    plan: old ? s.plan.map((m) => m.date === date && m.slot === slot ? meal : m) : [...s.plan, meal],
  }
}
