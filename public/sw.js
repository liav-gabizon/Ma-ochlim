// Service worker: מטמון לעבודה ללא רשת ופתיחת הארוחה הנכונה מלחיצה על התראה.
const CACHE = 'ma-ochlim-v3'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  // רק קבצי האפליקציה עצמה נשמרים במטמון; בקשות לשרת החשבון עוברות כרגיל
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy))
        return res
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  )
})
// התראות מהשרת (Web Push) מגיעות גם כשהאפליקציה סגורה והמכשיר נעול
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  e.waitUntil(
    self.registration.showNotification(d.title || 'מה אוכלים', {
      body: d.body || 'זמן לאכול',
      tag: d.tag || 'meal',
      data: { slot: d.slot },
      icon: './icon-192.png',
      badge: './icon-192.png',
    }),
  )
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const slot = e.notification.data && e.notification.data.slot
  const url = slot ? `./?meal=${slot}` : './'
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) {
        c.postMessage({ type: 'open-meal', slot })
        return c.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
