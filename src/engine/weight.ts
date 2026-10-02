import type { WeightEntry } from '../types'
import { addDays } from './dates'

export interface WeightSummary {
  latest: WeightEntry | null
  first: WeightEntry | null
  count: number
  /** שינוי ממוצע בין שני חלונות של 7 ימים; null כשאין מספיק נתונים */
  weeklyTrend: number | null
}

/** כלל מוצר: לפחות 3 מדידות בכל אחד משני חלונות שבועיים סמוכים (פרק 17). */
export function summarizeWeight(entries: WeightEntry[], today: string): WeightSummary {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const inRange = (from: string, to: string) => sorted.filter((e) => e.date >= from && e.date <= to)
  const last = inRange(addDays(today, -6), today)
  const prev = inRange(addDays(today, -13), addDays(today, -7))
  const avg = (xs: WeightEntry[]) => xs.reduce((s, e) => s + e.kg, 0) / xs.length
  return {
    latest: sorted.at(-1) ?? null,
    first: sorted[0] ?? null,
    count: sorted.length,
    weeklyTrend: last.length >= 3 && prev.length >= 3 ? avg(last) - avg(prev) : null,
  }
}
