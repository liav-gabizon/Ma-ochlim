import { LOVED_FOODS, LOVED_RECIPES } from '../data/recipes'
import type { AppState, FavoriteMark, LogEntry, MergeConflict, PlannedMeal, Pref, Recipe } from '../types'

// מיזוג בין מצב המכשיר למצב בחשבון. היומן מאוחד לפי מפתח ייחודי, כך שאותה ארוחה
// לא נרשמת פעמיים גם אם דווחה בשני מכשירים או נשלחה שוב אחרי ניתוק.

export function hasUserData(s: AppState | null | undefined): boolean {
  if (!s) return false
  const defaultLoved = new Set([...LOVED_FOODS, ...LOVED_RECIPES])
  const editedPrefs = Object.entries(s.prefs).some(([id, pref]) => pref !== (defaultLoved.has(id) ? 'love' : 'unknown'))
  return s.log.length > 0 || s.weights.length > 0 || s.customRecipes.length > 0 || s.ideas.length > 0 ||
    Object.keys(s.pantry).length > 0 || s.plan.some((p) => p.status !== 'planned' || p.reminderCancelled) || s.goals.length > 1 ||
    editedPrefs || Object.keys(s.favorites ?? {}).length > 0 || s.alwaysGood.length > 0 || Object.keys(s.shopping.bought).length > 0 || !!s.mergeConflicts?.length
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
    const picked = !r || p.status !== 'planned' || r.status === 'planned' ? p : r
    map.set(key(p), p.reminderCancelled || r?.reminderCancelled ? { ...picked, reminderCancelled: true } : picked)
  }
  return [...map.values()].sort((a, b) => key(a).localeCompare(key(b)))
}

/** local הוא המצב שהמשתמש ערך עכשיו; remote הוא מה שבחשבון */
export function mergeStates(local: AppState, remote: AppState): AppState {
  const goals = [...remote.goals, ...local.goals].filter((g, i, arr) => arr.findIndex((x) => x.setAt === g.setAt && x.kcal === g.kcal) === i)
  const weights = [...remote.weights.filter((w) => !local.weights.some((l) => l.date === w.date)), ...local.weights]
  const prefs: AppState['prefs'] = {}
  const bought: AppState['shopping']['bought'] = {}
  const mergeConflicts: MergeConflict[] = []
  const prior = [...(remote.mergeConflicts ?? []), ...(local.mergeConflicts ?? [])]
  // אין חותמות זמן להעדפות/סימוני קנייה: שומרים כל ערך סותר ומבקשים בחירה.
  // עד הבחירה, dislike קודם כדי לא להציע מנה שנדחתה; קנייה סותרת אינה מסומנת כבוצעה.
  const preferenceOrder: Pref[] = ['dislike', 'unknown', 'try', 'love']
  const prefKeys = new Set([...Object.keys(remote.prefs), ...Object.keys(local.prefs), ...prior.filter((c) => c.field === 'prefs').map((c) => c.key)])
  for (const key of [...prefKeys].sort()) {
    const alternatives = prior.flatMap((c) => c.field === 'prefs' && c.key === key ? c.values : [])
    const candidates = new Set([...alternatives, remote.prefs[key], local.prefs[key]])
    const values = preferenceOrder.filter((v) => candidates.has(v))
    prefs[key] = values[0]
    if (values.length > 1) mergeConflicts.push({ field: 'prefs', key, values })
  }
  const boughtKeys = new Set([...Object.keys(remote.shopping.bought), ...Object.keys(local.shopping.bought), ...prior.filter((c) => c.field === 'shopping.bought').map((c) => c.key)])
  for (const key of [...boughtKeys].sort()) {
    const alternatives = prior.flatMap((c) => c.field === 'shopping.bought' && c.key === key ? c.values : [])
    const candidates = new Set([...alternatives, remote.shopping.bought[key], local.shopping.bought[key]])
    const values = [false, true].filter((v) => candidates.has(v))
    bought[key] = values[0]
    if (values.length > 1) mergeConflicts.push({ field: 'shopping.bought', key, values })
  }
  return {
    ...remote,
    ...local,
    goals,
    weights,
    prefs,
    shopping: { ...local.shopping, bought },
    alwaysGood: [...new Set([...local.alwaysGood, ...remote.alwaysGood])].sort(),
    mergeConflicts,
    log: mergeLogs(remote.log, local.log),
    plan: mergePlan(local.plan, remote.plan),
    customRecipes: mergeRecipes(local.customRecipes, remote.customRecipes),
    favorites: mergeFavorites(local.favorites, remote.favorites),
    ideas: [...new Set([...local.ideas, ...remote.ideas])].slice(0, 20),
    pantry: { ...remote.pantry, ...local.pantry },
    dayComplete: { ...remote.dayComplete, ...local.dayComplete },
    sent: [...remote.sent, ...local.sent].filter((s, i, arr) => arr.findIndex((x) => x.key === s.key) === i).slice(-60),
  }
}

/**
 * מתכונים אישיים: איחוד לפי מזהה, כך שמתכון שקיים רק בצד אחד לא נעלם.
 * כששני הצדדים ערכו את אותו מתכון, הגרסה עם updatedAt מאוחר יותר גוברת (כולל הסרה מהספר);
 * בלי חותמת בשני הצדדים נשמרת ההתנהגות הקודמת: המכשיר גובר.
 */
export function mergeRecipes(local: Recipe[], remote: Recipe[]): Recipe[] {
  const out = new Map<string, Recipe>()
  for (const r of remote) out.set(r.id, r)
  for (const l of local) {
    const r = out.get(l.id)
    if (!r || (l.updatedAt ?? '') >= (r.updatedAt ?? '')) out.set(l.id, l)
  }
  return [...out.values()]
}

/** מועדפים: לכל פריט נשמר הסימון האחרון לפי חותמת, כך שהוספה והסרה בשני מכשירים לא אובדות */
export function mergeFavorites(local: Record<string, FavoriteMark> | undefined, remote: Record<string, FavoriteMark> | undefined): Record<string, FavoriteMark> {
  const out: Record<string, FavoriteMark> = { ...(remote ?? {}) }
  for (const [id, l] of Object.entries(local ?? {})) {
    const r = out[id]
    if (!r || l.at >= r.at) out[id] = l
  }
  return out
}

/** בחירה מפורשת פותרת רק את ההתנגשות המתאימה; שאר החלופות נשמרות. */
export function resolveMergeConflict(s: AppState, field: 'prefs' | 'shopping.bought', key: string, value: Pref | boolean): AppState {
  if (field === 'prefs' && typeof value !== 'string' || field === 'shopping.bought' && typeof value !== 'boolean') return s
  return {
    ...s,
    ...(field === 'prefs' ? { prefs: { ...s.prefs, [key]: value as Pref } } : { shopping: { ...s.shopping, bought: { ...s.shopping.bought, [key]: value as boolean } } }),
    ...(field === 'shopping.bought' && value === true ? { pantry: { ...s.pantry, [key]: true } } : {}),
    mergeConflicts: (s.mergeConflicts ?? []).filter((c) => c.field !== field || c.key !== key),
  }
}

/** בדיקת מבנה לקובץ ייבוא, כדי שקובץ שגוי לא ישבור את האפליקציה */
export function validateImport(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<AppState>
  if (s.schema !== 1 || !s.profile || !Array.isArray(s.goals) || !Array.isArray(s.log) || !Array.isArray(s.plan) || !Array.isArray(s.weights)) return null
  return s as AppState
}
