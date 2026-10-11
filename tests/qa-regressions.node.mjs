import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

// No network, auth, push sends, database or personal data: execute actual source only.
const root = process.env.QA_SOURCE_ROOT ?? path.resolve(import.meta.dirname, '..')
const load = (file) => import(pathToFileURL(path.join(root, file)).href)
const { mergeStates, hasUserData, mergeLogs, resolveMergeConflict } = await load('src/engine/sync.ts')
const { RECIPES, LOVED_FOODS, LOVED_RECIPES } = await load('src/data/recipes.ts')
const { generateWeek } = await load('src/engine/plan.ts')
const { dueReminder } = await load('src/notifications.ts')
const server = readFileSync(path.join(root, 'supabase/functions/send-reminders/index.ts'), 'utf8')
const scope = { Intl, Date }
vm.createContext(scope)
vm.runInContext(stripTypeScriptTypes(server.slice(server.indexOf('const SLOTS'), server.indexOf('Deno.serve')) + '\nglobalThis.dueReminders = dueReminders;', { mode: 'strip' }), scope)
const serverDue = scope.dueReminders
const mealModule = path.join(root, 'src/engine/meal.ts')
const replacePlannedState = existsSync(mealModule) ? (await load('src/engine/meal.ts')).replacePlannedState : undefined
const storeSource = readFileSync(path.join(root, 'src/store.ts'), 'utf8')
const action = storeSource.slice(storeSource.indexOf('    replacePlanned('), storeSource.indexOf('    regenerateWeek('))
const actionScope = { replacePlannedState }
vm.createContext(actionScope)
// Execute the actual store action without mocking its updater or replacement logic.
const replace = vm.runInContext(stripTypeScriptTypes(`(function(state, ...args) { const update = fn => { state = fn(state) }; const actions = { ${action} }; actions.replacePlanned(...args); return state; })`, { mode: 'strip' }), actionScope)
const now = new Date('2026-10-04T09:30:00Z')
const date = '2026-10-04'
const profile = { name: 'QA', goal: 'gain', timezone: 'UTC', slotTargets: { morning: 700, outside: 1000, evening: 800 }, mealTimes: { morning: '09:00', outside: '14:00', evening: '20:00' }, allergies: 'none', meatDairyWaitHours: null, tone: 'calm', motivationOn: false, personalLine: 'QA', showWeightOnHome: false, heightCm: null, weightGoalKg: null }
const base = () => ({ schema: 1, profile: structuredClone(profile), goals: [{ kcal: 2500, effectiveFrom: date, setAt: '2026-10-04T08:00:00Z' }], prefs: Object.fromEntries([...LOVED_FOODS, ...LOVED_RECIPES].map(id => [id, 'love'])), rejections: {}, alwaysGood: [], customRecipes: [], plan: [{ date, slot: 'morning', recipeId: 'toast_eggs', multiplier: 1, status: 'planned' }], log: [], dayComplete: {}, pantry: {}, shopping: { confirmed: null, confirmedAt: null, bought: {} }, weights: [], notifications: { enabled: true, timesConfirmed: true, serverPush: true, quietStart: '23:00', quietEnd: '07:30', dailyCap: 6, followUp: false, snoozeMinutes: 15, genericLockText: true }, sent: [], snoozed: {}, ideas: [] })
const conflict = (s, field, key) => s.mergeConflicts?.find(c => c.field === field && c.key === key)

test('distinct preferences, bought marks and favourites from both sides survive repeated merge', () => {
  const l = base(), r = base()
  l.prefs.qa_local = 'try'; r.prefs.qa_remote = 'love'
  l.shopping.bought.bread = true; r.shopping.bought.egg = true
  l.alwaysGood = ['toast_eggs', 'yogurt_banana']; r.alwaysGood = ['yogurt_banana', 'cornflakes']
  const m = mergeStates(l, r)
  assert.equal(m.prefs.qa_remote, 'love'); assert.equal(m.prefs.qa_local, 'try')
  assert.deepEqual(m.shopping.bought, { bread: true, egg: true })
  assert.deepEqual([...m.alwaysGood].sort(), ['cornflakes', 'toast_eggs', 'yogurt_banana'])
  assert.deepEqual(mergeStates(m, r), m)
  assert.deepEqual(mergeStates(m, m), m)
})

test('preferences-only changes are user data; stock default preferences are not', () => {
  const s = base(); assert.equal(hasUserData(s), false)
  s.prefs.bread = 'dislike'; assert.equal(hasUserData(s), true)
})

test('shopping-only and favourites-only edits are user data', () => {
  const s = base(); s.shopping.bought.egg = false; assert.equal(hasUserData(s), true)
  const other = base(); other.alwaysGood = ['toast_eggs']; assert.equal(hasUserData(other), true)
})

test('conflicting scalar intentions are retained and surfaced, stable under merge order and retry', () => {
  const l = base(), r = base()
  l.prefs.bread = 'love'; r.prefs.bread = 'dislike'
  l.shopping.bought.egg = false; r.shopping.bought.egg = true
  const m = mergeStates(l, r)
  assert.deepEqual(conflict(m, 'prefs', 'bread')?.values, ['dislike', 'love'])
  assert.deepEqual(conflict(m, 'shopping.bought', 'egg')?.values, [false, true])
  assert.equal(m.prefs.bread, 'dislike'); assert.equal(m.shopping.bought.egg, false)
  assert.deepEqual(mergeStates(m, r), m)
  assert.deepEqual(mergeStates(r, l), m)
  const third = base(); third.prefs.bread = 'try'
  assert.deepEqual(conflict(mergeStates(third, m), 'prefs', 'bread')?.values, ['dislike', 'try', 'love'])
})

test('explicit choice clears only its conflict and persists through JSON round-trip', () => {
  const l = base(), r = base(); l.prefs.bread = 'dislike'; r.prefs.bread = 'love'; r.shopping.bought.egg = true; l.shopping.bought.egg = false
  const m = mergeStates(l, r)
  assert.deepEqual(conflict(m, 'prefs', 'bread')?.values, ['dislike', 'love'])
  assert.equal(typeof resolveMergeConflict, 'function')
  const choice = resolveMergeConflict(m, 'prefs', 'bread', 'love')
  assert.equal(choice.prefs.bread, 'love'); assert.equal(conflict(choice, 'prefs', 'bread'), undefined)
  assert.deepEqual(conflict(choice, 'shopping.bought', 'egg')?.values, [false, true])
  const bought = resolveMergeConflict(choice, 'shopping.bought', 'egg', true)
  assert.equal(bought.shopping.bought.egg, true); assert.equal(bought.mergeConflicts.length, 0)
  assert.equal(bought.pantry.egg, true)
  assert.deepEqual(JSON.parse(JSON.stringify(bought)), bought)
})

test('union of more than three favourites preserves every distinct item without duplication', () => {
  const l = base(), r = base(); l.alwaysGood = ['a', 'b', 'c']; r.alwaysGood = ['b', 'd', 'e']
  const m = mergeStates(l, r); assert.deepEqual(m.alwaysGood, ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(mergeStates(m, r).alwaysGood, m.alwaysGood)
})

test('existing log idempotency and eaten status merge are preserved', () => {
  const e = { id: 'qa1', idemKey: 'same', loggedAt: now.toISOString(), version: 1 }
  assert.equal(mergeLogs([e], [{ ...e, id: 'qa2' }]).length, 1)
  const l = base(), r = base(); r.plan[0].status = 'eaten'
  assert.equal(mergeStates(l, r).plan[0].status, 'eaten')
})

test('baseline untouched planned meal remains due in client and server', () => {
  const s = base(); assert.equal(dueReminder(s, now)?.slot, 'morning'); assert.equal(serverDue(s, now, []).length, 1)
})

test('actual replacePlanned action keeps one reminder for the new meal without logging food, on client and server', () => {
  const s = replace(base(), date, 'morning', 'yogurt_banana', 1)
  assert.equal(s.plan[0].status, 'planned'); assert.equal(s.log.length, 0)
  assert.equal('reminderCancelled' in s.plan[0], false)
  assert.equal(dueReminder(s, now)?.key, `${date}:morning:yogurt_banana`)
  assert.deepEqual([...serverDue(s, now, []).map(r => r.key)], [`${date}:morning:yogurt_banana`])
  assert.equal(serverDue(s, new Date('2026-10-04T10:00:00Z'), []).length, 1)
  assert.equal(serverDue(s, new Date('2026-10-04T11:01:00Z'), []).length, 0)
})

test('a reminder already sent for the slot is not repeated after one or more swaps, on client and server', () => {
  const sentKey = `${date}:morning:toast_eggs`
  const s = base(); s.sent = [{ key: sentKey, at: '2026-10-04T09:00:00Z' }]
  const once = replace(s, date, 'morning', 'cornflakes', 1)
  const twice = replace(once, date, 'morning', 'yogurt_banana', 1)
  assert.equal(dueReminder(once, now), null); assert.equal(dueReminder(twice, now), null)
  assert.equal(serverDue(once, now, [sentKey]).length, 0); assert.equal(serverDue(twice, now, [sentKey]).length, 0)
  assert.equal(serverDue(twice, new Date('2026-10-04T10:00:00Z'), [sentKey]).length, 0)
  // a reminder still in flight ("sending") counts as sent; a reminder sent yesterday does not
  assert.equal(serverDue(twice, now, [`${date}:morning:cornflakes`]).length, 0)
  assert.equal(serverDue(twice, now, []).length, 1)
})

test('the slot reminder follows the current meal through stale-device merges in either direction and reload', () => {
  const old = base(); const swapped = replace(old, date, 'morning', 'cornflakes', 1)
  for (const state of [mergeStates(old, swapped), mergeStates(swapped, old)]) {
    const reopened = JSON.parse(JSON.stringify(state))
    const meal = reopened.plan.find(p => p.date === date && p.slot === 'morning')
    assert.equal('reminderCancelled' in meal, false)
    assert.equal(dueReminder(reopened, now)?.key, `${date}:morning:${meal.recipeId}`)
    assert.deepEqual([...serverDue(reopened, now, []).map(r => r.key)], [`${date}:morning:${meal.recipeId}`])
  }
})

test('weekly regeneration keeps one reminder per slot; snooze re-sends once per snooze time even across a swap', () => {
  const s = replace(base(), date, 'morning', 'cornflakes', 1)
  s.plan = generateWeek(date, RECIPES, { profile: s.profile, prefs: s.prefs, rejections: s.rejections }, s.plan)
  const meal = s.plan.find(p => p.date === date && p.slot === 'morning')
  assert.equal(serverDue(s, now, []).length, 1)
  const until = '2026-10-04T09:10:00Z'
  s.snoozed[`${date}:morning`] = until
  const snoozeKey = `${date}:morning:${meal.recipeId}:snz:${until}`
  assert.equal(dueReminder(s, now)?.key, snoozeKey)
  assert.deepEqual([...serverDue(s, now, [`${date}:morning:toast_eggs`]).map(r => r.key)], [snoozeKey])
  assert.equal(serverDue(s, new Date('2026-10-04T09:05:00Z'), []).length, 0)
  // the snoozed reminder was already sent (for the recipe planned at the time): a swap does not re-send it
  const sentSnooze = `${date}:morning:toast_eggs:snz:${until}`
  assert.equal(serverDue(s, now, [sentSnooze]).length, 0)
  s.sent = [{ key: sentSnooze, at: '2026-10-04T09:10:30Z' }]
  assert.equal(dueReminder(s, now), null)
})

test('other slot and following day remain eligible after a sent reminder', () => {
  const s = base(); const sent = [`${date}:morning:toast_eggs`]
  s.plan.push({ date, slot: 'outside', recipeId: 'out_falafel', multiplier: 1, status: 'planned' })
  assert.equal(serverDue(s, new Date('2026-10-04T14:30:00Z'), sent)[0]?.slot, 'outside')
  s.plan.push({ date: '2026-10-05', slot: 'morning', recipeId: 'toast_eggs', multiplier: 1, status: 'planned' })
  assert.equal(serverDue(s, new Date('2026-10-05T09:30:00Z'), [])[0]?.slot, 'morning')
})

test('eaten, skipped, quiet hours and expiry still suppress reminders', () => {
  for (const status of ['eaten', 'partial', 'skipped', 'swapped']) {
    const s = base(); s.plan[0].status = status
    assert.equal(dueReminder(s, now), null); assert.equal(serverDue(s, now, []).length, 0)
  }
  assert.equal(serverDue(base(), new Date('2026-10-04T11:01:00Z'), []).length, 0)
  const s = base(); s.notifications.quietStart = '09:00'; s.notifications.quietEnd = '10:00'
  assert.equal(serverDue(s, now, []).length, 0)
})
