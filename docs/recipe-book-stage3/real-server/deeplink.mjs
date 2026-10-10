// לחיצה על התראה פותחת את הארוחה הנכונה: בודק את צד האפליקציה של sw.js (notificationclick).
// שני מסלולים: (1) פתיחה דרך ?meal=evening; (2) הודעת postMessage {type:'open-meal'} מה־service worker.
import { login, loadCreds, REF } from './lib.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MJS)
const results = []
const ok = (n, c, x = '') => results.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' · ' + x : ''}`)
const creds = loadCreds()
const browser = await chromium.launch()
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1000, height: 900 } })
const session = await login(creds.test2.email, creds.test2.password)
await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
const p = await ctx.newPage()
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)) } return false }
await p.goto('http://localhost:4173/')
// מתזמנים ארוחת ערב להיום דרך האפליקציה: לוקחים מתכון מהספר ומוסיפים לתכנון
await until(async () => (await p.locator('.sync-chip').first().innerText().catch(() => '')).includes('נשמר'))
// שותלים ישירות ב־state המקומי תכנון לארוחת ערב היום עם מתכון קיים, ואז מרעננים
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('ma-ochlim:v1'))
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  s.plan = [...(s.plan || []).filter((x) => !(x.date === d && x.slot === 'evening')), { date: d, slot: 'evening', status: 'planned', recipeId: 'toast_eggs', reminderCancelled: false }]
  localStorage.setItem('ma-ochlim:v1', JSON.stringify(s))
})
// מסלול 1: פתיחה עם ?meal=evening (כמו openWindow מה־service worker)
await p.goto('http://localhost:4173/?meal=evening')
const overlayOpen = await until(async () => await p.locator('.sheet').count() > 0)
const overlayText = overlayOpen ? await p.locator('.sheet').last().innerText().catch(() => '') : ''
ok('לחיצה על התראה (‎?meal=evening) פותחת מסך ארוחה', overlayOpen, overlayText.replace(/\n/g, ' ').slice(0, 60))
ok('הכתובת נוקתה אחרי הפתיחה (בלי ?meal)', !(new URL(p.url()).searchParams.get('meal')), p.url().replace('http://localhost:4173', ''))
// מסלול 2: הודעת open-meal מה־service worker בזמן שהאפליקציה פתוחה
await p.goto('http://localhost:4173/')
await p.waitForTimeout(500)
await p.evaluate(() => {
  const ev = new MessageEvent('message', { data: { type: 'open-meal', slot: 'evening' } })
  navigator.serviceWorker.dispatchEvent ? navigator.serviceWorker.dispatchEvent(ev) : window.dispatchEvent(ev)
})
const msgOpen = await until(async () => await p.locator('.sheet').count() > 0, 4000)
ok('הודעת open-meal מה־service worker פותחת את הארוחה', msgOpen, 'overlay=' + msgOpen)
console.log(results.join('\n'))
await browser.close()
