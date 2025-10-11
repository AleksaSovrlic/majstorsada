import { useAuthStore } from '@/stores/auth'

export default defineNuxtPlugin({
  name: 'auth-init',
  dependsOn: ['firebase'],
  enforce: 'post',
  async setup() {
    const authStore = useAuthStore()
    await authStore.ensureAuthReady()
    await authStore.resolveUserRole().catch(() => {})
  }
})


