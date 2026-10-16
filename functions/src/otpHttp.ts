import { isIP } from 'node:net'
import { HttpsError } from 'firebase-functions/v2/https'
import { normalizeOtpEmail } from './otpPolicy'

export interface OtpServiceBoundary {
  request(data: { requestId: string; email: string; sessionSecret: string }, ip: string): Promise<any>
  verify(data: { requestId: string; sessionSecret: string; code: string }, ip: string): Promise<any>
}
type BotContext = { requestId: string; ip: string }
interface HandlerConfig {
  operation: 'request' | 'verify'
  enabled: () => boolean
  allowedEmails?: () => string[] | undefined
  serviceFactory: () => OtpServiceBoundary | Promise<OtpServiceBoundary>
  verifyBot?: (token: string, context: BotContext) => Promise<void>
  allowedOrigins?: string[]
  trustedProxyHops?: () => number
  getClientIp?: (req: any) => string
  demo?: boolean | (() => boolean)
  now?: () => number
  onInternalError?: (code: string) => void
  diagnostics?: (req: any, res: any) => Promise<void>
}
const unavailable = () => new HttpsError('unavailable', 'Prijava kodom trenutno nije dostupna. Pokušajte ponovo kasnije.')
const localHost = (value: string | undefined) => !!value && /^(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/.test(value)
export function isOtpDemoEnvironment() {
  return !!process.env.GCLOUD_PROJECT?.startsWith('demo-') && process.env.FUNCTIONS_EMULATOR === 'true'
    && process.env.OTP_DEMO_MODE === 'true' && localHost(process.env.FIRESTORE_EMULATOR_HOST) && localHost(process.env.FIREBASE_AUTH_EMULATOR_HOST)
}
function canonicalIp(value: unknown) {
  if (typeof value !== 'string' || value.length > 64) throw unavailable()
  const ip = value.trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1')
  if (!isIP(ip)) throw unavailable()
  return ip.toLowerCase()
}
export function trustedOtpIp(req: any, options: { demo?: boolean; trustedProxyHops?: number } = {}) {
  if (options.demo && isOtpDemoEnvironment()) {
    // The Functions emulator removes the socket from its wrapped request.
    // The guarded repo E2E runner binds Functions to loopback; use one test IP.
    const remote = req.socket?.remoteAddress || req.connection?.remoteAddress
    return remote ? canonicalIp(remote) : '127.0.0.1'
  }
  // The deployment's trusted right-edge proxy chain MUST be measured before enablement.
  // Never accept the caller's first XFF or CF-Connecting-IP on the public Google URL.
  const hops = options.trustedProxyHops || 0
  if (!Number.isInteger(hops) || hops < 1 || hops > 4) throw unavailable()
  const forwarded = req.get?.('X-Forwarded-For')
  if (typeof forwarded !== 'string' || Buffer.byteLength(forwarded) > 1024) throw unavailable()
  const parts = forwarded.split(',')
  if (parts.length < hops || parts.length > 32) throw unavailable()
  return canonicalIp(parts[parts.length - hops])
}
function validateBody(req: any, operation: HandlerConfig['operation']) {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(req.get?.('Content-Type') || '')) throw new HttpsError('invalid-argument', 'Pošaljite JSON zahtev.')
  let body: any
  try {
    if (Buffer.isBuffer(req.rawBody)) {
      if (req.rawBody.byteLength > 4096) throw new Error('size')
      body = JSON.parse(req.rawBody.toString('utf8'))
    } else {
      const json = JSON.stringify(req.body)
      if (!json || Buffer.byteLength(json) > 4096) throw new Error('size')
      body = JSON.parse(json)
    }
  } catch { throw new HttpsError('invalid-argument', 'Zahtev nije ispravan ili je prevelik.') }
  const object = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value)
  if (!object(body) || Object.keys(body).length !== 1 || !object(body.data)) throw new HttpsError('invalid-argument', 'Zahtev sadrži nedozvoljene podatke.')
  const data = body.data
  const keys = operation === 'request' ? ['requestId', 'email', 'sessionSecret', 'turnstileToken'] : ['requestId', 'sessionSecret', 'code']
  if (Object.keys(data).length !== keys.length || Object.keys(data).some(key => !keys.includes(key))
    || typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{20,80}$/.test(data.requestId)
    || typeof data.sessionSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.sessionSecret)) throw new HttpsError('invalid-argument', 'Podaci za prijavu nisu ispravni.')
  if (operation === 'request') {
    data.email = normalizeOtpEmail(data.email)
    if (typeof data.turnstileToken !== 'string' || data.turnstileToken.length < 1 || data.turnstileToken.length > 2048) throw new HttpsError('invalid-argument', 'Unesite ispravnu email adresu i ponovite proveru.')

  } else if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)) throw new HttpsError('invalid-argument', 'Unesite šestocifreni kod.')
  return data
}

export function createOtpHandler(config: HandlerConfig) {
  const origins = new Set(config.allowedOrigins || ['https://majstorsada.rs', 'https://www.majstorsada.rs'])
  const requestsDemo = () => typeof config.demo === 'function' ? config.demo() : !!config.demo
  const isAllowedOrigin = (origin: string) => origins.has(origin) || (requestsDemo() && isOtpDemoEnvironment() && ['http://localhost:3333', 'http://127.0.0.1:3333'].includes(origin))
  const now = config.now || Date.now
  const burst = new Map<string, { began: number; count: number }>()
  const localBrake = (ip: string) => {
    const time = now(), previous = burst.get(ip)
    if (!previous || time - previous.began >= 60_000) {
      if (burst.size >= 5000) {
        for (const [key, state] of burst) if (time - state.began >= 60_000) burst.delete(key)
        if (burst.size >= 5000) throw new HttpsError('resource-exhausted', 'Previše zahteva. Pokušajte ponovo za minut.')
      }
      burst.set(ip, { began: time, count: 1 })
    } else if (++previous.count > (config.operation === 'request' ? 20 : 60)) throw new HttpsError('resource-exhausted', 'Previše zahteva. Pokušajte ponovo za minut.')
  }
  return async (req: any, res: any) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Vary', 'Origin')
    const origin = req.get?.('Origin')
    if (typeof origin !== 'string' || !isAllowedOrigin(origin)) { res.status(403).send({ ok: false, code: 'permission-denied', error: 'Zahtev nije dozvoljen.' }); return }
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.status(204).send(''); return }
    if (req.method !== 'POST') { res.status(405).send({ ok: false, code: 'invalid-argument', error: 'Koristite POST zahtev.' }); return }
    try {
      // Operator diagnostics have an independent, short-lived authorization gate.
      // They cannot fall through to account, database, bot or mail work.
      if (req.get?.('X-OTP-Diagnostic') !== undefined) {
        if (!config.diagnostics) throw unavailable()
        await config.diagnostics(req, res)
        return
      }
      if (!config.enabled()) throw unavailable()
      const demo = requestsDemo()
      if (demo && !isOtpDemoEnvironment()) throw unavailable()
      const data = validateBody(req, config.operation)
      const allowedEmails = config.allowedEmails?.()
      if (config.operation === 'request' && allowedEmails !== undefined && !allowedEmails.map(email => email.toLowerCase()).includes(data.email)) throw unavailable()
      const ip = config.getClientIp ? canonicalIp(config.getClientIp(req)) : trustedOtpIp(req, { demo, trustedProxyHops: config.trustedProxyHops?.() })
      localBrake(ip)
      if (config.operation === 'request') {
        if (!config.verifyBot) throw unavailable()
        await config.verifyBot(data.turnstileToken, { requestId: data.requestId, ip })
      }
      const service = await config.serviceFactory()
      const result = config.operation === 'request'
        ? await service.request({ requestId: data.requestId, email: data.email, sessionSecret: data.sessionSecret }, ip)
        : await service.verify({ requestId: data.requestId, sessionSecret: data.sessionSecret, code: data.code }, ip)
      res.status(200).send({ ok: true, ...result })
    } catch (error: any) {
      const statuses: Record<string, number> = { 'invalid-argument': 400, 'permission-denied': 403, 'not-found': 404, 'already-exists': 409, 'failed-precondition': 412, 'resource-exhausted': 429, 'unavailable': 503, 'unauthenticated': 401 }
      const code = error instanceof HttpsError && statuses[error.code] ? error.code : 'internal'
      if (code === 'internal') config.onInternalError?.('otp-handler-internal')
      if (code === 'resource-exhausted') res.setHeader('Retry-After', '60')
      res.status(statuses[code] || 500).send({ ok: false, code, error: code === 'internal' ? 'Prijava trenutno nije završena. Pokušajte ponovo.' : error.message })
    }
  }
}

export function createTurnstileVerifier(config: { secret: string; hostnames?: string[]; action?: string; fetch?: typeof fetch }) {
  if (typeof config.secret !== 'string' || config.secret.length < 16) throw new Error('OTP bot secret is missing')
  const request = config.fetch || fetch, hostnames = new Set(config.hostnames || ['majstorsada.rs', 'www.majstorsada.rs'])
  return async (token: string, context: BotContext) => {
    try {
      const response = await request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ secret: config.secret, response: token, remoteip: context.ip })
      })
      if (!response.ok) throw unavailable()
      const result = await response.json() as any
      if (result.success !== true || !hostnames.has(result.hostname) || result.action !== (config.action || 'client_otp') || result.cdata !== context.requestId) throw new HttpsError('permission-denied', 'Ponovite bezbednosnu proveru pre slanja koda.')
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw unavailable()
    }
  }
}
