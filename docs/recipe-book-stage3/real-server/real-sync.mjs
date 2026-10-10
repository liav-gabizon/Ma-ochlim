// שני דפדפנים מול Supabase האמיתי, שניהם מחוברים ל־test1 (שתי התחברויות נפרדות).
// אותם תרחישים כמו sync2.mjs, בלי השרת המדומה. "השרת" כאן = השורה של test1 בלבד, נקראת עם ה־JWT שלו.
// הרצה: בנייה של 27e7692 ב־vite preview על 4173, ואז node real-sync.mjs
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MJS || '/opt/node-tools/node_modules/playwright/index.mjs')
import { login, loadCreds, ownRow, summary, REF } from './lib.mjs'
const BASE = 'http://localhost:4173/'
const results = []
const ok = (n, c, x = '') => results.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' · ' + x : ''}`)
const creds = loadCreds()
const probe = await login(creds.test1.email, creds.test1.password)
const server = { row: null, writes: 0, conflicts: 0, log: [] }
const refresh = async () => { server.row = await ownRow(probe); return server.row }
const before = summary(await refresh())
console.log('test1 לפני:', JSON.stringify(before))
const browser = await chromium.launch()
const errors = []
async function device(name) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL' })
  const session = await login(creds.test1.email, creds.test1.password)
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  const p = await ctx.newPage()
  p.on('response', (r) => {
    const u = r.url(); if (!u.includes('/rest/v1/app_state')) return
    const m = r.request().method()
    if (m === 'POST' || m === 'PATCH') r.json().then((j) => { const n = Array.isArray(j) ? j.length : j ? 1 : 0; if (r.status() < 300 && n) { server.writes++; server.log.push(`${name} ${m === 'POST' ? 'insert' : 'update'} v${(Array.isArray(j) ? j[0] : j).version}`) } else { server.conflicts++; server.log.push(`${name} conflict ${m} ${r.status()}`) } }).catch(() => {})
  })
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`) })
  await p.goto(BASE)
  return p
}
const S = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('ma-ochlim:v1')))
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)) } return false }
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v
const synced = (p) => until(async () => { const s = await S(p); await refresh(); return server.row && JSON.stringify(canon(stripHints(server.row.state))) === JSON.stringify(canon(stripHints(s))) })
const stripHints = (s) => { const { recipeNames, ...rest } = s; return rest }
const sheet = (p) => p.locator('.sheet').last()
const goBook = async (p) => { await p.getByRole('navigation').getByText('אוכל').click(); await p.getByRole('tab', { name: 'ספר מתכונים' }).click(); await p.getByRole('button', { name: 'כל הזמנים' }).click() }
async function createRecipe(p, name, ingredients) {
  await p.getByRole('button', { name: '+ מתכון חדש' }).click()
  await sheet(p).getByLabel('שם').fill(name)
  if (ingredients) {
    await sheet(p).locator('textarea').first().fill(ingredients)
    await sheet(p).getByRole('button', { name: 'זהה רכיבים' }).click()
    await sheet(p).getByRole('button', { name: 'הוסף למתכון' }).click()
    await sheet(p).getByLabel('מספר מנות במתכון (ריק = לא ידוע)').fill('2')
    await sheet(p).getByLabel('זמן כולל מ').fill('20'); await sheet(p).getByLabel('זמן כולל עד').fill('20')
  }
  await sheet(p).getByRole('button', { name: 'שמור מתכון' }).click()
  await sheet(p).getByRole('button', { name: 'סגירה' }).click()
}
const openCard = async (p, name) => {
  const row = p.locator('.recipe-row', { hasText: name }).first()
  if (!(await row.isVisible())) { const t = p.getByRole('button', { name: /בלי זמן ידוע · הצג/ }); if (await t.count()) await t.click() }
  await row.click()
}
const book = async (p) => (await S(p)).customRecipes

// 1. מכשיר א׳: יוצר מתכון ומועדף
const A = await device('A')
await goBook(A)
await createRecipe(A, 'מתכון א', '400 גרם פסטה, 680 גרם רוטב עגבניות')
await openCard(A, 'פסטה ברוטב עגבניות'); await sheet(A).getByRole('button', { name: '☆ שמור למועדפים' }).click(); await sheet(A).getByRole('button', { name: 'סגירה' }).click()
ok('א׳ נשמר לחשבון', await synced(A), server.log.join(', '))

// 2. מכשיר ב׳ (נקי) מקבל את הנתונים
const B = await device('B')
await until(async () => (await S(B))?.customRecipes?.length === 1)
await goBook(B)
const bText = await B.locator('.book').innerText()
ok('ב׳ רואה את המתכון של א׳', bText.includes('מתכון א'))
ok('ב׳ רואה את המועדף של א׳', (await S(B)).favorites?.pasta_tomato?.on === true || Object.values((await S(B)).favorites ?? {}).some((f) => f.on), JSON.stringify((await S(B)).favorites))

// 3. ב׳ עורך את מתכון א ויוצר מתכון ב
await openCard(B, 'מתכון א'); await sheet(B).getByRole('button', { name: /עריכה/ }).click()
await sheet(B).getByLabel('שם').fill('מתכון א ערוך'); await sheet(B).getByRole('button', { name: 'שמור מתכון' }).click(); await sheet(B).getByRole('button', { name: 'סגירה' }).click()
await createRecipe(B, 'מתכון ב', '200 גרם פסטה')
{ const r = await synced(B); if (!r) { const l = canon(await S(B)), sv = canon(stripHints(server.row.state)); for (const k of new Set([...Object.keys(l), ...Object.keys(sv)])) if (JSON.stringify(l[k]) !== JSON.stringify(sv[k])) console.log('DIFF', k, JSON.stringify(l[k])?.slice(0, 300), '| server:', JSON.stringify(sv[k])?.slice(0, 300)) } ok('ב׳ נשמר לחשבון', r) }

// 4. א׳ (לא רוענן, גרסה ישנה) יוצר מתכון ג ומסיר מועדף
await A.waitForTimeout(300)
await createRecipe(A, 'מתכון ג')
ok('א׳ ממזג אחרי התנגשות ושומר', await synced(A), server.log.slice(-3).join(', '))
let a = await book(A)
ok('א׳: קיבל את העריכה של ב׳', a.some((r) => r.name === 'מתכון א ערוך') && !a.some((r) => r.name === 'מתכון א'))
ok('א׳: קיבל את מתכון ב', a.some((r) => r.name === 'מתכון ב'))
ok('א׳: מתכון ג שלו נשמר', a.some((r) => r.name === 'מתכון ג'))

// 5. א׳ מוחק את מתכון ב
await A.reload(); await goBook(A)
await openCard(A, 'מתכון ב'); await sheet(A).getByRole('button', { name: 'הסר מהספר' }).click()
ok('א׳ מחיקה נשמרה', await synced(A))

// 6. ב׳ (גרסה ישנה) משנה את מתכון ג? לא קיים אצלו. מסיר מועדף ומוסיף מתכון ד
const favId = Object.keys((await S(B)).favorites ?? {})[0]
await B.getByRole('navigation').getByText('אוכל').click()
await B.getByRole('tab', { name: 'מועדפים וגיבויים' }).click(); await B.getByRole('tab', { name: 'ספר מתכונים' }).click(); await B.getByRole('button', { name: 'כל הזמנים' }).click()
await openCard(B, 'פסטה ברוטב עגבניות'); await sheet(B).getByRole('button', { name: '★ במועדפים' }).click(); await sheet(B).getByRole('button', { name: 'סגירה' }).click()
await createRecipe(B, 'מתכון ד')
ok('ב׳ ממזג אחרי התנגשות ושומר', await synced(B), server.log.slice(-3).join(', '))

// 7. רענון שני המכשירים והשוואה
await A.reload(); await B.reload()
await until(async () => (await S(A)).customRecipes.length === 4 && (await S(B)).customRecipes.length === 4)
await A.waitForTimeout(1500)
const sa = await S(A), sb = await S(B)
for (const [n, s] of [['א׳', sa], ['ב׳', sb]]) {
  const ids = s.customRecipes.map((r) => r.id)
  ok(`${n}: אין כפילויות`, new Set(ids).size === ids.length, `${ids.length} מתכונים`)
  const live = s.customRecipes.filter((r) => !r.archived).map((r) => r.name).sort()
  ok(`${n}: אין אובדן נתונים`, JSON.stringify(live) === JSON.stringify(['מתכון א ערוך', 'מתכון ג', 'מתכון ד'].sort()), live.join(', '))
  ok(`${n}: מתכון שנמחק לא חזר`, s.customRecipes.find((r) => r.name === 'מתכון ב')?.archived === true)
  ok(`${n}: הסרת המועדף מב׳ נשמרה`, s.favorites?.[favId]?.on === false)
}
// jsonb בשרת האמיתי לא שומר סדר מפתחות, ולכן ההשוואה היא של תוכן (canon), לא של JSON גולמי
{ const srt = (s) => [...s.customRecipes].sort((x, y) => x.id.localeCompare(y.id))
  ok('שני המכשירים זהים בסוף', JSON.stringify(canon(srt(sa))) === JSON.stringify(canon(srt(sb))) && JSON.stringify(canon(sa.favorites)) === JSON.stringify(canon(sb.favorites))) }
await goBook(A); await goBook(B)
const la = await A.locator('.book').innerText(), lb = await B.locator('.book').innerText()
ok('המסך בשני המכשירים לא מציג את מתכון ב', !la.includes('מתכון ב\n') && !lb.includes('מתכון ב\n') && !/מתכון ב(?! )/.test(la.replace('מתכון בלי', '')))
await A.screenshot({ path: 'real-sync-A.png' }); await B.screenshot({ path: 'real-sync-B.png' })
ok('לא נוצרו התנגשויות העדפה בגלל המתכונים', !(sa.mergeConflicts ?? []).length && !(sb.mergeConflicts ?? []).length, JSON.stringify(sa.mergeConflicts ?? []))

// 8. העדפת טעם בצד אחד בלבד + משיכה בחזרה לאפליקציה
await openCard(A, 'טוסט גבינה'); await sheet(A).getByRole('button', { name: 'לא לטעמי' }).click(); await sheet(A).getByRole('button', { name: 'סגירה' }).click()
ok('א׳ שמר ״לא לטעמי״', await synced(A))
await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
ok('ב׳ משך את השינוי בחזרה לאפליקציה, בלי רענון', await until(async () => (await S(B)).prefs.cheese_toast === 'dislike'))
ok('ב׳: שינוי בצד אחד אינו התנגשות', !((await S(B)).mergeConflicts ?? []).length, JSON.stringify((await S(B)).mergeConflicts))
const writesBefore = server.writes
await B.waitForTimeout(2500)
ok('אין לולאת שמירה אחרי משיכה', server.writes === writesBefore, `${server.writes - writesBefore} כתיבות נוספות`)

// 9. כפתור רענון, ושמירת שינוי מקומי שעוד לא נשלח
await openCard(A, 'מתכון ג'); await sheet(A).getByRole('button', { name: /הוסף רכיבים|עריכה/ }).click()
await sheet(A).getByLabel('שם').fill('מתכון ג ערוך'); await sheet(A).getByRole('button', { name: 'שמור מתכון' }).click(); await sheet(A).getByRole('button', { name: 'סגירה' }).click()
ok('א׳ שמר עריכה', await synced(A))
await openCard(B, 'ביצה קשה ולחם'.slice(0, 0) || 'כריך ביצים'); await sheet(B).getByRole('button', { name: 'לא לטעמי' }).click(); await sheet(B).getByRole('button', { name: 'סגירה' }).click()
await B.locator('.sync-chip').click() // מיד, לפני שהשמירה האוטומטית יצאה
ok('ב׳ (כפתור רענון): קיבל את העריכה של א׳', await until(async () => (await S(B)).customRecipes.some((r) => r.name === 'מתכון ג ערוך')))
ok('ב׳: השינוי המקומי שלא נשלח נשמר', (await S(B)).prefs.egg_sandwich === 'dislike')
ok('ב׳ סונכרן אחרי הרענון', await synced(B))
await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
ok('א׳ קיבל את ״לא לטעמי״ של ב׳ בלי התנגשות', await until(async () => (await S(A)).prefs.egg_sandwich === 'dislike') && !((await S(A)).mergeConflicts ?? []).length)
ok('א׳ שמר את ״לא לטעמי״ שלו', (await S(A)).prefs.cheese_toast === 'dislike')

// 10. שני הצדדים שינו את אותה העדפה לערכים סותרים: התנגשות אמיתית
await openCard(A, 'פיתה עם גבינה וירקות'); await sheet(A).getByRole('button', { name: 'מוכן לנסות' }).click(); await sheet(A).getByRole('button', { name: 'סגירה' }).click()
await openCard(B, 'פיתה עם גבינה וירקות'); await sheet(B).getByRole('button', { name: 'לא לטעמי' }).click(); await sheet(B).getByRole('button', { name: 'סגירה' }).click()
await synced(A); await B.waitForTimeout(1500); await synced(B)
const conflictB = (await S(B)).mergeConflicts ?? []
ok('שינוי סותר בשני הצדדים מוצג כהתנגשות', conflictB.length === 1 && conflictB[0].values.join(',') === 'dislike,try', JSON.stringify(conflictB))
await B.screenshot({ path: 'real-sync-B-after-pull.png' })
ok('אין שגיאות בדפדפן', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(results.join('\n'))
console.log('test1 אחרי:', JSON.stringify(summary(await refresh())))
console.log('server:', server.log.join(' → '), `| writes=${server.writes} conflicts=${server.conflicts}`)
await browser.close()
