import { describe, expect, it } from 'vitest'
import { FOODS } from '../data/foods'
import { RECIPES } from '../data/recipes'
import { defaultProfile, goalFor, initialState, entryKcal } from '../store'
import type { Profile, Recipe } from '../types'
import { checkRecipe } from './constraints'
import { addDays, localDate } from './dates'
import { calcItem, calcItems, calcRecipe, kosherOf } from './nutrition'
import { parseFood } from './parse'
import { generateDay, generateWeek } from './plan'
import { diffShopping, generateShopping } from './shopping'
import { suggestSwaps, type RankContext } from './swaps'
import { summarizeWeight } from './weight'
import { isSafeMessage, line } from './motivation'

const ctx = (p: Partial<Profile> = {}): RankContext => {
  const s = initialState(new Date('2026-10-04T08:00:00Z'))
  return { profile: { ...s.profile, ...p }, prefs: s.prefs, rejections: {} }
}

describe('מאגר', () => {
  it('כל רשומה עם שם, מקור, יחידה הגיונית', () => {
    for (const f of FOODS) {
      expect(f.name.length).toBeGreaterThan(1)
      if (f.kcal100 != null) expect(f.kcal100).toBeGreaterThanOrEqual(0)
      if (f.kcal100 != null) expect(f.kcal100).toBeLessThanOrEqual(900)
      for (const u of f.units ?? []) expect(u.grams).toBeGreaterThan(0)
    }
  })
  it('ערכי USDA מהאיפיון משוחזרים', () => {
    expect(Math.round(calcItem('bread', 28).kcal!)).toBe(67)
    expect(Math.round(calcItem('egg', 50).kcal!)).toBe(72)
    expect(Math.round(calcItem('rice_cooked', 158).kcal!)).toBe(205)
    expect(Math.round(calcItem('pasta_dry', 100).kcal!)).toBe(371)
    expect(Math.round(calcItem('mozzarella', 60).kcal!)).toBe(179)
    expect(Math.round(calcItem('olive_oil', 13.5).kcal!)).toBe(119)
  })
  it('כל מתכון מפנה למזון קיים ואין בו בשר וחלב יחד', () => {
    for (const r of RECIPES) {
      for (const i of r.items) expect(FOODS.some((f) => f.id === i.foodId), `${r.id}:${i.foodId}`).toBe(true)
      expect(kosherOf(r.items), r.id).not.toBe('conflict')
    }
  })
})

describe('חישוב', () => {
  it('AC05: יבש ומבושל נשארים נפרדים', () => {
    const dry = calcItem('pasta_dry', 100).kcal!
    const cookedRice = calcItem('rice_cooked', 100).kcal!
    expect(dry).toBeGreaterThan(cookedRice * 2)
  })
  it('AC06: שתייה ותוספות נכללות', () => {
    const r = RECIPES.find((x) => x.id === 'out_pizza')!
    const withDrink = calcRecipe(r, 1).kcal
    const without = calcRecipe(r, 1, ['cola']).kcal
    expect(Math.round(withDrink - without)).toBe(Math.round(calcItem('cola', 330).kcal!))
  })
  it('AC07: ערך לא ידוע לא נספר כאפס', () => {
    const c = calcItems([{ foodId: 'bread', grams: 56 }, { foodId: 'not_in_db', grams: 100 }])
    expect(c.complete).toBe(false)
    expect(c.protein).toBeNull()
  })
  it('AC12: חצי מנה מחצה את הסך', () => {
    const items = calcRecipe(RECIPES[0], 1).items.map((i) => ({ name: i.name, grams: i.grams, kcal: i.kcal, protein: i.protein, source: i.source }))
    const full = entryKcal({ id: 'a', idemKey: 'k', localDate: '2026-10-04', timezone: 'Asia/Jerusalem', eatenAt: '', loggedAt: '', title: '', items, portion: 1, version: 1 })
    const half = entryKcal({ id: 'a', idemKey: 'k', localDate: '2026-10-04', timezone: 'Asia/Jerusalem', eatenAt: '', loggedAt: '', title: '', items, portion: 0.5, version: 1 })
    expect(half.kcal).toBeCloseTo(full.kcal / 2)
  })
})

describe('החלפות', () => {
  it('AC08: חלופה ל־800 רק בטווח 720–880', () => {
    const opts = suggestSwaps({ targetKcal: 800, slot: 'evening', recipes: RECIPES, ctx: ctx() })
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.length).toBeLessThanOrEqual(3)
    for (const o of opts) {
      expect(o.calc.kcal).toBeGreaterThanOrEqual(720)
      expect(o.calc.kcal).toBeLessThanOrEqual(880)
    }
  })
  it('AC09: אין חלופה מתאימה, לא ממציאים', () => {
    expect(suggestSwaps({ targetKcal: 4000, slot: 'evening', recipes: RECIPES, ctx: ctx() })).toEqual([])
  })
  it('AC20: אלרגיה נחסמת בהחלפות ובתכנון', () => {
    const c = ctx({ allergies: ['egg', 'milk'] })
    const opts = suggestSwaps({ targetKcal: 700, slot: 'morning', recipes: RECIPES, ctx: c, tolerance: 0.3 })
    for (const o of opts) expect(checkRecipe(o.recipe, c.profile).ok).toBe(true)
    const week = generateWeek('2026-10-04', RECIPES, c)
    for (const p of week) {
      const r = RECIPES.find((x) => x.id === p.recipeId)!
      expect(r.items.some((i) => ['egg', 'mozzarella', 'yogurt', 'milk', 'cottage'].includes(i.foodId)), r.id).toBe(false)
    }
  })
  it('AC21: מנה שמערבבת בשר וחלב נחסמת', () => {
    const bad: Recipe = { id: 'bad', name: 'צ׳יזבורגר', kind: 'home', effort: '15', totalMinutes: 10, activeMinutes: 10, slots: ['evening'], items: [{ foodId: 'beef_ground', grams: 150 }, { foodId: 'mozzarella', grams: 40 }] }
    expect(checkRecipe(bad, defaultProfile()).ok).toBe(false)
    expect(suggestSwaps({ targetKcal: calcRecipe(bad).kcal, slot: 'evening', recipes: [bad], ctx: ctx() })).toEqual([])
  })
})

describe('תכנון', () => {
  it('AC01: שלוש ארוחות, אחת בחוץ', () => {
    const day = generateDay('2026-10-04', RECIPES, ctx())
    expect(day.map((d) => d.slot)).toEqual(['morning', 'outside', 'evening'])
    expect(RECIPES.find((r) => r.id === day[1].recipeId)!.kind).toBe('outside')
  })
  it('שבוע: 21 משבצות; בשבת לא מתוכנן אוכל בחוץ', () => {
    const week = generateWeek('2026-10-04', RECIPES, ctx())
    expect(week).toHaveLength(21)
    const sat = week.find((p) => p.date === '2026-10-10' && p.slot === 'outside')!
    expect(RECIPES.find((r) => r.id === sat.recipeId)!.kind).toBe('home')
  })
  it('תכנון מחדש לא משנה ארוחה שדווחה', () => {
    const week = generateWeek('2026-10-04', RECIPES, ctx())
    const eaten = { ...week[0], status: 'eaten' as const, recipeId: 'pb_shake' }
    const again = generateWeek('2026-10-04', RECIPES, ctx(), [eaten])
    expect(again[0]).toEqual(eaten)
  })
  it('הפרדת בשר וחלב לפי שעות המתנה שהוגדרו', () => {
    const c = ctx({ meatDairyWaitHours: 7 })
    const week = generateWeek('2026-10-04', RECIPES, c)
    for (let i = 0; i < 7; i++) {
      const d = addDays('2026-10-04', i)
      const out = RECIPES.find((r) => r.id === week.find((p) => p.date === d && p.slot === 'outside')!.recipeId)!
      const eve = RECIPES.find((r) => r.id === week.find((p) => p.date === d && p.slot === 'evening')!.recipeId)!
      if (kosherOf(out.items) === 'meat') expect(kosherOf(eve.items), d).not.toBe('dairy')
    }
  })
  it('סכום יומי צפוי קרוב ליעד', () => {
    const week = generateWeek('2026-10-04', RECIPES, ctx())
    for (let i = 0; i < 7; i++) {
      const d = addDays('2026-10-04', i)
      const total = week.filter((p) => p.date === d).reduce((s, p) => s + calcRecipe(RECIPES.find((r) => r.id === p.recipeId)!, p.multiplier).kcal, 0)
      expect(total, d).toBeGreaterThan(2000)
      expect(total, d).toBeLessThan(3000)
    }
  })
})

describe('קניות', () => {
  const plan = [
    { date: '2026-10-04', slot: 'morning' as const, recipeId: 'toast_eggs', multiplier: 1, status: 'planned' as const },
    { date: '2026-10-05', slot: 'morning' as const, recipeId: 'egg_sandwich', multiplier: 1, status: 'planned' as const },
    { date: '2026-10-04', slot: 'outside' as const, recipeId: 'out_shawarma_lafa', multiplier: 1, status: 'planned' as const },
  ]
  it('AC17: אוכל בחוץ לא מוסיף מצרכים', () => {
    const { toBuy } = generateShopping(plan, RECIPES, {})
    expect(toBuy.some((l) => l.foodId === 'shawarma_meat' || l.foodId === 'lafa')).toBe(false)
  })
  it('AC18: איחוד בלי כפילויות', () => {
    const { toBuy } = generateShopping(plan, RECIPES, {})
    const eggs = toBuy.filter((l) => l.foodId === 'egg')
    expect(eggs).toHaveLength(1)
    expect(eggs[0].neededGrams).toBe(250)
    expect(eggs[0].packs).toBe(1)
    expect(new Set(toBuy.map((l) => l.foodId)).size).toBe(toBuy.length)
  })
  it('מלאי שסומן לא נקנה שוב', () => {
    const { toBuy, covered } = generateShopping(plan, RECIPES, { egg: true })
    expect(toBuy.some((l) => l.foodId === 'egg')).toBe(false)
    expect(covered.some((l) => l.foodId === 'egg')).toBe(true)
  })
  it('AC19: שינוי תוכנית מייצר הפרש לאישור', () => {
    const a = generateShopping(plan, RECIPES, {}).toBuy
    const b = generateShopping([...plan, { date: '2026-10-06', slot: 'evening', recipeId: 'pasta_tomato', multiplier: 1, status: 'planned' }], RECIPES, {}).toBuy
    const d = diffShopping(a, b)
    expect(d.added.some((l) => l.foodId === 'pasta_dry')).toBe(true)
  })
})

describe('טקסט חופשי', () => {
  it('AC10: ״בא לי״ הוא כוונה ולא דיווח', () => {
    const d = parseFood('בא לי לאפה שווארמה', RECIPES)
    expect(d.intent).toBe('want')
    expect(d.lines[0].recipeId).toBe('out_shawarma_lafa')
  })
  it('שלושה משולשים וקולה: כמות, ושאלה על גודל השתייה', () => {
    const d = parseFood('אכלתי שלושה משולשים וקולה', RECIPES)
    expect(d.intent).toBe('ate')
    const pizza = d.lines.find((l) => l.foodId === 'pizza_slice')!
    expect(pizza.grams).toBe(321)
    expect(d.lines.some((l) => l.foodId === 'cola')).toBe(true)
    expect(d.questions.some((q) => q.text.includes('קולה'))).toBe(true)
  })
  it('חצי בגט שניצל', () => {
    const d = parseFood('חצי בגט שניצל בלי מיונז', RECIPES)
    expect(d.intent).toBe('unclear')
    const l = d.lines[0]
    expect(l.recipeId).toBe('out_schnitzel_baguette')
    const full = calcRecipe(RECIPES.find((r) => r.id === 'out_schnitzel_baguette')!).kcal
    expect(l.kcal!).toBeCloseTo(full / 2)
  })
  it('״בלי״ מסיר רכיב ממנה מורכבת', () => {
    const withT = parseFood('אכלתי פיתה שווארמה', RECIPES).lines[0].kcal!
    const withoutT = parseFood('אכלתי פיתה שווארמה בלי טחינה', RECIPES).lines[0].kcal!
    expect(Math.round(withT - withoutT)).toBe(Math.round(calcItem('tahini', 20).kcal!))
  })
})

describe('משקל ותאריכים', () => {
  it('AC30: מעט שקילות, אין מגמה', () => {
    const s = summarizeWeight([{ id: '1', date: '2026-10-01', kg: 60 }, { id: '2', date: '2026-10-03', kg: 60.4 }], '2026-10-04')
    expect(s.weeklyTrend).toBeNull()
  })
  it('מגמה רק עם 3+3 מדידות', () => {
    const e = ['2026-09-21', '2026-09-23', '2026-09-26', '2026-09-28', '2026-09-30', '2026-10-03'].map((d, i) => ({ id: d, date: d, kg: 60 + (i < 3 ? 0 : 0.6) }))
    expect(summarizeWeight(e, '2026-10-04').weeklyTrend).toBeCloseTo(0.6)
  })
  it('AC04: שינוי יעד לא משנה היסטוריה', () => {
    const goals = [{ kcal: 2500, effectiveFrom: '2026-10-01', setAt: '2026-10-01T00:00:00Z' }, { kcal: 2700, effectiveFrom: '2026-10-05', setAt: '2026-10-04T00:00:00Z' }]
    expect(goalFor(goals, '2026-10-03')).toBe(2500)
    expect(goalFor(goals, '2026-10-06')).toBe(2700)
  })
  it('מעבר חצות לפי אזור זמן ישראל', () => {
    expect(localDate(new Date('2026-10-04T21:30:00Z'), 'Asia/Jerusalem')).toBe('2026-10-05')
  })
})

describe('מוטיבציה', () => {
  it('AC38: אין מסרים שיפוטיים', () => {
    const p = defaultProfile()
    for (const tone of ['calm', 'practical', 'energetic'] as const)
      for (const s of ['noEnergy', 'deciding', 'logged', 'lowLogging', 'start'] as const) expect(isSafeMessage(line({ ...p, tone }, s)!)).toBe(true)
  })
  it('AC02: פריט שלא סומן הוא ״לא ידוע״ ולא סלידה', () => {
    const s = initialState()
    expect(s.prefs['tuna']).toBeUndefined()
    expect(Object.values(s.prefs).includes('dislike')).toBe(false)
  })
})

describe('גיוון', () => {
  it('אף ארוחה לא חוזרת יותר משלוש פעמים בשבוע', () => {
    const week = generateWeek('2026-10-04', RECIPES, ctx())
    const counts: Record<string, number> = {}
    for (const p of week) counts[p.recipeId] = (counts[p.recipeId] ?? 0) + 1
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(3)
  })
})

import { hasUserData, mergeLogs, mergeStates, validateImport } from './sync'
import type { LogEntry } from '../types'

const entry = (id: string, idemKey: string, extra: Partial<LogEntry> = {}): LogEntry => ({
  id, idemKey, localDate: '2026-10-04', timezone: 'Asia/Jerusalem', eatenAt: '2026-10-04T08:00:00Z', loggedAt: '2026-10-04T08:00:0' + id + 'Z',
  title: 'טוסט', items: [{ name: 'לחם', grams: 56, kcal: 134, protein: 5, source: 'usda' }], portion: 1, version: 1, ...extra,
})

describe('סנכרון ומיזוג', () => {
  it('AC11: אותו מפתח ייחודי משני מכשירים נרשם פעם אחת', () => {
    const m = mergeLogs([entry('1', 'k1')], [entry('2', 'k1'), entry('3', 'k2')])
    expect(m.filter((e) => !e.deleted).map((e) => e.idemKey).sort()).toEqual(['k1', 'k2'])
  })
  it('AC14: עריכה עם גרסה גבוהה גוברת, ומחיקה נשמרת', () => {
    const m = mergeLogs([entry('1', 'k1', { portion: 0.5, version: 2 })], [entry('1', 'k1')])
    expect(m).toHaveLength(1)
    expect(m[0].portion).toBe(0.5)
    const d = mergeLogs([entry('1', 'k1')], [entry('1', 'k1:deleted:1', { deleted: true, version: 2 })])
    expect(d.filter((e) => !e.deleted)).toHaveLength(0)
  })
  it('מיזוג מצבים: ארוחה שדווחה גוברת על מתוכננת, ושקילות משני הצדדים נשמרות', () => {
    const a = initialState(new Date('2026-10-04T08:00:00Z'))
    const b = structuredClone(a)
    a.plan[0] = { ...a.plan[0], status: 'eaten' }
    a.weights = [{ id: 'w1', date: '2026-10-03', kg: 61 }]
    b.weights = [{ id: 'w2', date: '2026-10-01', kg: 60 }]
    const m = mergeStates(b, a)
    expect(m.plan.find((p) => p.date === a.plan[0].date && p.slot === a.plan[0].slot)!.status).toBe('eaten')
    expect(m.weights).toHaveLength(2)
  })
  it('זיהוי נתוני משתמש ובדיקת קובץ ייבוא', () => {
    const s = initialState()
    expect(hasUserData(s)).toBe(false)
    expect(hasUserData({ ...s, log: [entry('1', 'k')] })).toBe(true)
    expect(validateImport(JSON.parse(JSON.stringify(s)))).not.toBeNull()
    expect(validateImport({ foo: 1 })).toBeNull()
  })
})
