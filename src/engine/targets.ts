import type { GoalVersion, Profile, SlotId } from '../types'
import type { RankContext } from './swaps'

/** שלד זמני לפני התיקון: משקף את ההתנהגות הקיימת (יעדי המשבצות קבועים ואינם תלויים ביעד היומי). */
export function dailyGoal(goals: GoalVersion[] | undefined, _date: string): number | null {
  return goals?.[0]?.kcal ?? null
}
export function slotTargets(profile: Profile, _dailyKcal: number | null): Record<SlotId, number | null> {
  return { ...profile.slotTargets }
}
export function slotTarget(ctx: RankContext, _date: string, slot: SlotId): number | null {
  return ctx.profile.slotTargets[slot]
}
