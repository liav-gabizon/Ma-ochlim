import { useCallback, useEffect, useState } from 'react'
import { LOVED_FOODS, LOVED_RECIPES, RECIPES } from './data/recipes'
import { localDate } from './engine/dates'
import { calcRecipe } from './engine/nutrition'
import type { DraftLine } from './engine/parse'
import { generateWeek } from './engine/plan'
import { replacePlannedState } from './engine/meal'
import { previewPlan } from './engine/bookPlan'
import { resolveMergeConflict } from './engine/sync'
import type { RankContext } from './engine/swaps'
import type { AppState, GoalVersion, LogEntry, LogItemSnapshot, PlannedMeal, Pref, Profile, Recipe, SlotId } from './types'

const KEY = 'ma-ochlim:v1'
export const TZ_DEFAULT = 'Asia/Jerusalem'

export function defaultProfile(): Profile {
  return {
    name: 'ליאב',
    goal: 'gain',
    timezone: TZ_DEFAULT,
    slotTargets: { morning: 700, outside: 1000, evening: 800 },
    mealTimes: { morning: '09:00', outside: '14:00', evening: '20:00' },
    allergies: 'unanswered',
    meatDairyWaitHours: null,
    tone: 'calm',
    motivationOn: true,
    personalLine: 'אני רוצה שגרת אכילה שאוכל להתמיד בה',
    showWeightOnHome: false,
    heightCm: null,
    weightGoalKg: null,
  }
}

export function initialState(now = new Date()): AppState {
  const profile = defaultProfile()
  const today = localDate(now, profile.timezone)
  const prefs: Record<string, Pref> = {}
  for (const id of LOVED_FOODS) prefs[id] = 'love'
  for (const id of LOVED_RECIPES) prefs[id] = 'love'
  const s: AppState = {
    schema: 1,
    profile,
    goals: [{ kcal: 2500, effectiveFrom: today, setAt: now.toISOString() }],
    prefs,
    rejections: {},
    alwaysGood: [],
    customRecipes: [],
    plan: [],
    log: [],
    dayComplete: {},
    pantry: {},
    shopping: { confirmed: null, confirmedAt: null, bought: {} },
    weights: [],
    notifications: {
      enabled: false,
      timesConfirmed: false,
      quietStart: '23:00',
      quietEnd: '07:30',
      dailyCap: 6,
      followUp: false,
      snoozeMinutes: 15,
      genericLockText: true,
    },
    sent: [],
    snoozed: {},
    ideas: [],
  }
  s.plan = generateWeek(today, allRecipes(s), rankCtx(s))
  return s
}

export function allRecipes(s: AppState): Recipe[] {
  return [...RECIPES, ...s.customRecipes]
}
export function rankCtx(s: AppState): RankContext {
  return { profile: s.profile, prefs: s.prefs, rejections: s.rejections }
}

/** היעד בתוקף בתאריך נתון; שינוי יעד לא משכתב היסטוריה */
export function goalFor(goals: GoalVersion[], date: string): number {
  const valid = goals.filter((g) => g.effectiveFrom <= date).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.setAt.localeCompare(b.setAt))
  return (valid.at(-1) ?? goals[0]).kcal
}

export function entryKcal(e: LogEntry): { kcal: number; complete: boolean; protein: number | null } {
  let kcal = 0
  let complete = true
  let protein: number | null = 0
  for (const it of e.items) {
    if (it.kcal == null) complete = false
    else kcal += it.kcal * e.portion
    if (it.protein == null) protein = null
    else if (protein != null) protein += it.protein * e.portion
  }
  return { kcal, complete, protein }
}

export function dayTotals(s: AppState, date: string) {
  const entries = s.log.filter((e) => !e.deleted && e.localDate === date)
  let kcal = 0
  let complete = true
  for (const e of entries) {
    const t = entryKcal(e)
    kcal += t.kcal
    if (!t.complete) complete = false
  }
  return { kcal, complete, count: entries.length, entries }
}

function load(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as AppState
    return s.schema === 1 ? s : null
  } catch {
    return null
  }
}

function save(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
export const newIdemKey = uid

function snapshotRecipe(r: Recipe, multiplier: number, skipOptional: string[] = []): LogItemSnapshot[] {
  return calcRecipe(r, multiplier, skipOptional).items.map((c) => ({
    name: c.name,
    grams: Math.round(c.grams),
    kcal: c.kcal,
    protein: c.protein,
    source: r.kind === 'outside' ? 'estimate' : c.source,
  }))
}

export function snapshotDraft(lines: DraftLine[]): LogItemSnapshot[] {
  return lines.map((l) => ({ name: l.name, grams: l.grams, kcal: l.kcal, protein: l.protein, source: l.source }))
}

export function useAppState() {
  const [state, setState] = useState<AppState>(() => load() ?? initialState())
  const [saveOk, setSaveOk] = useState(true)
  useEffect(() => {
    setSaveOk(save(state))
  }, [state])

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), [])

  const now = () => new Date()
  const today = () => localDate(now(), state.profile.timezone)

  const actions = {
    /** כתיבה ליומן. מפתח ייחודי מונע כפילות בלחיצה כפולה או שליחה חוזרת (AC11). */
    logEntry(p: { idemKey: string; title: string; items: LogItemSnapshot[]; slot?: SlotId; mode?: 'replace' | 'add'; portion?: number; eatenAt?: Date }) {
      update((s) => {
        if (s.log.some((e) => e.idemKey === p.idemKey)) return s
        const at = p.eatenAt ?? now()
        const date = localDate(at, s.profile.timezone)
        const entry: LogEntry = {
          id: uid(), idemKey: p.idemKey, localDate: date, timezone: s.profile.timezone,
          eatenAt: at.toISOString(), loggedAt: now().toISOString(), title: p.title, slot: p.slot,
          items: p.items, portion: p.portion ?? 1, version: 1,
        }
        let plan = s.plan
        if (p.slot && p.mode === 'replace') {
          // החלפה: הארוחה המתוכננת מסומנת ״הוחלפה״ ולא נספרת פעמיים (AC13)
          plan = plan.map((m) => (m.date === date && m.slot === p.slot ? { ...m, status: 'swapped', logId: entry.id } : m))
        }
        return { ...s, log: [...s.log, entry], plan }
      })
    },
    eatPlanned(meal: PlannedMeal, portion = 1) {
      const r = allRecipes(state).find((x) => x.id === meal.recipeId)
      if (!r) return
      const idemKey = `plan:${meal.date}:${meal.slot}:${meal.recipeId}:${meal.multiplier}`
      update((s) => {
        if (s.log.some((e) => e.idemKey === idemKey && !e.deleted)) return s
        const entry: LogEntry = {
          id: uid(), idemKey, localDate: meal.date, timezone: s.profile.timezone,
          eatenAt: now().toISOString(), loggedAt: now().toISOString(), title: r.name, slot: meal.slot,
          items: snapshotRecipe(r, meal.multiplier), portion, version: 1,
        }
        return {
          ...s,
          log: [...s.log, entry],
          plan: s.plan.map((m) => (m.date === meal.date && m.slot === meal.slot ? { ...m, status: portion < 1 ? 'partial' : 'eaten', logId: entry.id } : m)),
        }
      })
    },
    updatePortion(id: string, portion: number) {
      update((s) => ({
        ...s,
        log: s.log.map((e) => (e.id === id ? { ...e, portion, version: e.version + 1 } : e)),
        plan: s.plan.map((m) => (m.logId === id && (m.status === 'eaten' || m.status === 'partial') ? { ...m, status: portion < 1 ? 'partial' : 'eaten' } : m)),
      }))
    },
    deleteLog(id: string) {
      update((s) => ({
        ...s,
        // מחיקה רכה: השורה נשמרת עם סימון, כדי שתיקון לא ייעלם בשקט
        log: s.log.map((e) => (e.id === id ? { ...e, deleted: true, version: e.version + 1, idemKey: e.idemKey + ':deleted:' + e.version } : e)),
        plan: s.plan.map((m) => (m.logId === id ? { ...m, status: 'planned', logId: undefined } : m)),
      }))
    },
    setSlotStatus(date: string, slot: SlotId, status: PlannedMeal['status']) {
      update((s) => ({ ...s, plan: s.plan.map((m) => (m.date === date && m.slot === slot ? { ...m, status } : m)) }))
    },
    replacePlanned(date: string, slot: SlotId, recipeId: string, multiplier: number, rejectOld = true) {
      update((s) => replacePlannedState(s, date, slot, recipeId, multiplier, rejectOld))
    },
    regenerateWeek(start: string) {
      update((s) => {
        const keep = s.plan.filter((p) => p.date >= start)
        const week = generateWeek(start, allRecipes(s), rankCtx(s), keep)
        const others = s.plan.filter((p) => p.date < start || p.date > week.at(-1)!.date)
        return { ...s, plan: [...others, ...week] }
      })
    },
    ensureWeek(start: string) {
      update((s) => {
        const have = new Set(s.plan.map((p) => p.date + p.slot))
        const week = generateWeek(start, allRecipes(s), rankCtx(s), s.plan.filter((p) => p.date >= start))
        const add = week.filter((p) => !have.has(p.date + p.slot))
        return add.length ? { ...s, plan: [...s.plan, ...add] } : s
      })
    },
    setDayComplete(date: string, v: boolean) {
      update((s) => ({ ...s, dayComplete: { ...s.dayComplete, [date]: v } }))
    },
    setGoal(kcal: number, effectiveFrom: string) {
      update((s) => ({ ...s, goals: [...s.goals, { kcal, effectiveFrom, setAt: now().toISOString() }] }))
    },
    setProfile(p: Partial<Profile>) {
      update((s) => ({ ...s, profile: { ...s.profile, ...p } }))
    },
    setPref(id: string, pref: Pref) {
      update((s) => resolveMergeConflict(s, 'prefs', id, pref))
    },
    /** ״שמור למועדפים״: סימון מפורש, לא משנה את העדפת הטעם */
    setFavorite(id: string, on: boolean) {
      update((s) => ({ ...s, favorites: { ...(s.favorites ?? {}), [id]: { on, at: now().toISOString() } } }))
    },
    toggleAlwaysGood(id: string) {
      update((s) => {
        const has = s.alwaysGood.includes(id)
        if (!has && s.alwaysGood.length >= 3) return s
        return { ...s, alwaysGood: has ? s.alwaysGood.filter((x) => x !== id) : [...s.alwaysGood, id] }
      })
    },
    setPantry(foodIds: string[], v: boolean) {
      update((s) => {
        const pantry = { ...s.pantry }
        for (const id of foodIds) pantry[id] = v
        return { ...s, pantry }
      })
    },
    confirmShopping(lines: AppState['shopping']['confirmed']) {
      update((s) => ({ ...s, shopping: { ...s.shopping, confirmed: lines, confirmedAt: now().toISOString() } }))
    },
    markBought(foodId: string, v: boolean) {
      update((s) => ({
        ...resolveMergeConflict(s, 'shopping.bought', foodId, v),
        pantry: { ...s.pantry, [foodId]: v ? true : s.pantry[foodId] },
      }))
    },
    resolveMergeConflict(field: 'prefs' | 'shopping.bought', key: string, value: Pref | boolean) {
      update((s) => resolveMergeConflict(s, field, key, value))
    },
    resetShopping() {
      update((s) => ({ ...s, shopping: { confirmed: null, confirmedAt: null, bought: {} }, mergeConflicts: (s.mergeConflicts ?? []).filter((c) => c.field !== 'shopping.bought') }))
    },
    addWeight(date: string, kg: number) {
      update((s) => ({ ...s, weights: [...s.weights.filter((w) => w.date !== date), { id: uid(), date, kg }] }))
    },
    deleteWeight(id: string) {
      update((s) => ({ ...s, weights: s.weights.filter((w) => w.id !== id) }))
    },
    setNotifications(n: Partial<AppState['notifications']>) {
      update((s) => ({ ...s, notifications: { ...s.notifications, ...n } }))
    },
    markSent(key: string) {
      update((s) => ({ ...s, sent: [...s.sent.slice(-60), { key, at: now().toISOString() }] }))
    },
    snooze(slotKey: string, untilIso: string) {
      update((s) => ({ ...s, snoozed: { ...s.snoozed, [slotKey]: untilIso } }))
    },
    addIdea(text: string) {
      update((s) => ({ ...s, ideas: [text, ...s.ideas.filter((i) => i !== text)].slice(0, 20) }))
    },
    removeIdea(text: string) {
      update((s) => ({ ...s, ideas: s.ideas.filter((i) => i !== text) }))
    },
    /** מתכון מספר המתכונים: לא משנה העדפות, ומקבל חותמת עדכון למיזוג בין מכשירים */
    saveBookRecipe(r: Recipe) {
      const stamped: Recipe = { ...r, origin: 'book', custom: true, updatedAt: now().toISOString() }
      update((s) => ({ ...s, customRecipes: [...s.customRecipes.filter((x) => x.id !== r.id), stamped] }))
    },
    /** הסרה מהספר: מסומן archived ולא נמחק, כדי שיומן ותכנון קיימים לא יישברו ושמיזוג לא יחזיר אותו */
    archiveRecipe(id: string) {
      update((s) => ({ ...s, customRecipes: s.customRecipes.map((x) => (x.id === id ? { ...x, archived: true, updatedAt: now().toISOString() } : x)) }))
    },
    /** שיבוץ + עדכון רשימת הקניות בפעולה אחת; מחושב מחדש על המצב העדכני ברגע האישור */
    planFromBook(date: string, slot: SlotId, recipeId: string, cookServings: number) {
      update((s) => previewPlan(s, allRecipes(s), date, slot, recipeId, cookServings).next)
    },
    saveCustomRecipe(r: Recipe) {
      update((s) => ({ ...s, customRecipes: [...s.customRecipes.filter((x) => x.id !== r.id), r], prefs: { ...s.prefs, [r.id]: 'love' } }))
    },
    importState(next: AppState) {
      update(() => next)
    },
    deleteAll() {
      try {
        localStorage.removeItem(KEY)
      } catch {
        /* אין גישה לאחסון */
      }
      update(() => initialState())
    },
  }

  return { state, actions, saveOk, today }
}

export type Actions = ReturnType<typeof useAppState>['actions']
