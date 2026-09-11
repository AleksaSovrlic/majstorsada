import { useApi } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
export async function ensureClientProfile(_uid?: string, _email?: string) {
  const auth = useAuthStore()
  const api = useApi()
  const role = await auth.resolveUserRole(true)
  if (role === 'unregistered') {
    await api('completeRegistration', { role: 'client' })
    await auth.resolveUserRole(true)
  }
}
