import { accountRoute } from '@/utils/accountRoute'

type Query = Record<string, unknown>
type ClientLoginRedirect = { path: '/login'; query: { from: string } }
const FALLBACK = '/zahtev'
const JOB_ID = /^[A-Za-z0-9_-]{16,100}$/

function singleParameter(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name)
  return values.length === 1 ? values[0] : undefined
}

// Retired links carry untrusted Auth query data. Preserve only destinations and
// business parameters the client pages actually understand; never copy codes.
export function retiredEmailLinkFrom(requested: unknown): string {
  if (typeof requested !== 'string' || requested.length > 2048
    || accountRoute('client', requested) !== requested) return FALLBACK
  let url: URL
  try { url = new URL(requested, 'https://majstorsada.invalid') }
  catch { return FALLBACK }
  if (!['/zahtev', '/potvrda', '/klijent/dashboard'].includes(url.pathname)) return FALLBACK
  const params = new URLSearchParams()
  if (url.pathname === '/zahtev') {
    const tip = singleParameter(url.searchParams, 'tip')?.trim().toLowerCase()
    if (tip && ['vodoinstalater', 'elektricar', 'električar', 'bravar'].includes(tip)) {
      params.set('tip', tip === 'električar' ? 'elektricar' : tip)
    }
    for (const key of ['repeat', 'resume']) {
      const value = singleParameter(url.searchParams, key)
      if (value && JOB_ID.test(value)) params.set(key, value)
    }
  }
  const query = params.toString()
  return url.pathname + (query ? `?${query}` : '')
}

function requestedFrom(query: Query, siteUrl: string): unknown {
  if (Object.prototype.hasOwnProperty.call(query, 'from')) return query.from
  const value = query.continueUrl
  if (typeof value !== 'string' || value.length > 4096) return undefined
  let origin: string
  try {
    const site = new URL(siteUrl)
    if (!['https:', 'http:'].includes(site.protocol)) return undefined
    origin = site.origin
  } catch { return undefined }
  const candidates = [value]
  try {
    const decoded = decodeURIComponent(value)
    if (decoded !== value) candidates.push(decoded)
  } catch { /* A malformed escape cannot become an accepted destination. */ }
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate)
      if (url.origin !== origin || url.username || url.password
        || url.pathname.replace(/\/+$/, '').toLowerCase() !== '/finishlogin') continue
      const from = singleParameter(url.searchParams, 'from')
      if (from !== undefined) return from
    } catch { /* Ignore invalid or unrelated continuation URLs. */ }
  }
  return undefined
}

export function retiredEmailLinkRedirect(path: string, query: Query,
  siteUrl = 'https://majstorsada.rs'): ClientLoginRedirect | null {
  // Firebase's hosted password reset and email verification handlers stay intact.
  if (path.startsWith('/__/auth')) return null
  const retiredPath = path.replace(/\/+$/, '').toLowerCase() === '/finishlogin'
  if (!retiredPath && query.mode !== 'signIn') return null
  return { path: '/login', query: { from: retiredEmailLinkFrom(requestedFrom(query, siteUrl)) } }
}
