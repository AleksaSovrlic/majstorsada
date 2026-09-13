import assert from 'node:assert/strict'
assert.equal(process.env.GCLOUD_PROJECT, 'demo-majstorsada-e2e')
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199')
const base = 'http://127.0.0.1:5501/demo-majstorsada-e2e/europe-west3/'
async function request(endpoint, options = {}) {
  return fetch(base + endpoint, { ...options, signal: AbortSignal.timeout(30000) })
}
const preflight = await request('resolveAccount', { method: 'OPTIONS', headers: { origin: 'https://majstorsada.rs', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } })
assert.equal(preflight.status, 204)
assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://majstorsada.rs')
assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/i)
// Firebase CLI enables permissive debug CORS before user handlers. The production
// origin restriction is exercised separately in tests/security/sdk.test.mjs.
assert.equal((await request('resolveAccount')).status, 405)
for (const authorization of ['', 'Bearer invalid-token']) {
  const res = await request('resolveAccount', { method: 'POST', headers: { 'content-type': 'application/json', authorization }, body: JSON.stringify({ data: {} }) })
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'unauthenticated')
}
const malformed = await request('resolveAccount', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
assert.equal(malformed.status, 400)
// Real local Auth token; no replacement of verifyIdToken in this transport test.
const login = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }), signal: AbortSignal.timeout(10000) })
assert.equal(login.status, 200)
const { idToken } = await login.json()
const headers = { 'content-type': 'application/json', authorization: `Bearer ${idToken}` }
const account = await request('resolveAccount', { method: 'POST', headers, body: JSON.stringify({ data: {} }) })
assert.equal(account.status, 200)
assert.deepEqual(await account.json(), { ok: true, role: 'unregistered' })
const invalid = await request('completeRegistration', { method: 'POST', headers, body: JSON.stringify({ data: { role: 'admin' } }) })
assert.equal(invalid.status, 400)
assert.equal((await invalid.json()).code, 'invalid-argument')
const large = await request('completeRegistration', { method: 'POST', headers, body: JSON.stringify({ data: { padding: 'x'.repeat(17000) } }) })
assert.equal(large.status, 400)
assert.equal((await large.json()).code, 'invalid-argument')
const removed = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(10000) })
assert.equal(removed.status, 200)
console.log('HTTP compatibility passed: CORS, methods, invalid/real Auth tokens, JSON parsing, domain errors and request-size guard.')
