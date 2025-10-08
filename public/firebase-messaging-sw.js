/* eslint-disable no-undef */
// Firebase Cloud Messaging Service Worker (compat) - robust init and data-only render
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

let messaging = null
try {
  if (!firebase.apps || firebase.apps.length === 0) {
    // IMPORTANT: senderId iz istog projekta kao frontend i Admin SDK
    firebase.initializeApp({ messagingSenderId: '41940311094' })
  }
  messaging = firebase.messaging()
} catch (e) {
  // Nemoj rušiti SW evaluaciju; samo zabeleži u globalni kontekst
  self.__SW_MESSAGING_INIT_ERROR__ = (e && e.message) || 'init-failed'
}

self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()) })

if (messaging && messaging.onBackgroundMessage) {
  messaging.onBackgroundMessage((payload) => {
    const data = payload && payload.data ? payload.data : {}
    const title = data.title || 'Novi posao'
    const options = {
      body: data.body || 'Pogledajte detalje u MajstorSada',
      icon: '/favicon.ico',
      data
    }
    self.registration.showNotification(title, options)
  })
  // Mark Messaging ready so push fallback can avoid duplicates
  self.__SW_MESSAGING_READY__ = true
}

// Fallback: handle push if Messaging wasn't ready in time (race condition safety net)
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    try {
      if (self.__SW_MESSAGING_READY__) return
      if (!event.data) return
      let json = null
      try { json = event.data.json() } catch (e) { /* ignore non-JSON */ }
      const raw = json || {}
      const data = raw.data || raw.notification || raw
      const title = (data && data.title) || 'Novi posao'
      const options = {
        body: (data && data.body) || 'Pogledajte detalje u MajstorSada',
        icon: '/favicon.ico',
        data: data || {}
      }
      await self.registration.showNotification(title, options)
    } catch (e) {
      // swallow
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification && event.notification.data && event.notification.data.link) || '/majstor/dashboard'
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if ('focus' in client) { client.focus(); return }
    }
    await clients.openWindow(link)
  })())
})


