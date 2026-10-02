import { FOODS, FOOD_BY_ID } from '../data/foods'
import type { MealItem, Recipe, Source } from '../types'
import { calcItem, calcItems } from './nutrition'

// פענוח דטרמיניסטי של טקסט חופשי (פרק 10). עובד בלי שירות AI;
// בהמשך AI יוכל להציע פירוק, אבל המספרים תמיד מגיעים מהמאגר.

export type Intent = 'want' | 'ate' | 'unclear'

export interface DraftLine {
  key: string
  name: string
  foodId?: string
  recipeId?: string
  /** רכיבי מנה מורכבת אחרי הסרת ״בלי X״ */
  parts?: MealItem[]
  grams: number
  kcal: number | null
  protein: number | null
  source: Source
  assumption?: string
}

export interface DraftQuestion {
  key: string
  text: string
  options: { label: string; grams: number }[]
}

export interface Draft {
  intent: Intent
  lines: DraftLine[]
  questions: DraftQuestion[]
  unmatched: string[]
}

const NUMBERS: Record<string, number> = {
  אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2, זוג: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
  שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10, חצי: 0.5, רבע: 0.25,
}

const WANT = ['בא לי', 'מתחשק', 'רוצה', 'אולי', 'חושב על', 'מתכנן']
const ATE = ['אכלתי', 'שתיתי', 'היה לי', 'נשנשתי', 'טרפתי', 'הזמנתי']

/** ביטויי מנות מורכבות שממופים למתכוני אוכל בחוץ */
const RECIPE_ALIASES: [string, string][] = [
  ['לאפה שווארמה', 'out_shawarma_lafa'], ['לאפה שוארמה', 'out_shawarma_lafa'],
  ['פיתה שווארמה', 'out_shawarma_pita'], ['פיתה שוארמה', 'out_shawarma_pita'],
  ['פיתה פרגית', 'out_pargit'], ['פלאפל בפיתה', 'out_falafel'], ['מנת פלאפל', 'out_falafel'],
  ['בגט שניצל', 'out_schnitzel_baguette'], ['שניצל בבגט', 'out_schnitzel_baguette'],
  ['טוסט נקניק', 'out_sausage_toast'], ['טוסט גבינות', 'out_cheese_toast'], ['טוסט גבינה', 'cheese_toast'],
  ['סביח', 'out_sabich'], ['מקדונלדס', 'out_mcdonalds'], ['מוקפץ', 'out_stirfry'], ['סושי', 'out_sushi'],
  ['צלחת חומוס', 'out_hummus_plate'], ['בורקס עם ביצה', 'out_bourekas'], ['פסטה ממסעדה', 'out_pasta'],
  ['רביולי', 'ravioli_sauce'], ['שייק', 'pb_shake'],
]

type Match = { kind: 'food' | 'recipe'; id: string }

function buildAliases(): Map<string, Match> {
  const m = new Map<string, Match>()
  for (const f of FOODS) {
    for (const a of [f.name, ...(f.aliases ?? [])]) if (!m.has(a)) m.set(a, { kind: 'food', id: f.id })
  }
  for (const [a, id] of RECIPE_ALIASES) m.set(a, { kind: 'recipe', id })
  return m
}
const ALIASES = buildAliases()

function normalize(text: string): string[] {
  return text
    .replace(/[״"׳']/g, (c) => (c === '׳' || c === "'" ? '׳' : ''))
    .replace(/[,.!?;:()\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function lookup(phrase: string): Match | undefined {
  return ALIASES.get(phrase) ?? ALIASES.get(phrase.replace(/׳/g, ''))
}

export function detectIntent(text: string): Intent {
  const t = text.trim()
  if (ATE.some((w) => t.includes(w))) return 'ate'
  if (WANT.some((w) => t.includes(w))) return 'want'
  return 'unclear'
}

let seq = 0
const nextKey = () => `l${++seq}`

export function parseFood(text: string, recipes: Recipe[]): Draft {
  const intent = detectIntent(text)
  const tokens = normalize(text)
  const lines: DraftLine[] = []
  const questions: DraftQuestion[] = []
  const unmatched: string[] = []
  const consumed = new Set<number>()
  const without: string[] = []

  // ״בלי X״ מסיר רכיב ממנה מורכבת
  tokens.forEach((t, i) => {
    if (t === 'בלי' && tokens[i + 1]) {
      const m = lookup(tokens[i + 1]) ?? lookup(tokens[i + 1].replace(/^ה/, ''))
      if (m?.kind === 'food') without.push(m.id)
      consumed.add(i).add(i + 1)
    }
  })
  const withExtras = new Set<string>()
  tokens.forEach((t, i) => {
    if ((t === 'עם' || t.startsWith('ועם')) && tokens[i + 1]) {
      const m = lookup(tokens[i + 1])
      if (m?.kind === 'food') withExtras.add(m.id)
    }
  })

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue
    let found: { m: Match; len: number } | null = null
    for (let n = 3; n >= 1 && !found; n--) {
      if (i + n > tokens.length) continue
      const raw = tokens.slice(i, i + n).join(' ')
      const variants = [raw, raw.replace(/^ו/, ''), raw.replace(/^ה/, ''), raw.replace(/^וה/, ''), raw.replace(/^ב/, '')]
      for (const v of variants) {
        const m = lookup(v)
        if (m) { found = { m, len: n }; break }
      }
    }
    if (!found) continue
    // כמות לפני הפריט: מספר, מילת מספר, יחידה
    let count: number | null = null
    let unitWord: string | null = null
    let gramsExplicit: number | null = null
    for (let back = 1; back <= 3 && i - back >= 0; back++) {
      const t = tokens[i - back].replace(/^ו/, '')
      if (consumed.has(i - back)) break
      if (/^\d+(\.\d+)?$/.test(t)) {
        const next = tokens[i - back + 1]
        if (next === 'גרם' || next === 'ג׳' || next === 'מ״ל' || next === 'מל') gramsExplicit = Number(t)
        else count = Number(t)
        break
      }
      if (NUMBERS[t] != null) { count = (count ?? 1) * NUMBERS[t]; continue }
      if (t === 'גרם' || t === 'מל') continue
      unitWord = unitWord ?? t
    }
    for (let k = i; k < i + found.len; k++) consumed.add(k)

    if (found.m.kind === 'recipe') {
      const r = recipes.find((x) => x.id === found!.m.id)
      if (!r) continue
      const parts = r.items.filter((it) => !without.includes(it.foodId) && (!it.optional || withExtras.has(it.foodId)))
      const portion = count ?? 1
      const calc = calcItems(parts, portion)
      lines.push({
        key: nextKey(), name: r.name, recipeId: r.id, parts: parts.map((p) => ({ ...p, grams: p.grams * portion })),
        grams: Math.round(parts.reduce((s, p) => s + p.grams, 0) * portion),
        kcal: calc.complete ? calc.kcal : null, protein: calc.protein, source: 'estimate',
        assumption: `מנה רגילה לפי רכיבים${without.length ? `, בלי ${without.map((w) => FOOD_BY_ID[w].name).join(', ')}` : ''}`,
      })
      continue
    }

    const f = FOOD_BY_ID[found.m.id]
    if (without.includes(f.id)) continue
    let grams: number
    let assumption: string | undefined
    const unit = f.units?.find((u) => u.name === unitWord || u.plural === unitWord) ?? f.units?.[0]
    const key = nextKey()
    if (gramsExplicit != null) grams = gramsExplicit
    else if (count != null && unit) grams = count * unit.grams
    else if (unit) {
      grams = unit.grams
      assumption = `הנחה: ${unit.name} אחד/ת (${unit.grams} ג׳)`
      // שאלה רק כשהכמות משנה משמעותית את החישוב (פרק 10)
      if ((f.kcal100 ?? 0) * unit.grams / 100 >= 100 || f.state === 'liquid') {
        const opts = f.state === 'liquid'
          ? [{ label: 'כוס (250 מ״ל)', grams: 250 }, { label: 'פחית (330 מ״ל)', grams: 330 }, { label: 'בקבוק חצי ליטר', grams: 500 }]
          : [1, 2, 3].map((c) => ({ label: `${c} ${c === 1 ? unit.name : unit.plural ?? unit.name}`, grams: c * unit.grams }))
        questions.push({ key, text: `כמה ${f.name}?`, options: opts })
      }
    } else {
      grams = 100
      assumption = 'הנחה: 100 ג׳, כדאי לתקן'
      questions.push({ key, text: `כמה ${f.name}?`, options: [50, 100, 200].map((g) => ({ label: `${g} ג׳`, grams: g })) })
    }
    const c = calcItem(f.id, grams)
    lines.push({ key, name: f.name, foodId: f.id, grams, kcal: c.kcal, protein: c.protein, source: f.source, assumption })
  }

  tokens.forEach((t, i) => {
    if (consumed.has(i)) return
    if (NUMBERS[t.replace(/^ו/, '')] != null || /^\d/.test(t)) return
    if ([...WANT, ...ATE, 'לי', 'עם', 'ועם', 'גרם', 'של', 'קצת', 'גם', 'היום', 'עכשיו', 'בצהריים', 'בערב', 'בבוקר', 'בלי'].some((w) => w.split(' ').includes(t))) return
    unmatched.push(t)
  })

  return { intent, lines, questions, unmatched }
}

export function applyAnswer(draft: Draft, key: string, grams: number): Draft {
  return {
    ...draft,
    questions: draft.questions.filter((q) => q.key !== key),
    lines: draft.lines.map((l) => {
      if (l.key !== key || !l.foodId) return l
      const c = calcItem(l.foodId, grams)
      return { ...l, grams, kcal: c.kcal, protein: c.protein, assumption: undefined }
    }),
  }
}

export function draftTotal(lines: DraftLine[]): { kcal: number; complete: boolean } {
  let kcal = 0
  let complete = true
  for (const l of lines) {
    if (l.kcal == null) complete = false
    else kcal += l.kcal
  }
  return { kcal, complete }
}
