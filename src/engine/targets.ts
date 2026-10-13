import type { GoalVersion, Profile, SlotId } from '../types'
import { SLOTS } from '../types'
import type { RankContext } from './swaps'

const known = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** היעד היומי שבתוקף בתאריך (אותו כלל כמו goalFor ב־store). null = אין יעד ידוע; לא מניחים מספר. */
export function dailyGoal(goals: GoalVersion[] | undefined, date: string): number | null {
  if (!goals || goals.length === 0) return null
  const valid = goals.filter((g) => g.effectiveFrom <= date).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.setAt.localeCompare(b.setAt))
  const kcal = (valid.at(-1) ?? goals[0]).kcal
  return known(kcal) ? kcal : null
}

/**
 * יעד קלורי לכל משבצת: היעד היומי מחולק לפי היחס שבין ערכי profile.slotTargets
 * (ברירת המחדל 700/1000/800, כלומר 28%/40%/32%). ביעד 2,500 התוצאה זהה לערכים השמורים.
 * ערך חסר נשאר חסר: בלי יעד יומי ידוע, או כשחסר ערך בחלוקה, אין יעד למשבצת (null) ולא אפס.
 */
export function slotTargets(profile: Profile, dailyKcal: number | null): Record<SlotId, number | null> {
  const shares = SLOTS.map((s) => profile.slotTargets?.[s])
  const none = { morning: null, outside: null, evening: null }
  if (!known(dailyKcal) || !shares.every(known)) return none
  const sum = shares.reduce((a, b) => a + b, 0)
  const out: Record<SlotId, number | null> = { ...none }
  SLOTS.forEach((s, i) => { out[s] = (dailyKcal * shares[i]) / sum })
  return out
}

/** יעד המשבצת בתאריך. הקשר בלי goals (קוראים ישנים ובדיקות) משתמש בערכי הפרופיל כפי שהם. */
export function slotTarget(ctx: RankContext, date: string, slot: SlotId): number | null {
  if (ctx.goals === undefined) {
    const t = ctx.profile.slotTargets?.[slot]
    return known(t) ? t : null
  }
  return slotTargets(ctx.profile, dailyGoal(ctx.goals, date))[slot]
}
