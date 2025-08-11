import { useAuthStore } from '@/stores/auth'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const auth = useAuthStore()
  await auth.ensureAuthReady()
  if (!auth.currentUser && to.path.startsWith('/majstor') && to.path !== '/majstor/login') {
    return navigateTo('/majstor/login')
  }
})


