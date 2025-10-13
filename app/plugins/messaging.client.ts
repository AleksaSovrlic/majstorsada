import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

export default defineNuxtPlugin(async () => {
  if (!('serviceWorker' in navigator)) return
  const supported = await isSupported().catch(() => false)
  if (!supported) return

  const nuxt = useNuxtApp()
  const runtime = useRuntimeConfig()
  const vapidKey = runtime.public.firebase.vapidKey || ''
  let getAndSaveInFlight: Promise<string | null> | null = null

  // Register SW at root scope (protect with try/catch to avoid 500 if SW script fails)
  let swReg: ServiceWorkerRegistration | null = null
  try {
    swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
  } catch (e) {
    console.warn('[messaging] SW registration failed', e)
    return
  }

  const messaging = getMessaging(nuxt.$firebaseApp)

  const requestPermission = async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) return 'denied'
    return await Notification.requestPermission()
  }

  const getAndSaveFcmToken = async (): Promise<string | null> => {
    if (getAndSaveInFlight) return getAndSaveInFlight
    getAndSaveInFlight = (async () => {
      // kratka pauza ako je SW sveže instaliran
      try { await navigator.serviceWorker.ready } catch {}
      const { useAuthStore } = await import('@/stores/auth')
      const auth = useAuthStore()
      await auth.ensureAuthReady()
      // Role guard: samo majstori registruju i snimaju FCM token pod tradespeople/
      if (!auth.currentUser) return null
      if (auth.role === 'unknown') {
        try { await auth.resolveUserRole() } catch {}
      }
      if (auth.role !== 'tradesperson') {
        return null
      }

      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg! })
      if (!token) return null
      const uid = auth.currentUser.uid
      const tokenId = btoa(token).replace(/\+/g, '-').replace(/\//g, '_')
      const { doc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc } = await import('firebase/firestore')
      const { $firestore } = nuxt
      await setDoc(doc($firestore, 'tradespeople', uid, 'fcmTokens', tokenId), {
        token,
        platform: 'web',
        userAgent: navigator.userAgent,
        origin: location.origin,
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp()
      }, { merge: true })
      // Dedupe: obriši stare tokene za isti uređaj (origin + userAgent)
      try {
        const colRef = collection($firestore, 'tradespeople', uid, 'fcmTokens')
        const q = query(colRef, where('origin', '==', location.origin))
        const snap = await getDocs(q)
        for (const d of snap.docs) {
          const data = d.data() as any
          if (d.id !== tokenId && data?.userAgent === navigator.userAgent) {
            await deleteDoc(d.ref)
          }
        }
      } catch (e) {
        console.warn('[messaging] dedupe tokens skipped', e)
      }
      return token
    })()
    try {
      return await getAndSaveInFlight
    } finally {
      getAndSaveInFlight = null
    }
  }

  onMessage(messaging, (payload) => {
    console.log('[messaging] foreground message', payload)
  })

  // Proaktivna registracija: čim je korisnik prijavljen i dozvola granted
  try {
    const { useAuthStore } = await import('@/stores/auth')
    const auth = useAuthStore()
    await auth.ensureAuthReady()
    if (auth.currentUser && auth.role === 'tradesperson' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await getAndSaveFcmToken()
    }
  } catch (e) {
    console.warn('[messaging] proactive token sync skipped', e)
  }

  return {
    provide: {
      fcm: { requestPermission, getAndSaveFcmToken }
    }
  }
})


