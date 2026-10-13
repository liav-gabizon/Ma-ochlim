// בדיקת דפדפן ללא חלון לסבב 13.10.2026: אלרגיה → התכנון מתעדכן; אזהרת אילוצים בטקסט חופשי; יעד יומי → יעדי המשבצות.
// אחסון מקומי בלבד, בלי התחברות. כל בקשה שאינה לשרת המקומי נחסמת ונרשמת.
// הרצה:  npx vite --mode sweep --port 5199 --strictPort   (mode שאינו development/production: קובצי .env של הענן לא נטענים)
//         PLAYWRIGHT_FROM=<תיקייה עם node_modules/playwright> node scripts/sweep-browser-check.mjs http://localhost:5199/
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(path.join(path.resolve(process.env.PLAYWRIGHT_FROM ?? '.'), 'package.json'))
const { chromium } = require('playwright')
const base = process.argv[2] ?? 'http://localhost:5199/'
const KEY = 'ma-ochlim:v1'
const EGG = ['toast_eggs', 'egg_sandwich', 'egg_avocado_sandwich', 'bagel_cream', 'rice_schnitzel', 'ravioli_sauce', 'hummus_egg_pita', 'schnitzel_pita', 'out_sabich', 'out_schnitzel_baguette', 'out_sausage_toast', 'out_bourekas', 'out_burger', 'out_hummus_plate', 'out_stirfry']

const browser = await chromium.launch()
const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
const page = await ctx.newPage()
const problems = { console: [], pageErrors: [], external: [] }
page.on('console', (m) => m.type() === 'error' && problems.console.push(m.text()))
page.on('pageerror', (e) => problems.pageErrors.push(String(e)))
await ctx.route('**/*', (route) => {
  const u = new URL(route.request().url())
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue()
  problems.external.push(u.origin)
  return route.abort()
})

const state = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
const todayRows = () => page.locator('.day-list li').allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, ' ').trim()))
const tab = (label) => page.locator('nav.tabbar button', { hasText: label }).click()
const closeSheet = () => page.getByRole('button', { name: 'סגירה' }).click()
const openSettings = () => page.getByRole('button', { name: 'פרופיל והגדרות' }).click()
const eggPlanned = (s, today) => s.plan.filter((p) => p.date >= today && p.status === 'planned' && EGG.includes(p.recipeId)).map((p) => `${p.date}/${p.slot}/${p.recipeId}`)
const out = {}

await page.goto(base)
await page.getByRole('heading', { name: 'מה אוכלים' }).waitFor()
await page.waitForFunction((k) => !!localStorage.getItem(k), KEY)
const s0 = await state()
const today = s0.plan.map((p) => p.date).sort()[0]
const tomorrow = s0.plan.map((p) => p.date).sort().find((d) => d > today)
// מצב התחלה ידוע: שתי ארוחות מתוכננות עם ביצים היום, אחת מחר, וארוחה עם ביצים שכבר דווחה
const set = (date, slot, recipeId, status = 'planned') => { const m = s0.plan.find((p) => p.date === date && p.slot === slot); Object.assign(m, { recipeId, multiplier: 1, status }) }
s0.profile.allergies = 'none'
set(today, 'morning', 'toast_eggs')
set(today, 'outside', 'out_sabich', 'eaten')
set(today, 'evening', 'egg_sandwich')
set(tomorrow, 'morning', 'egg_sandwich')
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(s0)])
await page.reload()
await page.getByRole('heading', { name: 'מה אוכלים' }).waitFor()

// 1. אלרגיה
out.allergy = { before: { today: await todayRows(), eggPlanned: eggPlanned(await state(), today) } }
await tab('שבוע וקניות')
await page.getByRole('tab', { name: 'רשימת קניות' }).click()
await page.getByRole('button', { name: 'אשר רשימה' }).click()
out.allergy.before.shoppingHasEggs = (await page.locator('.shop-list li', { hasText: 'ביצ' }).count()) > 0
await tab('היום')
await openSettings()
await page.locator('section', { hasText: 'אלרגיות ורגישויות' }).getByRole('button', { name: 'ביצים', exact: true }).click()
await closeSheet()
const s1 = await state()
out.allergy.after = {
  allergies: s1.profile.allergies,
  today: await todayRows(),
  eggPlanned: eggPlanned(s1, today),
  reportedKept: s1.plan.find((p) => p.date === today && p.slot === 'outside'),
  slotsFromToday: s1.plan.filter((p) => p.date >= today).length,
  warnOnToday: await page.locator('.next .banner.warn').allInnerTexts(),
}
await tab('שבוע וקניות')
await page.getByRole('tab', { name: 'רשימת קניות' }).click()
out.allergy.after.shoppingDiffBanner = (await page.locator('.banner.warn').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '))
await tab('היום')

// 2. טקסט חופשי
const free = async (text) => {
  await page.getByRole('button', { name: 'הוספת אוכל: בא לי או אכלתי' }).click()
  await page.locator('.sheet textarea').fill(text)
  await page.getByRole('button', { name: 'חשב', exact: true }).click()
  await page.locator('.draft-lines li').first().waitFor()
  return { lines: await page.locator('.draft-lines li strong').allInnerTexts(), warning: await page.locator('.sheet .banner.warn').allInnerTexts() }
}
out.freeText = { ate: await free('אכלתי סביח') }
await closeSheet()
const planBefore = (await state()).plan.filter((p) => p.date === today).map((p) => `${p.slot}:${p.recipeId}:${p.status}`)
const want = await free('בא לי סביח')
const select = page.locator('.sheet select')
want.slotSelect = { value: await select.inputValue(), disabled: await select.isDisabled() }
await page.getByRole('button', { name: 'שמור לתכנון' }).click()
const s2 = await state()
want.todayPlanBefore = planBefore
want.todayPlanAfter = s2.plan.filter((p) => p.date === today).map((p) => `${p.slot}:${p.recipeId}:${p.status}`)
want.eggPlannedAfterSave = eggPlanned(s2, today).concat(s2.plan.filter((p) => p.date >= today && p.status === 'planned' && p.recipeId.startsWith('custom_')).map((p) => `${p.date}/${p.slot}/${p.recipeId}`))
out.freeText.want = want

// 3. יעד יומי
const weekTotals = () => page.locator('.day-card .row span.small').allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, ' ').trim()))
const multipliers = async () => (await state()).plan.filter((p) => p.date > today && p.status === 'planned').map((p) => p.multiplier)
await tab('שבוע וקניות')
out.goal = { at2500: { week: await weekTotals(), multipliers: await multipliers() } }
await openSettings()
const goalSection = page.locator('section', { hasText: 'קק״ל ליום' })
await goalSection.locator('input').first().fill('3200')
await goalSection.getByRole('button', { name: 'שמור יעד' }).click()
out.goal.saved = await goalSection.getByRole('status').innerText()
await closeSheet()
await page.getByRole('button', { name: 'תכנן מחדש ארוחות שלא דווחו' }).click()
const s3 = await state()
out.goal.at3200 = { week: await weekTotals(), multipliers: await multipliers(), eggPlanned: eggPlanned(s3, today), reportedKept: s3.plan.find((p) => p.date === today && p.slot === 'outside') }
// אחרי טעינה מחדש המצב נקרא מהאחסון המקומי
await page.reload()
await page.getByRole('heading', { name: 'מה אוכלים' }).waitFor()
await tab('שבוע וקניות')
out.goal.afterReload = { week: await weekTotals() }

// הוכחה שהלכידה עובדת: שגיאת קונסול, חריגה ובקשה חיצונית יזומות חייבות להירשם; רק אז היעדר שגיאות למעלה הוא ראיה
const seen = { console: problems.console.length, pageErrors: problems.pageErrors.length, external: problems.external.length }
await page.evaluate(() => { console.error('sweep-probe'); setTimeout(() => { throw new Error('sweep-probe-throw') }, 0); fetch('https://probe.invalid/x').catch(() => {}) })
await page.waitForTimeout(500)
out.captureProbe = { console: problems.console.length > seen.console, pageError: problems.pageErrors.length > seen.pageErrors, external: problems.external.length > seen.external }
out.problems = { console: problems.console.slice(0, seen.console), pageErrors: problems.pageErrors.slice(0, seen.pageErrors), external: problems.external.slice(0, seen.external) }
console.log(JSON.stringify(out, null, 2))
await browser.close()
