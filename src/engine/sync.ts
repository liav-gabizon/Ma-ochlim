import { LOVED_FOODS, LOVED_RECIPES } from '../data/recipes'
import type { AppState, FavoriteMark, LogEntry, MergeConflict, PlannedMeal, Pref, Recipe } from '../types'

// מיזוג בין מצב המכשיר למצב בחשבון. היומן מאוחד לפי מפתח ייחודי, כך שאותה ארוחה
// לא נרשמת פעמיים גם אם דווחה בשני מכשירים או נשלחה שוב אחרי ניתוק.

export function hasUserData(s: AppState | null | undefined): boolean {
  if (!s) return false
  const defaultLoved = new Set([...LOVED_FOODS, ...LOVED_RECIPES])
  const editedPrefs = Object.entries(s.prefs).some(([id, pref]) => pref !== (defaultLoved.has(id) ? 'love' : 'unknown'))
  return s.log.length > 0 || s.weights.length > 0 || s.customRecipes.length > 0 || s.ideas.length > 0 ||
    Object.keys(s.pantry).length > 0 || s.plan.some((p) => p.status !== 'planned') || s.goals.length > 1 ||
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
    map.set(key(p), picked)
  }
  return [...map.values()].sort((a, b) => key(a).localeCompare(key(b)))
}

/** local הוא המצב שהמשתמש ערך עכשיו; remote הוא מה שבחשבון */
/** המצב האחרון שהמכשיר ידע שנמצא בחשבון; משמש לזיהוי מי שינה מה */
export type MergeBase = {
  prefs: AppState['prefs']
  bought: AppState['shopping']['bought']
  alwaysGood?: string[]
  /** מפתחות ההתנגשויות (field:key) שהיו בחשבון בסנכרון האחרון; צד שהסיר רשומה כזו פתר את ההתנגשות */
  conflicts?: string[]
}

export function baseOf(s: AppState): MergeBase {
  return { prefs: { ...s.prefs }, bought: { ...s.shopping.bought }, alwaysGood: [...s.alwaysGood], conflicts: (s.mergeConflicts ?? []).map((c) => `${c.field}:${c.key}`) }
}

/**
 * מיזוג תלת־כיווני לערך יחיד: אם רק צד אחד שינה מאז הבסיס, השינוי שלו נשמר בלי התנגשות.
 * מחזיר null כשאין בסיס או כששני הצדדים שינו לערכים שונים.
 */
function threeWay<T>(l: T | undefined, r: T | undefined, base: Record<string, T> | undefined, key: string): T | undefined | null {
  if (l === r) return l
  if (!base) return null
  const b = base[key]
  if (l === b) return r
  if (r === b) return l
  return null
}

export function mergeStates(local: AppState, remote: AppState, base?: MergeBase): AppState {
  const goals = [...remote.goals, ...local.goals].filter((g, i, arr) => arr.findIndex((x) => x.setAt === g.setAt && x.kcal === g.kcal) === i)
  // סדר קבוע לפי תאריך: אחרת שני מכשירים עם אותה קבוצה בסדר שונה לעולם לא מתכנסים ודוחפים זה לזה בלי סוף
  const weights = [...remote.weights.filter((w) => !local.weights.some((l) => l.date === w.date)), ...local.weights].sort((a, b) => a.date.localeCompare(b.date))
  const prefs: AppState['prefs'] = {}
  const bought: AppState['shopping']['bought'] = {}
  const mergeConflicts: MergeConflict[] = []
  const prior = [...(remote.mergeConflicts ?? []), ...(local.mergeConflicts ?? [])]
  // אין חותמות זמן להעדפות/סימוני קנייה: שומרים כל ערך סותר ומבקשים בחירה.
  // עד הבחירה, dislike קודם כדי לא להציע מנה שנדחתה; קנייה סותרת אינה מסומנת כבוצעה.
  const preferenceOrder: Pref[] = ['dislike', 'unknown', 'try', 'love']
  const prefKeys = new Set([...Object.keys(remote.prefs), ...Object.keys(local.prefs), ...prior.filter((c) => c.field === 'prefs').map((c) => c.key)])
  const carries = (s: AppState, field: MergeConflict['field'], key: string) => (s.mergeConflicts ?? []).some((c) => c.field === field && c.key === key)
  // פתרון התנגשות: הבסיס ידע על ההתנגשות, ורק צד אחד עדיין נושא אותה — הצד שהסיר אותה בחר ערך, והבחירה שלו גוברת.
  // בלי בסיס (או כשהבסיס לא ידע עליה) אי אפשר להבדיל בין ״פתר״ ל״עוד לא ראה״, ולכן ההתנגשות נשמרת (יציב בניסיון חוזר).
  // הצד שפתר יכול גם להסיר את הערך לגמרי (למשל איפוס רשימת קניות); גם זו הכרעה, ולכן התוצאה עטופה ולא נבדקת מול undefined.
  const resolvedBy = <T,>(field: MergeConflict['field'], key: string, lv: T | undefined, rv: T | undefined): { value: T | undefined } | undefined => {
    const lHas = carries(local, field, key), rHas = carries(remote, field, key)
    if (lHas === rHas || !base?.conflicts?.includes(`${field}:${key}`)) return undefined
    return { value: lHas ? rv : lv }
  }
  for (const key of [...prefKeys].sort()) {
    const chosen = resolvedBy('prefs', key, local.prefs[key], remote.prefs[key])
    if (chosen) { if (chosen.value !== undefined) prefs[key] = chosen.value; continue }
    const alternatives = prior.flatMap((c) => c.field === 'prefs' && c.key === key ? c.values : [])
    const single = alternatives.length ? null : threeWay(local.prefs[key], remote.prefs[key], base?.prefs, key)
    if (single !== null) { if (single !== undefined) prefs[key] = single; continue }
    const candidates = new Set([...alternatives, remote.prefs[key], local.prefs[key]])
    const values = preferenceOrder.filter((v) => candidates.has(v))
    prefs[key] = values[0]
    if (values.length > 1) mergeConflicts.push({ field: 'prefs', key, values })
  }
  const boughtKeys = new Set([...Object.keys(remote.shopping.bought), ...Object.keys(local.shopping.bought), ...prior.filter((c) => c.field === 'shopping.bought').map((c) => c.key)])
  for (const key of [...boughtKeys].sort()) {
    const chosen = resolvedBy('shopping.bought', key, local.shopping.bought[key], remote.shopping.bought[key])
    if (chosen) { if (chosen.value !== undefined) bought[key] = chosen.value; continue }
    const alternatives = prior.flatMap((c) => c.field === 'shopping.bought' && c.key === key ? c.values : [])
    const single = alternatives.length ? null : threeWay(local.shopping.bought[key], remote.shopping.bought[key], base?.bought, key)
    if (single !== null) { if (single !== undefined) bought[key] = single; continue }
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
    // עם בסיס: מי ששינה מהבסיס גובר, כך שהסרה במכשיר אחד לא חוזרת מהשני. בלי בסיס: איחוד כמו קודם.
    alwaysGood: [...new Set([...local.alwaysGood, ...remote.alwaysGood, ...(base?.alwaysGood ?? [])])].filter((id) => {
      const l = local.alwaysGood.includes(id), r = remote.alwaysGood.includes(id)
      if (l === r || !base?.alwaysGood) return l || r
      return l !== base.alwaysGood.includes(id) ? l : r
    }).sort(),
    mergeConflicts,
    log: mergeLogs(remote.log, local.log),
    plan: mergePlan(local.plan, remote.plan),
    customRecipes: mergeRecipes(local.customRecipes, remote.customRecipes),
    favorites: mergeFavorites(local.favorites, remote.favorites),
    // הסדר מעוגן לחשבון (remote), ורעיונות חדשים מהמכשיר ראשונים (החדש ביותר ראשון); כך הסדר מתכנס בין מכשירים
    ideas: [...new Set([...local.ideas.filter((i) => !remote.ideas.includes(i)), ...remote.ideas])].slice(0, 20),
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

/**
 * בדיקת מבנה לקובץ ייבוא, כדי שקובץ שגוי לא ישבור את האפליקציה.
 * השדות המבניים (schema, profile עם זמני ארוחות ויעדים, goals, log, plan, weights) חייבים להיות תקינים;
 * שדות שחסרים בקבצים ישנים או חלקיים (העדפות, מזווה, קניות, התראות, רעיונות) מקבלים ברירת מחדל ריקה במקום לקרוס בהמשך.
 */
export function validateImport(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Partial<AppState>
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  if (s.schema !== 1 || !isObj(s.profile) || !Array.isArray(s.goals) || s.goals.length === 0 || !Array.isArray(s.log) || !Array.isArray(s.plan) || !Array.isArray(s.weights)) return null
  const p = s.profile as Partial<AppState['profile']>
  const slots = ['morning', 'outside', 'evening'] as const
  if (!isObj(p.mealTimes) || !isObj(p.slotTargets) || !slots.every((k) => typeof p.mealTimes![k] === 'string' && typeof p.slotTargets![k] === 'number')) return null
  if (!s.goals.every((g) => isObj(g) && typeof g.kcal === 'number' && typeof g.effectiveFrom === 'string')) return null
  if (!s.plan.every((m) => isObj(m) && typeof m.date === 'string' && slots.includes(m.slot as (typeof slots)[number]) && typeof m.recipeId === 'string' && typeof m.multiplier === 'number')) return null
  // רשומות שהמסכים קוראים מהן ישירות: מתכון אישי בלי רשימת רכיבים או רישום בלי פריטים היו מפילים את המסך אחרי הייבוא
  const customRecipes = s.customRecipes === undefined ? [] : s.customRecipes
  if (!Array.isArray(customRecipes) || !customRecipes.every((r) => isObj(r) && typeof r.id === 'string' && typeof r.name === 'string' && Array.isArray(r.items))) return null
  if (!s.log.every((e) => isObj(e) && typeof e.idemKey === 'string' && typeof e.loggedAt === 'string' && Array.isArray(e.items))) return null
  const notifications = { enabled: false, timesConfirmed: false, quietStart: '23:00', quietEnd: '07:30', dailyCap: 6, followUp: false, snoozeMinutes: 15, genericLockText: true, ...(isObj(s.notifications) ? s.notifications : {}) }
  const shopping: Record<string, unknown> = isObj(s.shopping) ? s.shopping : {}
  return {
    ...s,
    profile: { name: '', goal: 'gain', timezone: 'Asia/Jerusalem', allergies: 'unanswered', meatDairyWaitHours: null, tone: 'calm', motivationOn: true, personalLine: '', showWeightOnHome: false, heightCm: null, weightGoalKg: null, ...p } as AppState['profile'],
    prefs: isObj(s.prefs) ? s.prefs : {},
    rejections: isObj(s.rejections) ? s.rejections : {},
    alwaysGood: Array.isArray(s.alwaysGood) ? s.alwaysGood.filter((x) => typeof x === 'string') : [],
    customRecipes,
    dayComplete: isObj(s.dayComplete) ? s.dayComplete : {},
    pantry: isObj(s.pantry) ? s.pantry : {},
    shopping: { confirmed: Array.isArray(shopping.confirmed) ? shopping.confirmed : null, confirmedAt: typeof shopping.confirmedAt === 'string' ? shopping.confirmedAt : null, bought: isObj(shopping.bought) ? shopping.bought : {} } as AppState['shopping'],
    notifications: notifications as AppState['notifications'],
    sent: Array.isArray(s.sent) ? s.sent : [],
    snoozed: isObj(s.snoozed) ? s.snoozed : {},
    ideas: Array.isArray(s.ideas) ? s.ideas.filter((x) => typeof x === 'string') : [],
  } as AppState
}
