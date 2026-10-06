import { describe, expect, it } from 'vitest'
import { RECIPES } from '../data/recipes'
import { initialState } from '../store'
import type { AppState, Recipe } from '../types'
import { previewPlan, suggestFromBook } from './bookPlan'
import { calcRecipe } from './nutrition'
import {
  bookNutrition, cleanLink, completeness, exactMinutes, fitsWithin, isFavorite, isPlannable, kosherLabel, parseRange, rangeText, recipeTimes, timeKnown,
} from './recipeBook'
import { generateShopping } from './shopping'
import { suggestSwaps } from './swaps'
import { hasUserData, mergeFavorites, mergeRecipes, mergeStates } from './sync'

const NOW = new Date('2026-10-05T08:00:00Z')
const TODAY = '2026-10-05'

const book = (p: Partial<Recipe> = {}): Recipe => ({
  id: 'book_pasta',
  name: 'פסטה ברוטב',
  kind: 'home',
  items: [{ foodId: 'pasta_dry', grams: 400 }, { foodId: 'tomato_sauce', grams: 680 }, { foodId: 'olive_oil', grams: 27 }],
  servings: 4,
  time: { active: { min: 10, max: 10 }, total: { min: 20, max: 25 } },
  totalMinutes: 0,
  activeMinutes: 10,
  effort: '15',
  slots: ['evening'],
  origin: 'book',
  custom: true,
  updatedAt: '2026-10-05T08:00:00.000Z',
  ...p,
})

const state = (p: Partial<AppState> = {}): AppState => ({ ...initialState(NOW), ...p })

describe('ספר מתכונים: 36 הפריטים הקיימים', () => {
  it('ארוחות קיימות נשארות מלאות ונכנסות לתכנון כמנה אחת', () => {
    for (const r of RECIPES) {
      expect(completeness(r)).toBe('full')
      expect(bookNutrition(r).perServing!.kcal).toBe(calcRecipe(r, 1).kcal)
    }
  })
})

describe('ספר מתכונים: שלמות ומידע חסר', () => {
  it('שם וקישור בלבד: unknown, בלי קלוריות ובלי כשרות', () => {
    const r = book({ items: [], servings: null, time: { active: null, total: null }, link: 'https://example.com/r' })
    expect(completeness(r)).toBe('unknown')
    const n = bookNutrition(r)
    expect(n.perServing).toBeNull()
    expect(n.whole).toBeNull()
    expect(kosherLabel(r)).toBe('התאמה לכשרות לא נבדקה')
    expect(isPlannable(r)).toBe(false)
  })
  it('רכיב שלא זוהה או מספר מנות לא ידוע: partial, לא מוצג אפס', () => {
    expect(completeness(book({ unresolved: ['זעתר'] }))).toBe('partial')
    expect(completeness(book({ servings: null }))).toBe('partial')
    expect(bookNutrition(book({ servings: null })).perServing).toBeNull()
  })
  it('מתכון מלא: קלוריות למנה = כל המתכון חלקי מספר המנות', () => {
    const r = book()
    const whole = calcRecipe({ ...r, origin: undefined }, 1).kcal!
    const n = bookNutrition(r)
    expect(n.status).toBe('full')
    expect(n.perServing!.kcal).toBeCloseTo(whole / 4, 0)
    expect(n.whole!.kcal).toBeCloseTo(whole, 0)
    expect(bookNutrition(r, 2).whole!.kcal).toBeCloseTo(whole / 2, 0)
  })
  it('מתכון שהוסר לא נכנס לתכנון', () => {
    expect(isPlannable(book({ archived: true }))).toBe(false)
  })
})

describe('ספר מתכונים: זמנים', () => {
  it('זמן עבודה וזמן כולל נשמרים בנפרד', () => {
    const t = recipeTimes(book())
    expect(t.active).toEqual({ min: 10, max: 10 })
    expect(t.total).toEqual({ min: 20, max: 25 })
    expect(rangeText(t.active)).toBe('10 דק׳')
    expect(rangeText(t.total)).toBe('20–25 דק׳')
  })
  it('זמן לא ידוע לא נכנס ל״עד 30 דקות״ ומוצג ״לא ידוע״', () => {
    const r = book({ time: { active: null, total: null } })
    expect(timeKnown(r)).toBe(false)
    expect(fitsWithin(r, 30)).toBe(false)
    expect(rangeText(recipeTimes(r).total)).toBe('לא ידוע')
  })
  it('״עד שעה״ ו״45 ומעלה״ לא נחשבים עד 30', () => {
    expect(fitsWithin(book({ time: { active: null, total: { min: null, max: 60 } } }), 30)).toBe(false)
    expect(fitsWithin(book({ time: { active: null, total: { min: 45, max: null } } }), 30)).toBe(false)
    expect(fitsWithin(book({ time: { active: null, total: { min: null, max: 30 } } }), 30)).toBe(true)
  })
  it('parseRange: ריק = null, הפוך מתוקן', () => {
    expect(parseRange('', '')).toBeNull()
    expect(parseRange('', '60')).toEqual({ min: null, max: 60 })
    expect(parseRange('40', '20')).toEqual({ min: 20, max: 40 })
  })
  it('cleanLink מקבל רק http/https', () => {
    expect(cleanLink('javascript:alert(1)')).toBeNull()
    expect(cleanLink('https://example.com/x')).toBe('https://example.com/x')
  })
})

describe('ספר מתכונים: החלפות, הצעה וקניות', () => {
  const s = state()
  const ctx = { profile: s.profile, prefs: {}, rejections: {} }
  it('מתכון חלקי או בלי רכיבים לא מופיע בהחלפות', () => {
    const partial = book({ id: 'p1', unresolved: ['משהו'] })
    const empty = book({ id: 'p2', items: [] })
    const full = book({ id: 'p3' })
    const target = bookNutrition(full).perServing!.kcal!
    const ids = suggestSwaps({ targetKcal: target, slot: 'evening', recipes: [partial, empty, full], ctx, tolerance: 0.5 }).map((o) => o.recipe.id)
    expect(ids).not.toContain('p1')
    expect(ids).not.toContain('p2')
    const any = suggestSwaps({ targetKcal: target, slot: 'evening', recipes: [partial, empty], ctx, tolerance: 0.5, anyKind: true })
    expect(any).toHaveLength(0)
  })
  it('הצעה מהספר: לא חלקי, לא ״לא לטעמי״, לא ארוך מ־30, ו״לא בא לי״ מדלג', () => {
    const a = book({ id: 'a', name: 'א' })
    const b = book({ id: 'b', name: 'ב' })
    const slow = book({ id: 'slow', time: { active: null, total: { min: 60, max: 60 } } })
    const partial = book({ id: 'part', servings: null })
    const c = { ...ctx, prefs: { a: 'dislike' as const }, alwaysGood: [] }
    expect(suggestFromBook([a, b, slow, partial], c, { slot: 'evening', maxMinutes: 30, skip: [] })?.id).toBe('b')
    expect(suggestFromBook([a, b, slow, partial], c, { slot: 'evening', maxMinutes: 30, skip: ['b'] })).toBeNull()
    expect(suggestFromBook([a, b, slow, partial], c, { slot: 'evening', maxMinutes: null, skip: ['b'] })?.id).toBe('slow')
  })
  it('מספר המנות לבישול משנה את כמויות הקניות; מתכון חלקי לא יוצר מצרכים', () => {
    const r = book()
    const plan = (cook: number, recipe = r) => [{ date: TODAY, slot: 'evening' as const, recipeId: recipe.id, multiplier: 1, status: 'planned' as const, cookServings: cook }]
    const g = (cook: number) => generateShopping(plan(cook) as AppState['plan'], [r], {}).toBuy.find((l) => l.foodId === 'pasta_dry')!.neededGrams
    expect(g(4)).toBe(400)
    expect(g(2)).toBe(200)
    const partial = book({ id: 'pp', servings: null })
    expect(generateShopping(plan(4, partial) as AppState['plan'], [partial], {}).toBuy).toHaveLength(0)
  })
})

describe('ספר מתכונים: שיבוץ + קניות כפעולה אחת', () => {
  it('תצוגה מקדימה לא משנה את המצב; אישור משנה תכנון ורשימה יחד ושומר ״נקנה״', () => {
    const r = book()
    const base = state({ customRecipes: [r] })
    const recipes = [...RECIPES, r]
    const confirmedList = generateShopping(base.plan, recipes, base.pantry).toBuy
    const s0: AppState = { ...base, shopping: { confirmed: confirmedList, confirmedAt: '2026-10-05T07:00:00.000Z', bought: { tomato_sauce: true, egg: true } } }
    const frozen = JSON.stringify(s0)
    const p = previewPlan(s0, recipes, TODAY, 'evening', r.id, 4)
    // ביטול = לא משתמשים ב־next. המצב המקורי לא השתנה
    expect(JSON.stringify(s0)).toBe(frozen)
    const slot = p.next.plan.find((m) => m.date === TODAY && m.slot === 'evening')!
    expect(slot.recipeId).toBe(r.id)
    expect(slot.cookServings).toBe(4)
    expect(p.updatesConfirmed).toBe(true)
    expect(p.next.shopping.confirmed!.some((l) => l.foodId === 'pasta_dry')).toBe(true)
    expect(p.next.shopping.bought).toEqual({ tomato_sauce: true, egg: true })
    // שאר הימים לא נגעו
    expect(p.next.plan.filter((m) => m.date !== TODAY)).toEqual(s0.plan.filter((m) => m.date !== TODAY))
  })
  it('בלי רשימה מאושרת: הרשימה נשארת לא מאושרת', () => {
    const r = book()
    const s0 = state({ customRecipes: [r] })
    const p = previewPlan(s0, [...RECIPES, r], TODAY, 'evening', r.id, 2)
    expect(p.updatesConfirmed).toBe(false)
    expect(p.next.shopping.confirmed).toBeNull()
  })
})

describe('ספר מתכונים: סנכרון בין מכשירים', () => {
  it('mergeRecipes: שני הצדדים נשמרים, הגרסה החדשה גוברת, הסרה לא חוזרת', () => {
    const oldR = book({ id: 'x', name: 'ישן', updatedAt: '2026-10-01T00:00:00.000Z' })
    const newR = book({ id: 'x', name: 'חדש', updatedAt: '2026-10-05T00:00:00.000Z' })
    const onlyLocal = book({ id: 'l' })
    const onlyRemote = book({ id: 'r' })
    const m = mergeRecipes([oldR, onlyLocal], [newR, onlyRemote])
    expect(m.map((r) => r.id).sort()).toEqual(['l', 'r', 'x'])
    expect(m.find((r) => r.id === 'x')!.name).toBe('חדש')
    const archived = book({ id: 'x', archived: true, updatedAt: '2026-10-06T00:00:00.000Z' })
    expect(mergeRecipes([newR], [archived]).find((r) => r.id === 'x')!.archived).toBe(true)
  })
  it('mergeStates: מתכונים ומועדפים משני המכשירים לא אובדים', () => {
    const r1 = book({ id: 'dev1' })
    const r2 = book({ id: 'dev2', link: 'https://example.com/a' })
    const local = state({ customRecipes: [r1], prefs: { dev1: 'love' } })
    const remote = state({ customRecipes: [r2], prefs: { dev2: 'dislike' } })
    const m = mergeStates(local, remote)
    expect(m.customRecipes.map((r) => r.id).sort()).toEqual(['dev1', 'dev2'])
    expect(m.customRecipes.find((r) => r.id === 'dev2')!.link).toBe('https://example.com/a')
    expect(m.prefs.dev1).toBe('love')
    expect(m.prefs.dev2).toBe('dislike')
  })
})

describe('מועדפים נפרדים מ״אוהב״', () => {
  it('״אוהב״ בברירת המחדל לא הופך פריט למועדף', () => {
    const s = state()
    const loved = Object.entries(s.prefs).filter(([, p]) => p === 'love').map(([id]) => id)
    expect(loved.length).toBeGreaterThan(0)
    for (const id of loved) expect(isFavorite(s, id)).toBe(false)
  })
  it('סימון מפורש בלבד הוא מועדף; on=false הוא הסרה', () => {
    const s = state({ favorites: { a: { on: true, at: '2026-10-06T00:00:00.000Z' }, b: { on: false, at: '2026-10-06T00:00:00.000Z' } } })
    expect(isFavorite(s, 'a')).toBe(true)
    expect(isFavorite(s, 'b')).toBe(false)
    expect(hasUserData(state({ favorites: { a: { on: true, at: 'x' } } }))).toBe(true)
  })
  it('mergeFavorites: הסימון האחרון גובר בשני הכיוונים, ופריט מצד אחד נשמר', () => {
    const m = mergeFavorites(
      { a: { on: false, at: '2026-10-06T10:00:00.000Z' }, b: { on: true, at: '2026-10-06T08:00:00.000Z' }, onlyLocal: { on: true, at: '2026-10-06T01:00:00.000Z' } },
      { a: { on: true, at: '2026-10-06T09:00:00.000Z' }, b: { on: false, at: '2026-10-06T09:00:00.000Z' }, onlyRemote: { on: true, at: '2026-10-06T01:00:00.000Z' } },
    )
    expect(m.a.on).toBe(false) // הוסר מאוחר יותר במכשיר הזה
    expect(m.b.on).toBe(false) // הוסר מאוחר יותר במכשיר השני
    expect(m.onlyLocal.on).toBe(true)
    expect(m.onlyRemote.on).toBe(true)
  })
  it('mergeStates שומר מועדפים והעדפות טעם בנפרד', () => {
    const local = state({ prefs: { ...state().prefs, x: 'love' }, favorites: { y: { on: true, at: '2026-10-06T00:00:00.000Z' } } })
    const remote = state({ prefs: { ...state().prefs, z: 'dislike' } })
    const m = mergeStates(local, remote)
    expect(m.prefs.x).toBe('love')
    expect(m.prefs.z).toBe('dislike')
    expect(isFavorite(m, 'y')).toBe(true)
    expect(isFavorite(m, 'x')).toBe(false)
  })
})

describe('זמן במתכון מ״+ אוכל״', () => {
  const legacy: Recipe = { id: 'custom_old', name: 'ישן', kind: 'home', items: [{ foodId: 'egg', grams: 100 }], effort: '15', totalMinutes: 15, activeMinutes: 10, slots: ['evening'], custom: true }
  it('מתכון ישן עם 15 דקות קבועות: הזמן לא ידוע ולא נכלל בעד 30', () => {
    expect(timeKnown(legacy)).toBe(false)
    expect(fitsWithin(legacy, 30)).toBe(false)
    expect(rangeText(recipeTimes(legacy).total)).toBe('לא ידוע')
  })
  it('זמן שהוזן נשמר; שדה ריק = לא ידוע', () => {
    expect(exactMinutes('')).toBeNull()
    const withTime: Recipe = { ...legacy, id: 'c2', totalMinutes: 20, activeMinutes: 0, time: { total: exactMinutes('20'), active: exactMinutes('') } }
    expect(fitsWithin(withTime, 30)).toBe(true)
    expect(rangeText(recipeTimes(withTime).active)).toBe('לא ידוע')
    const noTime: Recipe = { ...legacy, id: 'c3', totalMinutes: 0, activeMinutes: 0, time: { total: exactMinutes(''), active: exactMinutes('') } }
    expect(fitsWithin(noTime, 30)).toBe(false)
  })
  it('ארוחות מובנות שומרות את הזמן הקיים', () => {
    for (const r of RECIPES.filter((x) => x.kind === 'home')) expect(timeKnown(r)).toBe(true)
  })
})
