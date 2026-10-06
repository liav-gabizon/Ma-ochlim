// פרוטוקול השמירה של src/cloud.ts (update עם eq version) מול Supabase האמיתי, בלי ממשק:
// שתי התחברויות נפרדות של test1 (״מכשיר א׳״ ו״מכשיר ב׳״) מול השורה של test1 בלבד.
import { sb, login, loadCreds, ownRow, summary } from './lib.mjs'
const c = loadCreds(), out = []
const rec = (n, pass, d) => out.push(`${pass ? 'PASS' : 'FAIL'} ${n} · ${d}`)
const A = await login(c.test1.email, c.test1.password), B = await login(c.test1.email, c.test1.password)
const uid = A.user.id
const save = (s, state, base) => sb(`/rest/v1/app_state?user_id=eq.${uid}&version=eq.${base}&select=version`, { method: 'PATCH', token: s.access_token, body: { state, version: base + 1 }, headers: { Prefer: 'return=representation' } })
const row0 = await ownRow(A)
rec('שתי התחברויות נפרדות לאותו חשבון', A.access_token !== B.access_token && B.user.id === uid, 'שני JWT שונים, אותו user_id')
rec('שורת test1 קיימת', !!row0, JSON.stringify(summary(row0)))
const base = row0.version, st = row0.state ?? {}
const recipe = (id, name) => ({ id, name, ingredients: [], servings: null, timeMin: null, timeMax: null })
let r = await save(A, { ...st, customRecipes: [...(st.customRecipes ?? []), recipe('probe-a', 'בדיקת שרת א')] }, base)
rec('א׳ שומר על גרסה בסיס → גרסה +1', r.status === 200 && r.json.length === 1 && r.json[0].version === base + 1, `HTTP ${r.status} ${JSON.stringify(r.json)}`)
const bRead = await ownRow(B)
rec('ב׳ קורא את השינוי של א׳', bRead.version === base + 1 && bRead.state.customRecipes.some((x) => x.id === 'probe-a'), JSON.stringify(summary(bRead)))
r = await save(B, { ...st, customRecipes: [recipe('probe-b', 'בדיקת שרת ב')] }, base)
rec('ב׳ שומר על גרסה ישנה → 0 שורות (התנגשות, לא דריסה)', r.status === 200 && r.json.length === 0, `HTTP ${r.status} ${JSON.stringify(r.json)}`)
const afterStale = await ownRow(A)
rec('השינוי של א׳ לא נדרס', afterStale.version === base + 1 && afterStale.state.customRecipes.some((x) => x.id === 'probe-a') && !afterStale.state.customRecipes.some((x) => x.id === 'probe-b'), JSON.stringify(summary(afterStale)))
const merged = { ...afterStale.state, customRecipes: [...afterStale.state.customRecipes, recipe('probe-b', 'בדיקת שרת ב')] }
r = await save(B, merged, afterStale.version)
rec('ב׳ ממזג ושומר על הגרסה העדכנית → גרסה +1', r.status === 200 && r.json.length === 1 && r.json[0].version === base + 2, `HTTP ${r.status} ${JSON.stringify(r.json)}`)
const fin = await ownRow(A)
rec('א׳ רואה את שני המתכונים', ['probe-a', 'probe-b'].every((id) => fin.state.customRecipes.some((x) => x.id === id)), JSON.stringify(summary(fin)))
r = await sb('/rest/v1/app_state', { method: 'POST', token: B.access_token, body: { user_id: uid, state: {}, version: 1 } })
rec('insert כפול לאותו משתמש → 23505 (הלקוח עובר למשיכה)', r.status === 409 && r.json?.code === '23505', `HTTP ${r.status} ${r.json?.code}`)
// החזרת השורה למצב שלפני הבדיקה (בלי מתכוני probe)
r = await save(A, st, fin.version)
rec('החזרת המצב הקודם', r.status === 200 && r.json.length === 1, `HTTP ${r.status} v${r.json?.[0]?.version}`)
console.log(out.join('\n'))
