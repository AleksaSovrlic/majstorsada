import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const SCOPES = new Set(['openid', 'email', 'https://www.googleapis.com/auth/userinfo.email'])
export class DiagnosticAuthError extends Error {
  constructor(code) { super(`Diagnostic operator authentication failed (${code})`); this.code = code }
}
const fail = code => { throw new DiagnosticAuthError(code) }
async function boundedJson(response) {
  const reader = response.body?.getReader()
  if (!reader) fail('INVALID_RESPONSE')
  const chunks = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) { await reader.cancel(); fail('RESPONSE_TOO_LARGE') }
      chunks.push(Buffer.from(value))
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('INVALID_RESPONSE')
    return data
  } catch (error) {
    if (error instanceof DiagnosticAuthError) throw error
    fail('INVALID_RESPONSE')
  }
}
const validToken = token => typeof token === 'string' && /^[\x21-\x7e]{1,4096}$/.test(token)
// Uses only the already-granted identity scopes. Never forwards a Cloud Platform
// access token to an application endpoint or writes a refreshed token to disk.
export async function createDiagnosticIdentity({ refreshToken, clientId, clientSecret, expectedEmail, fetchImpl = fetch, now = Date.now }) {
  if (typeof refreshToken !== 'string' || !/^[\x21-\x7e]{1,16384}$/.test(refreshToken)
    || typeof clientId !== 'string' || !clientId.endsWith('.apps.googleusercontent.com')
    || typeof clientSecret !== 'string' || !clientSecret.length
    || typeof expectedEmail !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(expectedEmail)) fail('INVALID_LOGIN')
  let token, expiresAt = 0, identity, refreshPromise
  async function refresh() {
    const requestedAt = now()
    try {
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId,
          client_secret: clientSecret, grant_type: 'refresh_token', scope: 'openid email' }).toString(),
      })
      if (!response.ok) fail('LOGIN_REFRESH_REJECTED')
      const data = await boundedJson(response)
      const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : []
      if (!scopes.includes('openid') || !scopes.some(scope => scope === 'email' || scope.endsWith('/userinfo.email'))
        || scopes.some(scope => !SCOPES.has(scope))) fail('IDENTITY_SCOPE_NOT_NARROWED')
      if (!validToken(data.access_token) || (typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer')
        || !Number.isInteger(data.expires_in) || data.expires_in < 120 || data.expires_in > 3600) fail('INVALID_REFRESH_RESPONSE')
      const userResponse = await fetchImpl(USERINFO_URL, { method: 'GET', redirect: 'error',
        signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${data.access_token}` } })
      if (!userResponse.ok) fail('IDENTITY_REJECTED')
      const user = await boundedJson(userResponse)
      if (typeof user.sub !== 'string' || !/^\d{6,255}$/.test(user.sub)
        || user.email !== expectedEmail || user.email_verified !== true
        || (identity && user.sub !== identity.subject)) fail('OPERATOR_IDENTITY_MISMATCH')
      identity = { actor: user.email, subject: user.sub }
      token = data.access_token
      expiresAt = requestedAt + data.expires_in * 1000
      return token
    } catch (error) {
      if (error instanceof DiagnosticAuthError) throw error
      fail('AUTHENTICATION_UNAVAILABLE')
    }
  }
  async function getToken() {
    if (token && now() < expiresAt - 60_000) return token
    refreshPromise ||= refresh()
    try { return await refreshPromise } finally { refreshPromise = undefined }
  }
  await getToken()
  return { ...identity, getToken }
}
export async function firebaseDiagnosticIdentity({ fetchImpl, now } = {}) {
  try {
    const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
    const require = createRequire(resolve(root, 'package.json'))
    const cliRoot = resolve(require.resolve('firebase-tools/package.json'), '..')
    const { logger } = require(resolve(cliRoot, 'lib/logger.js'))
    logger.silent = true
    const api = require(resolve(cliRoot, 'lib/api.js'))
    if (process.env.FIREBASE_TOKEN || process.env.GOOGLE_APPLICATION_CREDENTIALS
      || process.env.FIREBASE_CLIENT_ID || process.env.FIREBASE_CLIENT_SECRET
      || api.googleOrigin() !== 'https://www.googleapis.com' || api.authOrigin() !== 'https://accounts.google.com') fail('LOGIN_OVERRIDE_FORBIDDEN')
    const auth = require(resolve(cliRoot, 'lib/auth.js'))
    const account = auth.getProjectDefaultAccount(root)
    if (!account?.user?.email || !account.tokens?.refresh_token) fail('CLI_LOGIN_REQUIRED')
    return await createDiagnosticIdentity({ refreshToken: account.tokens.refresh_token,
      clientId: api.clientId(), clientSecret: api.clientSecret(), expectedEmail: account.user.email, ...(fetchImpl ? {fetchImpl} : {}), ...(now ? {now} : {}) })
  } catch (error) {
    if (error instanceof DiagnosticAuthError) throw error
    fail('CLI_LOGIN_UNAVAILABLE')
  }
}
