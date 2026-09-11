import { useAuthStore } from '@/stores/auth'
import { accountRoute } from '@/utils/accountRoute'
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server || !to.path.startsWith('/admin')) return
  const auth = useAuthStore()
  await auth.ensureAuthReady()
  if (!auth.currentUser) { if (to.path !== '/admin/login') return navigateTo('/admin/login'); return }
  try {
    const role = await auth.resolveUserRole()
    if (role !== 'admin' || to.path === '/admin/login') return navigateTo(accountRoute(role))
  } catch { return navigateTo('/account') }
})
