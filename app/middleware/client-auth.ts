import { useAuthStore } from '@/stores/auth'
import { accountRoute } from '@/utils/accountRoute'
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const auth = useAuthStore()
  await auth.ensureAuthReady()
  if (!auth.currentUser) return navigateTo('/login?from=' + encodeURIComponent(to.fullPath))
  try {
    const role = await auth.resolveUserRole()
    if (role !== 'client') return navigateTo(accountRoute(role))
  } catch { return navigateTo('/account') }
})
