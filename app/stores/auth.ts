import { defineStore } from 'pinia'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'

interface AuthState {
  currentUser: User | null
  isInitialized: boolean
  _initPromise: Promise<void> | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    currentUser: null,
    isInitialized: false,
    _initPromise: null
  }),
  actions: {
    ensureAuthReady(): Promise<void> {
      if (this.isInitialized && this._initPromise == null) {
        return Promise.resolve()
      }
      if (this._initPromise) {
        return this._initPromise
      }
      const { $firebaseAuth } = useNuxtApp()
      this._initPromise = (async () => {
        // Wait for initial auth state to load from persistence (multi-tab safe)
        if (typeof ($firebaseAuth as any).authStateReady === 'function') {
          await ($firebaseAuth as any).authStateReady()
        } else {
          // Fallback: wait one onAuthStateChanged tick
          await new Promise<void>((resolve) => {
            const unsub = onAuthStateChanged($firebaseAuth, () => {
              unsub()
              resolve()
            })
          })
        }
        this.currentUser = $firebaseAuth.currentUser
        this.isInitialized = true
        // Attach a persistent listener to keep currentUser in sync
        if (!(this as any)._listenerAttached) {
          onAuthStateChanged($firebaseAuth, (user) => {
            this.currentUser = user
          })
          ;(this as any)._listenerAttached = true
        }
        this._initPromise = null
      })()
      return this._initPromise
    },
    async signIn(email: string, password: string): Promise<void> {
      const { $firebaseAuth } = useNuxtApp()
      const cred = await signInWithEmailAndPassword($firebaseAuth, email, password)
      this.currentUser = cred.user
      try {
        const { useTradespersonStore } = await import('@/stores/tradesperson')
        const tp = useTradespersonStore()
        tp.loadProfile(cred.user.uid)
      } catch (e) {
        console.warn('[auth] Failed to load tradesperson profile after login', e)
      }
    },
    async signOut(): Promise<void> {
      const { $firebaseAuth } = useNuxtApp()
      await firebaseSignOut($firebaseAuth)
      this.currentUser = null
    }
  }
})


