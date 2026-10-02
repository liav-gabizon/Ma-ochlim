import { RECIPES } from './data/recipes'
import { hhmmToMinutes, localDate, localMinutes } from './engine/dates'
import type { AppState, SlotId } from './types'
import { SLOTS } from './types'

// תזכורות ארוחה (פרק 15). בגרסה זו התזמון רץ כשהאפליקציה פתוחה או ברקע קצר;
// משלוח אמין כשהאייפון נעול דורש שרת Web Push, וזה השלב הבא.

export const SLOT_LABEL: Record<SlotId, string> = { morning: 'ארוחת בוקר', outside: 'ארוחה בחוץ', evening: 'ארוחת ערב' }
const EXPIRY_MIN = 120

export interface DueReminder {
  key: string
  slot: SlotId
  title: string
  body: string
}

function inQuiet(min: number, start: string, end: string) {
  const s = hhmmToMinutes(start)
  const e = hhmmToMinutes(end)
  return s <= e ? min >= s && min < e : min >= s || min < e
}

/** מחזיר תזכורת אחת לכל היותר שצריך לשלוח עכשיו, אחרי כל הבדיקות. */
export function dueReminder(s: AppState, now: Date): DueReminder | null {
  const n = s.notifications
  if (!n.enabled || !n.timesConfirmed) return null
  const tz = s.profile.timezone
  const today = localDate(now, tz)
  const min = localMinutes(now, tz)
  if (inQuiet(min, n.quietStart, n.quietEnd)) return null
  const sentToday = s.sent.filter((x) => x.key.startsWith(today)).length
  if (sentToday >= n.dailyCap) return null

  for (const slot of SLOTS) {
    const meal = s.plan.find((p) => p.date === today && p.slot === slot)
    // דיווח, דילוג או החלפה מבטלים את התזכורת
    if (!meal || meal.status !== 'planned') continue
    const slotKey = `${today}:${slot}`
    const snoozeUntil = s.snoozed[slotKey]
    const base = hhmmToMinutes(s.profile.mealTimes[slot])
    let due = base
    let version = `${meal.recipeId}`
    if (snoozeUntil) {
      const until = new Date(snoozeUntil)
      if (now < until) continue
      due = localMinutes(until, tz)
      version += ':snz:' + snoozeUntil
    }
    if (min < due || min > due + EXPIRY_MIN) continue // תזכורת שפג תוקפה לא נשלחת
    const key = `${slotKey}:${version}`
    if (s.sent.some((x) => x.key === key)) continue
    const r = [...RECIPES, ...s.customRecipes].find((x) => x.id === meal.recipeId)
    const body = n.genericLockText
      ? 'זמן לאכול. לפתוח את הארוחה?'
      : `זמן לאכול. ${r?.name ?? 'הארוחה'} ${r && r.totalMinutes > 0 ? `לוקח כ־${r.totalMinutes} דקות` : 'מחכה לך'}. לפתוח?`
    return { key, slot, title: SLOT_LABEL[slot], body }
  }
  return null
}

export async function showNotification(title: string, body: string, slot?: SlotId): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) await reg.showNotification(title, { body, data: { slot }, tag: slot ?? 'test', icon: './icon.svg' })
    else new Notification(title, { body, tag: slot ?? 'test' })
    return true
  } catch {
    return false
  }
}

export function notificationSupport(): 'unsupported' | NotificationPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}
