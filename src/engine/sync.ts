import type { AppState, LogEntry, PlannedMeal } from '../types'

// מיזוג בין מצב המכשיר למצב בחשבון. היומן מאוחד לפי מפתח ייחודי, כך שאותה ארוחה
// לא נרשמת פעמיים גם אם דווחה בשני מכשירים או נשלחה שוב אחרי ניתוק.

export function hasUserData(s: AppState | null | undefined): boolean {
  if (!s) return false
  return s.log.length > 0 || s.weights.length > 0 || s.customRecipes.length > 0 || s.ideas.length > 0 ||
    Object.keys(s.pantry).length > 0 || s.plan.some((p) => p.status !== 'planned') || s.goals.length > 1
}

export function mergeLogs(a: LogEntry[], b: LogEntry[]): LogEntry[] {
  const byKey = new Map<string, LogEntry>()
  const baseKey = (e: LogEntry) => e.id
  for (const e of [...a, ...b]) {
    const k = baseKey(e)
    const prev = byKey.get(k)
    if (!prev || e.version > prev.version) byKey.set(k, e)
  }
  // אותו מפתח ייחודי עם מזהים שונים (שתי לחיצות בשני מכשירים): נשארת רשומה פעילה אחת
  const active = new Map<string, LogEntry>()
  const out: LogEntry[] = []
  for (const e of [...byKey.values()].sort((x, y) => x.loggedAt.localeCompare(y.loggedAt))) {
    if (e.deleted) { out.push(e); continue }
    const dup = active.get(e.idemKey)
    if (dup) continue
    active.set(e.idemKey, e)
    out.push(e)
  }
  return out
}

function mergePlan(local: PlannedMeal[], remote: PlannedMeal[]): PlannedMeal[] {
  const key = (p: PlannedMeal) => `${p.date}:${p.slot}`
  const map = new Map<string, PlannedMeal>()
  for (const p of remote) map.set(key(p), p)
  for (const p of local) {
    const r = map.get(key(p))
    // ארוחה שדווחה גוברת על ארוחה שרק תוכננה
    if (!r || p.status !== 'planned' || r.status === 'planned') map.set(key(p), p)
  }
  return [...map.values()].sort((a, b) => key(a).localeCompare(key(b)))
}

/** local הוא המצב שהמשתמש ערך עכשיו; remote הוא מה שבחשבון */
export function mergeStates(local: AppState, remote: AppState): AppState {
  const goals = [...remote.goals, ...local.goals].filter((g, i, arr) => arr.findIndex((x) => x.setAt === g.setAt && x.kcal === g.kcal) === i)
  const weights = [...remote.weights.filter((w) => !local.weights.some((l) => l.date === w.date)), ...local.weights]
  return {
    ...remote,
    ...local,
    goals,
    weights,
    log: mergeLogs(remote.log, local.log),
    plan: mergePlan(local.plan, remote.plan),
    customRecipes: [...remote.customRecipes.filter((r) => !local.customRecipes.some((l) => l.id === r.id)), ...local.customRecipes],
    ideas: [...new Set([...local.ideas, ...remote.ideas])].slice(0, 20),
    pantry: { ...remote.pantry, ...local.pantry },
    dayComplete: { ...remote.dayComplete, ...local.dayComplete },
    sent: [...remote.sent, ...local.sent].filter((s, i, arr) => arr.findIndex((x) => x.key === s.key) === i).slice(-60),
  }
}

/** בדיקת מבנה לקובץ ייבוא, כדי שקובץ שגוי לא ישבור את האפליקציה */
export function validateImport(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<AppState>
  if (s.schema !== 1 || !s.profile || !Array.isArray(s.goals) || !Array.isArray(s.log) || !Array.isArray(s.plan) || !Array.isArray(s.weights)) return null
  return s as AppState
}
