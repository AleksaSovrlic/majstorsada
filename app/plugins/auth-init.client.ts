import { onAuthStateChanged } from 'firebase/auth'
import { useAuthStore } from '@/stores/auth'

export default defineNuxtPlugin(async () => {
  const { $firebaseAuth } = useNuxtApp()
  const authStore = useAuthStore()

  if (typeof ($firebaseAuth as any).authStateReady === 'function') {
    await ($firebaseAuth as any).authStateReady()
  }
  authStore.currentUser = $firebaseAuth.currentUser
  authStore.isInitialized = true

  onAuthStateChanged($firebaseAuth, (user) => {
    authStore.currentUser = user
  })
})


