import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { useAuthStore } from '@/stores/auth'

export default defineNuxtPlugin({
  name: 'messaging',
  dependsOn: ['firebase', 'auth-init'],
  enforce: 'post',
  setup(nuxt) {
    const runtime = useRuntimeConfig()
    const fallbackProvide = {
      provide: {
        fcm: {
          requestPermission: async () => 'denied' as NotificationPermission,
          getAndSaveFcmToken: async () => null as string | null
        }
      }
    }
    if (runtime.public.firebase.projectId.startsWith('demo-')) return fallbackProvide
    if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') return fallbackProvide

    // Capture Nuxt/Pinia dependencies before background work crosses an await.
    const auth = useAuthStore()
    const vapidKey = ((runtime.public as any).firebaseVapidKey as string) || ''
    type ReadyMessaging = { messaging: ReturnType<typeof getMessaging>; swReg: ServiceWorkerRegistration }
    let readyPromise: Promise<ReadyMessaging | null> | null = null
    let unsupported = false
    const syncByUser = new WeakMap<object, Promise<string | null>>()

    function ensureMessagingReady(): Promise<ReadyMessaging | null> {
      if (readyPromise) return readyPromise
      readyPromise = (async () => {
        if (!(await isSupported())) { unsupported = true; return null }
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
        const messaging = getMessaging((nuxt as any).$firebaseApp)
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
        return { messaging, swReg }
      })().catch(error => {
        // A later explicit attempt can retry a transient initialization failure.
        readyPromise = null
        console.warn('[messaging] initialization failed', error)
        return null
      })
      return readyPromise
    }

    const requestPermission = async (): Promise<NotificationPermission> => {
      if (unsupported) return 'denied'
      // Keep the browser prompt inside the click's user activation; do not await readiness here.
      return Notification.requestPermission()
    }

    const getAndSaveFcmToken = async (): Promise<string | null> => {
      await auth.ensureAuthReady()
      const user = auth.currentUser
      if (!user || Notification.permission !== 'granted') return null
      const existing = syncByUser.get(user)
      if (existing) return existing
      const isCurrentSession = () => auth.currentUser === user && auth.role === 'tradesperson'
      const request = (async () => {
        try {
          if (auth.role === 'unknown') await auth.resolveUserRole()
          if (!isCurrentSession()) return null
          const ready = await ensureMessagingReady()
          if (!ready || !isCurrentSession()) return null
          // A newly installed worker must activate before PushManager.subscribe.
          await navigator.serviceWorker.ready
          if (!isCurrentSession() || Notification.permission !== 'granted') return null
          const token = await getToken(ready.messaging, { vapidKey, serviceWorkerRegistration: ready.swReg })
          if (!token || !isCurrentSession() || Notification.permission !== 'granted') return null
          const { doc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc } = await import('firebase/firestore')
          if (!isCurrentSession()) return null
          const uid = user.uid
          const tokenId = btoa(token).replace(/\+/g, '-').replace(/\//g, '_')
          const firestore = (nuxt as any).$firestore
          await setDoc(doc(firestore, 'tradespeople', uid, 'fcmTokens', tokenId), {
            token,
            platform: 'web',
            userAgent: navigator.userAgent,
            origin: location.origin,
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp()
          }, { merge: true })
          if (!isCurrentSession()) return null
          try {
            const colRef = collection(firestore, 'tradespeople', uid, 'fcmTokens')
            const q = query(colRef, where('origin', '==', location.origin))
            const snap = await getDocs(q)
            for (const d of snap.docs) {
              if (!isCurrentSession()) return null
              const data = d.data() as any
              if (d.id !== tokenId && data?.userAgent === navigator.userAgent) await deleteDoc(d.ref)
            }
          } catch (error) {
            console.warn('[messaging] dedupe tokens skipped', error)
          }
          return isCurrentSession() ? token : null
        } catch (error) {
          console.warn('[messaging] token sync failed', error)
          return null
        }
      })()
      syncByUser.set(user, request)
      try { return await request } finally {
        if (syncByUser.get(user) === request) syncByUser.delete(user)
      }
    }

    // Start promptly, but never make page hydration wait for push infrastructure.
    // The dashboard and the manual button share this same initialization and token sync.
    void ensureMessagingReady()
    if (auth.currentUser && auth.role === 'tradesperson' && Notification.permission === 'granted') {
      void getAndSaveFcmToken()
    }
    return { provide: { fcm: { requestPermission, getAndSaveFcmToken } } }
  }
})
