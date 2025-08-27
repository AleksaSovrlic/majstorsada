import { useAuthStore } from '@/stores/auth'

const ADMIN_EMAIL = 'aleksa.admin@majstorsada.com'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const auth = useAuthStore()
  await auth.ensureAuthReady()

  const isAdmin = auth.currentUser?.email === ADMIN_EMAIL
  const isLogin = to.path === '/admin/login'

  if (!isAdmin && !isLogin && to.path.startsWith('/admin')) {
    return navigateTo('/admin/login')
  }
  if (isAdmin && isLogin) {
    return navigateTo('/admin/dashboard')
  }
})


