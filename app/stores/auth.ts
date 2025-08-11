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
      this._initPromise = new Promise<void>((resolve) => {
        onAuthStateChanged($firebaseAuth, (user) => {
          this.currentUser = user
          this.isInitialized = true
          resolve()
          this._initPromise = null
        })
      })
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


