import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'

export const OTP_POLICY = Object.freeze({
  lifetimeMs: 10 * 60_000, cooldownMs: 60_000, dailyMs: 24 * 60 * 60_000,
  emailLimit: 3, globalLimit: 500, burstLimit: 5, burstMs: 1000,
  dispatchMs: 60_000, dispatchGuardMs: 120_000, wrongCodeLimit: 5,
  rateWindowMs: 10 * 60_000, sendIpLimit: 50, verifyIpLimit: 120,
  completionMs: 120_000, leaseMs: 30_000,
})
export function validateOtpSecret(secret: string) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('OTP HMAC secret must contain at least 32 bytes.')
}
export function otpHash(secret: string, purpose: string, value: string): string {
  return createHmac('sha256', secret).update(purpose).update('\0').update(value).digest('hex')
}
export function equalOtpHash(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}
export function otpCode(): string { return randomInt(0, 1_000_000).toString().padStart(6, '0') }
export function normalizeOtpEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254) throw new HttpsError('invalid-argument', 'Unesite ispravnu email adresu.')
  const email = value.trim().toLowerCase()
  // Deliberately accept a conservative mailbox syntax, without alias rewriting.
  const parts = email.split('@')
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..') || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(parts[1])) {
    throw new HttpsError('invalid-argument', 'Unesite ispravnu email adresu.')
  }
  return email
}
export function validateOtpRequest(value: any, verification = false) {
  const keys = verification ? ['requestId', 'sessionSecret', 'code'] : ['requestId', 'sessionSecret', 'email']
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_-]{20,80}$/.test(value.requestId) || typeof value.sessionSecret !== 'string' || !/^[a-zA-Z0-9_-]{43,128}$/.test(value.sessionSecret)) {
    throw new HttpsError('invalid-argument', 'Neispravan zahtev za prijavu.')
  }
  if (verification && (typeof value.code !== 'string' || !/^\d{6}$/.test(value.code))) throw new HttpsError('invalid-argument', 'Unesite šestocifreni kod.')
}
export function validateOtpIp(ip: string) {
  if (typeof ip !== 'string' || !ip || ip.length > 128) throw new HttpsError('invalid-argument', 'Zahtev trenutno nije moguće proveriti.')
}
