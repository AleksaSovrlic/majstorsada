import { isIP } from 'node:net'
import { HttpsError } from 'firebase-functions/v2/https'

export interface OtpDiagnosticsConfig {
  windowStartedAt: () => string
  ownerSubject: () => string
  ownerEmail: () => string
  businessEnabled: () => boolean
  publicEnabled: () => boolean
  now?: () => number
  fetch?: typeof fetch
}

const marker = 'ingress-v1'
const maximumWindowMs = 30 * 60_000
const maximumUserInfoBytes = 8192
const userInfoUrl = 'https://openidconnect.googleapis.com/v1/userinfo'
const messages = {
  unavailable: 'Ingress diagnostics are unavailable.',
  invalid: 'The diagnostic request is invalid.',
  unauthenticated: 'Owner authentication is required.',
  forbidden: 'The authenticated account is not the diagnostic owner.',
  limited: 'Too many diagnostic authentication attempts.'
}
const unavailable = () => new HttpsError('unavailable', messages.unavailable)
const invalid = () => new HttpsError('invalid-argument', messages.invalid)
const unauthenticated = () => new HttpsError('unauthenticated', messages.unauthenticated)

// All OTP diagnostic handler factories in this warm instance share one brake.
let authenticationWindow: { began: number; count: number } | undefined
function takeAuthenticationAttempt(time: number) {
  if (!authenticationWindow || time - authenticationWindow.began >= 60_000) authenticationWindow = { began: time, count: 0 }
  if (authenticationWindow.count >= 20) throw new HttpsError('resource-exhausted', messages.limited)
  authenticationWindow.count++
}

export function isOtpDiagnosticWindowOpen(startedAt: unknown, time: number) {
  if (typeof startedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startedAt) || !Number.isFinite(time)) return false
  const start = Date.parse(startedAt)
  return Number.isFinite(start) && new Date(start).toISOString() === startedAt && time >= start && time - start < maximumWindowMs
}

export function canonicalOtpDiagnosticIp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const ip = value.trim()
  if (ip.length > 64) return null
  const version = isIP(ip)
  if (version === 4) return ip
  if (version !== 6 || ip.includes('%')) return null
  // URL canonicalization compresses IPv6 and normalizes case without a DNS lookup.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(canonical)
  if (!mapped) return canonical
  const upper = parseInt(mapped[1], 16), lower = parseInt(mapped[2], 16)
  return [upper >>> 8, upper & 255, lower >>> 8, lower & 255].join('.')
}

export function parseOtpDiagnosticForwarded(value: unknown): Array<string | null> {
  if (value === undefined || value === null) return []
  if (typeof value !== 'string' || Buffer.byteLength(value) > 1024) throw invalid()
  if (!value.trim()) return []
  const parts = value.split(',')
  if (parts.length > 32) throw invalid()
  // Invalid caller-controlled prefixes retain their position but never their text.
  return parts.map(canonicalOtpDiagnosticIp)
}

function diagnosticSettings(config: OtpDiagnosticsConfig, time: number) {
  try {
    if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.GCLOUD_PROJECT?.startsWith('demo-')
      || process.env.OTP_DEMO_MODE === 'true' || process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST
      || config.businessEnabled() !== false || config.publicEnabled() !== false
      || !isOtpDiagnosticWindowOpen(config.windowStartedAt(), time)) throw unavailable()
    const subject = config.ownerSubject(), email = config.ownerEmail()
    if (typeof subject !== 'string' || !/^\d{6,255}$/.test(subject)
      || typeof email !== 'string' || email.length > 254 || !/^[\x21-\x7e]+$/.test(email)
      || !/^[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(email)) throw unavailable()
    return { subject, email }
  } catch { throw unavailable() }
}

function diagnosticBody(req: any): { diagnostic: typeof marker; nonce: string } {
  if (req.method !== 'POST' || req.get?.('X-OTP-Diagnostic') !== marker
    || !/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(req.get?.('Content-Type') || '')) throw invalid()
  let body: any
  try {
    if (Buffer.isBuffer(req.rawBody)) {
      if (req.rawBody.byteLength > 1024) throw invalid()
      body = JSON.parse(req.rawBody.toString('utf8'))
    } else {
      const json = JSON.stringify(req.body)
      if (!json || Buffer.byteLength(json) > 1024) throw invalid()
      body = JSON.parse(json)
    }
  } catch { throw invalid() }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'diagnostic') || !Object.hasOwn(body, 'nonce')
    || body.diagnostic !== marker || typeof body.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.nonce)
    || Buffer.from(body.nonce, 'base64url').toString('base64url') !== body.nonce) throw invalid()
  return body
}

function diagnosticToken(req: any) {
  const authorization = req.get?.('Authorization')
  if (typeof authorization !== 'string') throw unauthenticated()
  const match = /^Bearer ([\x21-\x7e]{1,4096})$/.exec(authorization)
  if (!match) throw unauthenticated()
  return match[1]
}

async function boundedUserInfo(response: Response): Promise<any> {
  const declaredLength = response.headers.get('Content-Length')
  if (declaredLength !== null && (!/^\d{1,10}$/.test(declaredLength) || Number(declaredLength) > maximumUserInfoBytes)) throw unavailable()
  if (!/^application\/json(?:\s*;[^\r\n]*)?$/i.test(response.headers.get('Content-Type') || '') || !response.body) throw unavailable()
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maximumUserInfoBytes) {
        void reader.cancel().catch(() => undefined)
        throw unavailable()
      }
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'))
  } finally { reader.releaseLock() }
}

async function authenticatedOwner(token: string, owner: { subject: string; email: string }, request: typeof fetch) {
  const signal = AbortSignal.timeout(5000)
  let abortListener: (() => void) | undefined
  const timeout = new Promise<never>((_, reject) => {
    abortListener = () => reject(unavailable())
    signal.addEventListener('abort', abortListener, { once: true })
  })
  try {
    const lookup = (async () => {
      const response = await request(userInfoUrl, {
        method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, redirect: 'error', signal
      })
      if (response.status === 401) throw unauthenticated()
      if (!response.ok) throw unavailable()
      const identity = await boundedUserInfo(response)
      if (!identity || typeof identity !== 'object' || Array.isArray(identity)
        || identity.sub !== owner.subject || identity.email !== owner.email || identity.email_verified !== true) {
        throw new HttpsError('permission-denied', messages.forbidden)
      }
    })()
    await Promise.race([lookup, timeout])
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'unauthenticated') throw unauthenticated()
    if (error instanceof HttpsError && error.code === 'permission-denied') throw new HttpsError('permission-denied', messages.forbidden)
    throw unavailable()
  } finally { if (abortListener) signal.removeEventListener('abort', abortListener) }
}

// The enclosing OTP handler enforces its normal Origin/CORS policy first and
// translates these fixed HttpsErrors. This path never initializes OTP services.
export function createOtpDiagnostics(config: OtpDiagnosticsConfig) {
  const now = config.now || Date.now, request = config.fetch || fetch
  return async (req: any, res: any): Promise<void> => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const time = now(), owner = diagnosticSettings(config, time)
    const body = diagnosticBody(req), token = diagnosticToken(req)
    takeAuthenticationAttempt(time)
    await authenticatedOwner(token, owner, request)
    const currentOwner = diagnosticSettings(config, now())
    if (currentOwner.subject !== owner.subject || currentOwner.email !== owner.email) throw unavailable()
    const forwarded = parseOtpDiagnosticForwarded(req.get?.('X-Forwarded-For'))
    const socketIp = canonicalOtpDiagnosticIp(req.socket?.remoteAddress || req.connection?.remoteAddress)
    res.status(200).send({ ok: true, diagnostic: marker, nonce: body.nonce, forwarded, socketIp })
  }
}