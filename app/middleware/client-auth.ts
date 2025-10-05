import { useAuthStore } from '@/stores/auth'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const auth = useAuthStore()
  await auth.ensureAuthReady()
  if (!auth.currentUser) {
    const target = encodeURIComponent(to.fullPath)
    return navigateTo(`/login?from=${target}`)
  }
})


