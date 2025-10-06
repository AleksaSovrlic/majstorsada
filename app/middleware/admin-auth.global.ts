import { useAuthStore } from '@/stores/auth'
import { doc, getDoc } from 'firebase/firestore'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const isAdminRoute = to.path.startsWith('/admin')
  if (!isAdminRoute) return

  const auth = useAuthStore()
  await auth.ensureAuthReady()

  const isLogin = to.path === '/admin/login'
  const { $firestore } = useNuxtApp()

  if (!auth.currentUser) {
    if (!isLogin) return navigateTo('/admin/login')
    return
  }

  const adminDocRef = doc($firestore, 'admins', auth.currentUser.uid)
  const adminDoc = await getDoc(adminDocRef)
  const isAdmin = adminDoc.exists()

  if (!isAdmin && !isLogin) {
    return navigateTo('/admin/login')
  }
  if (isAdmin && isLogin) {
    return navigateTo('/admin/dashboard')
  }
})


