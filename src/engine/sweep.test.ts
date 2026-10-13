// סבב התיקונים 13.10.2026: אילוצים אחרי שינוי פרופיל, טקסט חופשי מול אילוצים, יעדי משבצות לפי היעד היומי.
import { describe, expect, it } from 'vitest'
import { FOOD_BY_ID } from '../data/foods'
import { RECIPES } from '../data/recipes'
import { defaultProfile, initialState, rankCtx, setProfileState } from '../store'
import type { AppState, PlannedMeal, Profile, Recipe, SlotId } from '../types'
import { checkDraft, checkRecipe } from './constraints'
import { addDays } from './dates'
import { calcRecipe, kosherOf } from './nutrition'
import { parseFood } from './parse'
import { enforceConstraints, generateDay, generateWeek, planViolations } from './plan'
import { diffShopping, generateShopping } from './shopping'
import type { RankContext } from './swaps'
import { dailyGoal, slotTargets } from './targets'

const NOW = new Date('2026-10-04T08:00:00Z')
const TODAY = '2026-10-04'
const byId = (id: string) => RECIPES.find((r) => r.id === id)!
const meal = (date: string, slot: SlotId, recipeId: string, status: PlannedMeal['status'] = 'planned'): PlannedMeal => ({ date, slot, recipeId, multiplier: 1, status })
/** מצב התחלתי עם ארוחות שנקבעו במשבצות מסוימות */
function stateWith(meals: PlannedMeal[], profile: Partial<Profile> = {}): AppState {
  const s = initialState(NOW)
  const plan = s.plan.map((p) => meals.find((m) => m.date === p.date && m.slot === p.slot) ?? p)
  return { ...s, profile: { ...s.profile, allergies: 'none', ...profile }, plan }
}
const plannedFrom = (s: AppState, from: string) => s.plan.filter((p) => p.date >= from && p.status === 'planned')
const hasAllergen = (recipeId: string, a: string) => byId(recipeId).items.some((i) => (FOOD_BY_ID[i.foodId]?.allergens ?? []).includes(a as never))

describe('שינוי אילוצים מתכנן מחדש ארוחות מתוכננות שמפרות אותם', () => {
  it('אלרגיה שנוספה: ארוחה מתוכננת שמכילה את האלרגן מוחלפת, ואף ארוחה מתוכננת לא נשארת מפרה', () => {
    const s = stateWith([meal(TODAY, 'morning', 'toast_eggs'), meal(addDays(TODAY, 2), 'evening', 'rice_schnitzel')])
    const next = setProfileState(s, { allergies: ['egg'] }, TODAY)
    const morning = next.plan.find((p) => p.date === TODAY && p.slot === 'morning')!
    expect(morning.recipeId).not.toBe('toast_eggs')
    expect(morning.status).toBe('planned')
    for (const p of plannedFrom(next, TODAY)) {
      expect(hasAllergen(p.recipeId, 'egg'), `${p.date} ${p.slot} ${p.recipeId}`).toBe(false)
      expect(checkRecipe(byId(p.recipeId), next.profile).ok, `${p.date} ${p.slot} ${p.recipeId}`).toBe(true)
    }
    // יש חלופות במאגר, ולכן אף משבצת לא התרוקנה
    expect(next.plan).toHaveLength(s.plan.length)
  })

  it('ארוחות שדווחו נשארות כמו שהן, גם כשהן מכילות את האלרגן; ארוחות שלא מפרות לא זזות', () => {
    const eaten = { ...meal(TODAY, 'morning', 'toast_eggs', 'eaten'), logId: 'log-1' }
    const skipped = meal(TODAY, 'outside', 'out_sabich', 'skipped')
    const partial = meal(addDays(TODAY, 1), 'morning', 'egg_sandwich', 'partial')
    const swapped = meal(addDays(TODAY, 1), 'evening', 'rice_schnitzel', 'swapped')
    const s = stateWith([eaten, skipped, partial, swapped, meal(addDays(TODAY, 3), 'morning', 'egg_sandwich')])
    const next = setProfileState(s, { allergies: ['egg'] }, TODAY)
    for (const kept of [eaten, skipped, partial, swapped]) expect(next.plan.find((p) => p.date === kept.date && p.slot === kept.slot)).toEqual(kept)
    for (const p of s.plan) {
      if (p.status !== 'planned' || hasAllergen(p.recipeId, 'egg')) continue
      expect(next.plan.find((x) => x.date === p.date && x.slot === p.slot), `${p.date} ${p.slot}`).toEqual(p)
    }
    expect(next.plan.find((p) => p.date === addDays(TODAY, 3) && p.slot === 'morning')!.recipeId).not.toBe('egg_sandwich')
    expect(next.log).toBe(s.log)
  })

  it('החלפה בגלל אילוץ אינה ״לא בא לי״: לא נספרת כדחייה של המנה', () => {
    const s = stateWith([meal(TODAY, 'morning', 'toast_eggs')])
    const next = setProfileState(s, { allergies: ['egg'] }, TODAY)
    expect(next.rejections).toEqual(s.rejections)
  })

  it('כשאין חלופה שעומדת באילוצים, הארוחה המפרה מוסרת ולא נשארת בשקט', () => {
    const only: Recipe[] = [byId('toast_eggs'), byId('egg_sandwich')]
    const ctx: RankContext = { profile: { ...defaultProfile(), allergies: ['egg'] }, prefs: {}, rejections: {} }
    const plan = [meal(TODAY, 'morning', 'toast_eggs'), meal(TODAY, 'evening', 'egg_sandwich', 'eaten')]
    const res = enforceConstraints(plan, only, ctx, TODAY)
    expect(res.plan).toEqual([plan[1]])
    expect(res.changes).toEqual([{ date: TODAY, slot: 'morning', from: 'toast_eggs', to: null, reasons: ['מכיל ביצים'] }])
  })

  it('הפרדת בשר וחלב שהוגדרה אחרי התכנון: ארוחה חלבית מתוכננת בתוך זמן ההמתנה מוחלפת', () => {
    const s = stateWith([meal(TODAY, 'outside', 'out_shawarma_lafa'), meal(TODAY, 'evening', 'pasta_tomato')])
    expect(kosherOf(byId('out_shawarma_lafa').items)).toBe('meat')
    expect(kosherOf(byId('pasta_tomato').items)).toBe('dairy')
    const next = setProfileState(s, { meatDairyWaitHours: 7 }, TODAY)
    // 14:00 בשרי, 20:00 חלבי, המתנה 7 שעות
    expect(next.plan.find((p) => p.date === TODAY && p.slot === 'outside')!.recipeId).toBe('out_shawarma_lafa')
    const evening = next.plan.find((p) => p.date === TODAY && p.slot === 'evening')!
    expect(evening.recipeId).not.toBe('pasta_tomato')
    expect(kosherOf(byId(evening.recipeId).items)).not.toBe('dairy')
    for (const d of Array.from({ length: 7 }, (_, i) => addDays(TODAY, i))) {
      const day = next.plan.filter((p) => p.date === d)
      for (const p of day) expect(planViolations(p, day, RECIPES, rankCtx(next)), `${d} ${p.slot}`).toEqual([])
    }
  })

  it('בשרי שכבר נאכל נשאר, והחלבי המתוכנן אחריו מוחלף; חלבי שכבר נאכל נשאר, והבשרי המתוכנן לפניו מוחלף', () => {
    const eatenMeat = meal(TODAY, 'outside', 'out_shawarma_lafa', 'eaten')
    const a = setProfileState(stateWith([eatenMeat, meal(TODAY, 'evening', 'pasta_tomato')]), { meatDairyWaitHours: 7 }, TODAY)
    expect(a.plan.find((p) => p.date === TODAY && p.slot === 'outside')).toEqual(eatenMeat)
    expect(kosherOf(byId(a.plan.find((p) => p.date === TODAY && p.slot === 'evening')!.recipeId).items)).not.toBe('dairy')

    const eatenDairy = meal(TODAY, 'evening', 'pasta_tomato', 'eaten')
    const b = setProfileState(stateWith([meal(TODAY, 'outside', 'out_shawarma_lafa'), eatenDairy]), { meatDairyWaitHours: 7 }, TODAY)
    expect(b.plan.find((p) => p.date === TODAY && p.slot === 'evening')).toEqual(eatenDairy)
    expect(kosherOf(byId(b.plan.find((p) => p.date === TODAY && p.slot === 'outside')!.recipeId).items)).not.toBe('meat')
  })

  it('ארוחה שדולגה או הוחלפה לא נאכלה, ולכן לא יוצרת זמן המתנה', () => {
    const s = stateWith([meal(TODAY, 'outside', 'out_shawarma_lafa', 'skipped'), meal(TODAY, 'evening', 'pasta_tomato')])
    const next = setProfileState(s, { meatDairyWaitHours: 7 }, TODAY)
    expect(next.plan.find((p) => p.date === TODAY && p.slot === 'evening')!.recipeId).toBe('pasta_tomato')
  })

  it('שינוי שעת ארוחה שמכניס ארוחה חלבית לזמן ההמתנה מחליף אותה', () => {
    const s = stateWith([meal(TODAY, 'outside', 'out_shawarma_lafa'), meal(TODAY, 'evening', 'pasta_tomato')], { meatDairyWaitHours: 5 })
    expect(enforceConstraints(s.plan, RECIPES, rankCtx(s), TODAY).changes.filter((c) => c.date === TODAY)).toEqual([])
    const next = setProfileState(s, { mealTimes: { ...s.profile.mealTimes, evening: '18:00' } }, TODAY)
    expect(kosherOf(byId(next.plan.find((p) => p.date === TODAY && p.slot === 'evening')!.recipeId).items)).not.toBe('dairy')
  })

  it('תכנון מחדש מתחשב בבשרי שכבר נאכל באותו יום', () => {
    const base = initialState(NOW)
    const keep = Array.from({ length: 7 }, (_, i) => meal(addDays(TODAY, i), 'outside', 'out_shawarma_lafa', 'eaten'))
    const ctx: RankContext = { profile: { ...base.profile, allergies: 'none', meatDairyWaitHours: 7 }, prefs: base.prefs, rejections: {} }
    const week = generateWeek(TODAY, RECIPES, ctx, keep)
    for (const k of keep) expect(week.find((p) => p.date === k.date && p.slot === 'outside')).toEqual(k)
    for (const p of week.filter((x) => x.slot === 'evening')) expect(kosherOf(byId(p.recipeId).items), p.date).not.toBe('dairy')
  })

  it('שינוי בפרופיל שאינו אילוץ לא נוגע בתכנון', () => {
    const s = stateWith([meal(TODAY, 'morning', 'toast_eggs')], { allergies: ['egg'] })
    const next = setProfileState(s, { tone: 'practical' }, TODAY)
    expect(next.plan).toBe(s.plan)
  })

  it('רשימת הקניות שנגזרת מהתכנון מתעדכנת: המצרך האלרגני יוצא, ורשימה מאושרת מקבלת הפרש לאישור', () => {
    const s = stateWith([meal(TODAY, 'morning', 'toast_eggs'), meal(addDays(TODAY, 1), 'morning', 'egg_sandwich')])
    const before = generateShopping(s.plan, RECIPES, s.pantry).toBuy
    expect(before.some((l) => l.foodId === 'egg')).toBe(true)
    const next = setProfileState({ ...s, shopping: { ...s.shopping, confirmed: before, confirmedAt: NOW.toISOString() } }, { allergies: ['egg'] }, TODAY)
    const after = generateShopping(next.plan, RECIPES, next.pantry).toBuy
    for (const l of after) expect(FOOD_BY_ID[l.foodId].allergens, l.foodId).not.toContain('egg')
    expect(diffShopping(next.shopping.confirmed!, after).removed.some((l) => l.foodId === 'egg')).toBe(true)
  })
})

describe('טקסט חופשי נבדק מול האילוצים', () => {
  const profile = (p: Partial<Profile>): Profile => ({ ...defaultProfile(), ...p })

  it('מאכל מהמאגר שמכיל אלרגן מסומן באותו נוסח של המסלול המובנה', () => {
    const d = parseFood('אכלתי שלושה משולשים וקולה', RECIPES)
    const c = checkDraft(d.lines, profile({ allergies: ['milk'] }))
    expect(c.ok).toBe(false)
    expect(c.reasons).toEqual(['מכיל חלב'])
  })

  it('מנה מורכבת: אותן סיבות כמו בבדיקת המתכון עצמו', () => {
    const p = profile({ allergies: ['egg', 'sesame'] })
    const d = parseFood('בא לי סביח', RECIPES)
    expect(checkDraft(d.lines, p)).toEqual(checkRecipe(byId('out_sabich'), p))
    expect(checkDraft(d.lines, p).ok).toBe(false)
  })

  it('״בלי״ שמסיר את הרכיב האלרגני מסיר גם את האזהרה', () => {
    const p = profile({ allergies: ['sesame'] })
    expect(checkDraft(parseFood('אכלתי סביח', RECIPES).lines, p).ok).toBe(false)
    const without = parseFood('אכלתי סביח בלי טחינה', RECIPES)
    const stillSesame = without.lines.flatMap((l) => l.parts ?? []).some((i) => FOOD_BY_ID[i.foodId].allergens.includes('sesame'))
    expect(checkDraft(without.lines, p).ok).toBe(!stillSesame)
  })

  it('בשר וחלב באותה ארוחה בטקסט חופשי', () => {
    const d = parseFood('אכלתי פיתה שווארמה וטוסט גבינה', RECIPES)
    expect(d.lines).toHaveLength(2)
    expect(checkDraft(d.lines, profile({ allergies: 'none' })).reasons).toEqual(['בשר וחלב באותה ארוחה'])
  })

  it('בלי אלרגיות מוגדרות ובלי ערבוב: אין אזהרה', () => {
    const d = parseFood('אכלתי שלושה משולשים וקולה', RECIPES)
    expect(checkDraft(d.lines, profile({ allergies: 'none' }))).toEqual({ ok: true, reasons: [] })
    expect(checkDraft(d.lines, profile({ allergies: 'unanswered' }))).toEqual({ ok: true, reasons: [] })
    expect(checkDraft(d.lines, profile({ allergies: ['fish'] }))).toEqual({ ok: true, reasons: [] })
  })
})

describe('יעדי המשבצות נגזרים מהיעד היומי', () => {
  const p = defaultProfile()
  const dayTotal = (plan: PlannedMeal[], d: string) => plan.filter((x) => x.date === d).reduce((s, x) => s + calcRecipe(byId(x.recipeId), x.multiplier).kcal, 0)
  const mean = (plan: PlannedMeal[]) => Array.from({ length: 7 }, (_, i) => dayTotal(plan, addDays(TODAY, i))).reduce((a, b) => a + b, 0) / 7
  const ctxFor = (kcal: number | null): RankContext => {
    const s = initialState(NOW)
    return { profile: { ...s.profile, allergies: 'none' }, prefs: s.prefs, rejections: {}, goals: kcal == null ? [] : [{ kcal, effectiveFrom: TODAY, setAt: NOW.toISOString() }] }
  }

  it('ביעד ברירת המחדל החלוקה נשארת 700/1000/800', () => {
    expect(slotTargets(p, 2500)).toEqual({ morning: 700, outside: 1000, evening: 800 })
  })
  it('יעד אחר: אותה חלוקה יחסית', () => {
    expect(slotTargets(p, 3000)).toEqual({ morning: 840, outside: 1200, evening: 960 })
    expect(slotTargets(p, 2000)).toEqual({ morning: 560, outside: 800, evening: 640 })
    const t = slotTargets(p, 3200)
    expect(t.morning! + t.outside! + t.evening!).toBeCloseTo(3200, 6)
  })
  it('ערך חסר נשאר חסר ולא הופך לאפס', () => {
    expect(slotTargets(p, null)).toEqual({ morning: null, outside: null, evening: null })
    expect(slotTargets(p, Number.NaN)).toEqual({ morning: null, outside: null, evening: null })
    expect(slotTargets(p, 0)).toEqual({ morning: null, outside: null, evening: null })
    const broken = { ...p, slotTargets: { morning: 700, outside: undefined as unknown as number, evening: 800 } }
    expect(slotTargets(broken, 2500)).toEqual({ morning: null, outside: null, evening: null })
    expect(dailyGoal([], TODAY)).toBeNull()
    expect(dailyGoal(undefined, TODAY)).toBeNull()
  })
  it('היעד שבתוקף בתאריך קובע, ושינוי יעד לא משנה ימים קודמים', () => {
    const goals = [{ kcal: 2500, effectiveFrom: TODAY, setAt: '2026-10-04T08:00:00Z' }, { kcal: 3200, effectiveFrom: addDays(TODAY, 3), setAt: '2026-10-04T09:00:00Z' }]
    expect(dailyGoal(goals, addDays(TODAY, 2))).toBe(2500)
    expect(dailyGoal(goals, addDays(TODAY, 3))).toBe(3200)
  })
  it('תכנון ביעד 3,200: הסך היומי המתוכנן עולה ומתקרב ליעד החדש', () => {
    const base = generateWeek(TODAY, RECIPES, ctxFor(2500))
    const high = generateWeek(TODAY, RECIPES, ctxFor(3200))
    expect(mean(high)).toBeGreaterThan(mean(base) + 300)
    expect(Math.abs(mean(high) - 3200)).toBeLessThan(3200 * 0.2)
    for (let i = 0; i < 7; i++) expect(Math.abs(dayTotal(high, addDays(TODAY, i)) - 3200), addDays(TODAY, i)).toBeLessThan(Math.abs(dayTotal(base, addDays(TODAY, i)) - 3200))
  })
  it('תכנון ביעד 1,900: הסך היומי המתוכנן יורד ומתקרב ליעד החדש', () => {
    const base = generateWeek(TODAY, RECIPES, ctxFor(2500))
    const low = generateWeek(TODAY, RECIPES, ctxFor(1900))
    expect(mean(low)).toBeLessThan(mean(base) - 300)
    expect(Math.abs(mean(low) - 1900)).toBeLessThan(1900 * 0.2)
  })
  it('יעד שנכנס לתוקף באמצע השבוע משפיע רק מאותו יום', () => {
    const c = ctxFor(2500)
    const mixed: RankContext = { ...c, goals: [...c.goals!, { kcal: 3200, effectiveFrom: addDays(TODAY, 3), setAt: '2026-10-04T09:00:00Z' }] }
    expect(generateDay(addDays(TODAY, 1), RECIPES, mixed)).toEqual(generateDay(addDays(TODAY, 1), RECIPES, c))
    expect(generateDay(addDays(TODAY, 4), RECIPES, mixed)).toEqual(generateDay(addDays(TODAY, 4), RECIPES, ctxFor(3200)))
    expect(generateDay(addDays(TODAY, 4), RECIPES, mixed)).not.toEqual(generateDay(addDays(TODAY, 4), RECIPES, c))
  })
  it('בלי יעד יומי ידוע: מתכננים מנה רגילה (×1) ולא מכוונים ליעד אפס', () => {
    const day = generateDay(TODAY, RECIPES, ctxFor(null))
    expect(day).toHaveLength(3)
    for (const m of day) expect(m.multiplier).toBe(1)
  })
  it('האפליקציה מעבירה את היעדים למנוע', () => {
    const s = initialState(NOW)
    expect(rankCtx(s).goals).toBe(s.goals)
  })
})
