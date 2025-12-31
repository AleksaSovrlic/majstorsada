import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

export default defineNuxtPlugin({
  name: 'messaging',
  dependsOn: ['firebase'],
  enforce: 'post',
  async setup(nuxt) {
    const fallbackProvide = {
      provide: {
        fcm: {
          requestPermission: async () => 'denied' as NotificationPermission,
          getAndSaveFcmToken: async () => null as string | null
        }
      }
    }

    if (!('serviceWorker' in navigator)) return fallbackProvide
    const supported = await isSupported().catch(() => false)
    if (!supported) return fallbackProvide

    const runtime = useRuntimeConfig()
    const vapidKey = ((runtime.public as any).firebaseVapidKey as string) || ''
    let getAndSaveInFlight: Promise<string | null> | null = null

    // Register SW at root scope (protect with try/catch to avoid 500 if SW script fails)
    let swReg: ServiceWorkerRegistration | null = null
    try {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
    } catch (e) {
      console.warn('[messaging] SW registration failed', e)
      return fallbackProvide
    }

    const messaging = getMessaging((nuxt as any).$firebaseApp)

    const requestPermission = async (): Promise<NotificationPermission> => {
      if (!('Notification' in window)) return 'denied'
      return await Notification.requestPermission()
    }

    const getAndSaveFcmToken = async (): Promise<string | null> => {
      if (getAndSaveInFlight) return getAndSaveInFlight
      getAndSaveInFlight = (async () => {
        try { await navigator.serviceWorker.ready } catch {}
        const { useAuthStore } = await import('@/stores/auth')
        const auth = useAuthStore()
        await auth.ensureAuthReady()
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
        const firestore = (nuxt as any).$firestore
        await setDoc(doc(firestore, 'tradespeople', uid, 'fcmTokens', tokenId), {
          token,
          platform: 'web',
          userAgent: navigator.userAgent,
          origin: location.origin,
          createdAt: serverTimestamp(),
          lastSeenAt: serverTimestamp()
        }, { merge: true })
        // Dedupe: obriši stare tokene za isti uređaj (origin + userAgent)
        try {
          const colRef = collection(firestore, 'tradespeople', uid, 'fcmTokens')
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
      if (import.meta.dev) {
        console.log('[messaging] foreground message', payload)
      }
      try {
        // If a Majstor tab is open but not visible/focused, FCM may still deliver the message
        // to the page (onMessage) instead of the service worker. In that case, show a
        // browser notification to preserve the expected "background" UX.
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        const isHidden = typeof document !== 'undefined' && document.visibilityState !== 'visible'
        const noFocus = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? !document.hasFocus() : false
        if (!isHidden && !noFocus) return

        const data: any = (payload as any)?.data || {}
        const title = (data?.title || 'Novi posao').toString()
        const body = (data?.body || 'Pogledajte detalje u MajstorSada').toString()
        const link = (data?.link || '/majstor/dashboard').toString()
        const n = new Notification(title, { body, data: { ...data, link }, icon: '/favicon.ico' })
        n.onclick = () => {
          try { window.focus() } catch { /* noop */ }
          try { window.location.href = link } catch { /* noop */ }
          try { n.close() } catch { /* noop */ }
        }
      } catch {
        // ignore
      }
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
  }
})


