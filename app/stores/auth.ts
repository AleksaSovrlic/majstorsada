import { defineStore } from 'pinia'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'

interface AuthState {
  currentUser: User | null
  isInitialized: boolean
  _initPromise: Promise<void> | null
  role: 'admin' | 'tradesperson' | 'client' | 'unknown'
  _lastRoleUid: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    currentUser: null,
    isInitialized: false,
    _initPromise: null,
    role: 'unknown',
    _lastRoleUid: null
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
    async resolveUserRole(): Promise<'admin' | 'tradesperson' | 'client' | 'unknown'> {
      const uid = this.currentUser?.uid || null
      if (!uid) {
        this.role = 'unknown'
        this._lastRoleUid = null
        return this.role
      }
      if (this._lastRoleUid === uid && this.role !== 'unknown') {
        return this.role
      }
      try {
        const { $firestore } = useNuxtApp()
        const { doc, getDoc } = await import('firebase/firestore')
        // 1) Admin has precedence
        const adminDoc = await getDoc(doc($firestore, 'admins', uid))
        if (adminDoc.exists()) {
          this.role = 'admin'
          this._lastRoleUid = uid
          return this.role
        }
        // 2) Tradesperson next
        const tpDoc = await getDoc(doc($firestore, 'tradespeople', uid))
        if (tpDoc.exists()) {
          this.role = 'tradesperson'
          this._lastRoleUid = uid
          return this.role
        }
        // 3) Default to client in all other cases
        this.role = 'client'
        this._lastRoleUid = uid
        return this.role
      } catch (e) {
        console.warn('[auth] resolveUserRole failed', e)
        // Fallback: logged-in users are treated as clients; logged-out handled above
        this.role = uid ? 'client' : 'unknown'
        this._lastRoleUid = uid
        return this.role
      }
    },
    async signIn(email: string, password: string): Promise<void> {
      const { $firebaseAuth } = useNuxtApp()
      const cred = await signInWithEmailAndPassword($firebaseAuth, email, password)
      this.currentUser = cred.user
      await this.resolveUserRole().catch(() => {})
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
      this.role = 'unknown'
      this._lastRoleUid = null
    }
  }
})


