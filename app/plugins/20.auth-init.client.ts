import { onAuthStateChanged } from 'firebase/auth'
import { useAuthStore } from '@/stores/auth'

export default defineNuxtPlugin({
  name: 'auth-init',
  dependsOn: ['firebase'],
  enforce: 'post',
  async setup() {
    const nuxtApp = useNuxtApp()
    const $firebaseAuth = (nuxtApp as any).$firebaseAuth
    if (!$firebaseAuth) {
      console.warn('[auth-init] $firebaseAuth is not available yet, skipping init')
      return
    }
    const authStore = useAuthStore()
    if (typeof ($firebaseAuth as any).authStateReady === 'function') {
      await ($firebaseAuth as any).authStateReady()
    }
    authStore.currentUser = $firebaseAuth.currentUser
    authStore.isInitialized = true
    onAuthStateChanged($firebaseAuth, (user) => {
      authStore.currentUser = user
    })
  }
})


