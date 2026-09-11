export type AccountRole = 'admin' | 'tradesperson' | 'client' | 'unregistered' | 'unknown'
export function accountRoute(role: AccountRole, requested?: unknown): string {
  const home = role === 'admin' ? '/admin/dashboard' : role === 'tradesperson' ? '/majstor/dashboard' : role === 'client' ? '/zahtev' : '/account'
  if (typeof requested !== 'string' || !requested.startsWith('/') || requested.startsWith('//') || /[\\\s]/.test(requested)) return home
  const path = requested.split(/[?#]/)[0] || ''
  const allowed = role === 'client' ? ['/zahtev', '/potvrda', '/klijent/dashboard'] : role === 'admin' ? ['/admin/dashboard'] : role === 'tradesperson' ? ['/majstor/dashboard', '/majstor/podesavanja', '/majstor/recenzije'] : []
  return allowed.includes(path) ? requested : home
}

export function requiredRole(path: string): 'client' | 'tradesperson' | 'admin' | null {
  if (['/zahtev', '/potvrda'].includes(path) || path.startsWith('/klijent/')) return 'client'
  if (path.startsWith('/admin/') && path !== '/admin/login') return 'admin'
  if (/^\/majstor\/(dashboard|podesavanja|recenzije)(\/|$)/.test(path)) return 'tradesperson'
  return null
}
