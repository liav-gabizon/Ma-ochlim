// offline → online: מכשיר א׳ (test2) מנותק מהרשת, יוצר מתכון; בינתיים מכשיר ב׳ יוצר מתכון אחר בחשבון.
// כשא׳ חוזר לרשת: השינוי שלו נשלח (אירוע online), ובחזרה לאפליקציה הוא מושך את השינוי של ב׳. בלי אובדן ובלי התנגשות.
import { login, loadCreds, ownRow, summary, REF } from './lib.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MJS)
const results = []
const ok = (n, c, x = '') => results.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' · ' + x : ''}`)
const creds = loadCreds()
const probe = await login(creds.test2.email, creds.test2.password)
console.log('test2 לפני:', JSON.stringify(summary(await ownRow(probe))))
const browser = await chromium.launch()
const errors = []
async function device(name) {
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1000, height: 900 } })
  const session = await login(creds.test2.email, creds.test2.password)
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|Load failed/.test(m.text())) errors.push(`${name}: ${m.text()}`) })
  await p.goto('http://localhost:4173/')
  return { p, ctx }
}
const chip = (p) => p.locator('.sync-chip').first().innerText().catch(() => '')
const until = async (fn, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)) } return false }
const S = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('ma-ochlim:v1')))
const names = (s) => (s?.customRecipes ?? []).filter((r) => !r.archived).map((r) => r.name)
const sheet = (p) => p.locator('.sheet').last()
async function createRecipe(p, name) {
  await p.getByRole('navigation').getByText('אוכל').click()
  await p.getByRole('tab', { name: 'ספר מתכונים' }).click()
  await p.getByRole('button', { name: '+ מתכון חדש' }).click()
  await sheet(p).getByLabel('שם').fill(name)
  await sheet(p).getByRole('button', { name: 'שמור מתכון' }).click()
  await sheet(p).getByRole('button', { name: 'סגירה' }).click()
}

const A = await device('A'), B = await device('B')
ok('א׳ ו־ב׳ מחוברים ו״נשמר״', (await until(async () => (await chip(A.p)).includes('נשמר'))) && (await until(async () => (await chip(B.p)).includes('נשמר'))))

// 1. א׳ מנותק מהרשת ויוצר מתכון
await A.ctx.setOffline(true)
await A.p.evaluate(() => window.dispatchEvent(new Event('offline')))
await createRecipe(A.p, 'offline-a')
ok('א׳ בלי רשת: המתכון נשמר במכשיר ולא ״נשמר״ בחשבון', names(await S(A.p)).includes('offline-a') && !(await chip(A.p)).includes('☁︎ נשמר'), await chip(A.p))
{ const seen = new Set(); const t = Date.now(); while (Date.now() - t < 6000) { seen.add(await chip(A.p)); await A.p.waitForTimeout(150) }
  // דרישה: בלי רשת אסור ״☁︎ נשמר״. התוויות שנצפו בפועל (ממתין/אין רשת) מדווחות, שתיהן אמת.
  ok('א׳ בלי רשת: אף פעם לא ״נשמר״ בזמן הניתוק', ![...seen].some((c) => c.includes('☁︎ נשמר')), 'תוויות שנצפו: ' + [...seen].join(' / ')) }
const vBefore = (await ownRow(probe)).version
await A.p.waitForTimeout(2000)
ok('א׳ בלי רשת: לא נשלח לשרת', (await ownRow(probe)).version === vBefore && !names((await ownRow(probe)).state).includes('offline-a'))

// 2. בינתיים ב׳ יוצר מתכון ושומר לחשבון
await createRecipe(B.p, 'online-b')
ok('ב׳ שמר לחשבון בזמן שא׳ מנותק', await until(async () => names((await ownRow(probe))?.state).includes('online-b')))

// 3. א׳ חוזר לרשת: אירוע online שולח, ואז חזרה לאפליקציה מושכת
await A.ctx.setOffline(false)
await A.p.evaluate(() => window.dispatchEvent(new Event('online')))
ok('א׳ חזר לרשת: השינוי שלו הגיע לשרת (אחרי מיזוג עם ב׳)', await until(async () => { const r = await ownRow(probe); const n = names(r?.state); return n.includes('offline-a') && n.includes('online-b') }, 15000))
await A.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
ok('א׳ קיבל את המתכון של ב׳', await until(async () => names(await S(A.p)).includes('online-b')), names(await S(A.p)).join(', '))
ok('א׳: התווית ״נשמר״', await until(async () => (await chip(A.p)).includes('נשמר')), await chip(A.p))
ok('א׳: אין התנגשויות', !((await S(A.p)).mergeConflicts ?? []).length)
await B.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
ok('ב׳ קיבל את המתכון של א׳', await until(async () => names(await S(B.p)).includes('offline-a')), names(await S(B.p)).join(', '))
ok('אין שגיאות בדפדפן', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(results.join('\n'))
console.log('test2 אחרי:', JSON.stringify(summary(await ownRow(probe))), JSON.stringify(names((await ownRow(probe)).state)))
await browser.close()
