import { defineStore } from 'pinia'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from 'firebase/auth'
import { useApi } from '@/utils/api'
import type { AccountRole } from '@/utils/accountRoute'
import { useTradespersonStore } from '@/stores/tradesperson'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = shallowRef<User | null>(null)
  const isInitialized = ref(false)
  const role = ref<AccountRole>('unknown')
  let initPromise: Promise<void> | null = null
  let rolePromise: Promise<AccountRole> | null = null
  let roleUid: string | null = null
  const api = useApi()
  const { $firebaseAuth } = useNuxtApp()
  function setUser(user: User | null) {
    if (currentUser.value?.uid !== user?.uid) {
      const tp = useTradespersonStore()
      tp.unsubscribe()
      tp.profile = null
      role.value = 'unknown'
      roleUid = null
      rolePromise = null
    }
    currentUser.value = user
  }
  function ensureAuthReady(): Promise<void> {
    if (isInitialized.value) return Promise.resolve()
    if (!initPromise) initPromise = new Promise<void>((resolve) => {
      onAuthStateChanged($firebaseAuth, user => {
        setUser(user)
        isInitialized.value = true
        resolve()
      })
    })
    return initPromise
  }
  async function resolveUserRole(force = false): Promise<AccountRole> {
    await ensureAuthReady()
    const user = $firebaseAuth.currentUser
    setUser(user)
    if (!user) return 'unknown'
    if (!force && roleUid === user.uid && role.value !== 'unknown') return role.value
    if (rolePromise) {
      await rolePromise
      if (!force) return role.value
      if ($firebaseAuth.currentUser?.uid !== user.uid) throw new Error('Nalog je promenjen.')
    }
    const request = (async () => {
      try {
        const result = await api<{ role: AccountRole; refreshToken?: boolean }>('resolveAccount')
        if (result.refreshToken) await user.getIdToken(true)
        if ($firebaseAuth.currentUser?.uid !== user.uid) throw new Error('Nalog je promenjen.')
        role.value = result.role
        roleUid = user.uid
        return result.role
      } catch (error) {
        if ($firebaseAuth.currentUser?.uid === user.uid) { role.value = 'unknown'; roleUid = null }
        throw error
      }
    })()
    rolePromise = request
    try { return await request } finally { if (rolePromise === request) rolePromise = null }
  }
  async function signIn(email: string, password: string) {
    const credential = await signInWithEmailAndPassword($firebaseAuth, email, password)
    setUser(credential.user)
    await resolveUserRole()
  }
  async function signOut() {
    await firebaseSignOut($firebaseAuth)
    setUser(null)
  }
  return { currentUser, isInitialized, role, ensureAuthReady, resolveUserRole, signIn, signOut }
})
