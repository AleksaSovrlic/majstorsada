import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
assert.equal(process.env.GCLOUD_PROJECT, 'demo-majstorsada-e2e')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8180')
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199')
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app')
const { getFirestore } = requireFunctions('firebase-admin/firestore')
const { getAuth } = requireFunctions('firebase-admin/auth')
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'otp-http-fixtures'), db = getFirestore(app), auth = getAuth(app)
const base = 'http://127.0.0.1:5501/demo-majstorsada-e2e/europe-west3/'
const headers = { 'content-type': 'application/json', origin: 'http://localhost:3333' }
async function post(name, data, extra = {}) {
  const response = await fetch(base + name, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(65000) })
  return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') }
}
const flow = email => ({ email, requestId: randomUUID(), sessionSecret: randomBytes(32).toString('base64url'), turnstileToken: 'demo-turnstile-token' })
async function mail(email) {
  const docs = await db.collection('_otpTestOutbox').where('email', '==', email).get()
  assert.equal(docs.size, 1, 'one request/replay must send at most one mail')
  const code = docs.docs[0].data().code
  assert.match(code, /^\d{6}$/)
  return code
}
async function verify(data, code) { return post('verifyClientOtp', { requestId: data.requestId, sessionSecret: data.sessionSecret, code }) }
async function exchange(customToken) {
  const response = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }), signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, 200)
  const session = await response.json()
  return { ...session, localId: (await auth.verifyIdToken(session.idToken)).uid }
}
try {
  const denied = await post('requestClientOtp', flow('otp-http-forbidden@example.test'), { origin: 'https://foreign.example' })
  assert.equal(denied.status, 403); assert.equal((await db.collection('_otpTestOutbox').get()).size, 0)
  const badBot = await post('requestClientOtp', { ...flow('otp-http-bot@example.test'), turnstileToken: 'not-a-real-token' })
  assert.equal(badBot.status, 403); assert.equal((await db.collection('_otpTestOutbox').get()).size, 0)
  const fresh = flow('otp-http-new@example.test')
  const sent = await post('requestClientOtp', fresh)
  assert.equal(sent.status, 200); assert.equal(sent.body.delivery, 'accepted'); assert.match(sent.cache, /no-store/)
  assert.equal((await post('requestClientOtp', fresh)).body.replayed, true)
  const code = await mail(fresh.email)
  assert.equal((await verify({ ...fresh, sessionSecret: randomBytes(32).toString('base64url') }, code)).status, 412)
  assert.equal((await verify(fresh, code === '111111' ? '222222' : '111111')).status, 412)
  const completed = await verify(fresh, code)
  assert.equal(completed.status, 200); assert.match(completed.cache, /no-store/)
  const signed = await exchange(completed.body.customToken)
  assert.equal((await auth.getUser(signed.localId)).emailVerified, true)
  assert.equal((await db.doc('clients/' + signed.localId).get()).data().email, fresh.email)
  const resolved = await post('resolveAccount', {}, { authorization: 'Bearer ' + signed.idToken })
  assert.equal(resolved.body.role, 'client')
  const resumed = await verify(fresh, code)
  assert.equal(resumed.status, 200)
  assert.equal((await exchange(resumed.body.customToken)).localId, signed.localId)
  assert.equal((await db.collection('_otpTestOutbox').where('email', '==', fresh.email).get()).size, 1)

  const existing = await auth.createUser({ uid: 'otp-http-existing', email: 'otp-http-existing@example.test', password: 'TestPassword123!', emailVerified: true })
  // Historic magic-link profiles are keyed by Auth UID without a redundant uid field.
  const legacyProfile = { email: existing.email, displayName: 'Preserved profile', createdAt: 1234 }
  const legacyJob = { clientId: existing.uid, status: 'completed', retained: true }
  await db.doc('clients/' + existing.uid).set(legacyProfile)
  await db.doc('jobs/otp-http-existing-job').set(legacyJob)
  const existingFlow = flow(existing.email)
  assert.equal((await post('requestClientOtp', existingFlow)).status, 200)
  const existingCode = await mail(existing.email)
  const existingToken = await verify(existingFlow, existingCode)
  assert.equal(existingToken.status, 200)
  const existingSession = await exchange(existingToken.body.customToken)
  assert.equal(existingSession.localId, existing.uid)
  assert.equal((await post('resolveAccount', {}, { authorization: 'Bearer ' + existingSession.idToken })).body.role, 'client')
  const existingReplay = await verify(existingFlow, existingCode)
  assert.equal(existingReplay.status, 200)
  assert.equal((await exchange(existingReplay.body.customToken)).localId, existing.uid)
  assert.equal((await db.collection('_otpTestOutbox').where('email', '==', existing.email).get()).size, 1)
  const retainedProfile = (await db.doc('clients/' + existing.uid).get()).data()
  assert.deepEqual(retainedProfile, legacyProfile)
  assert.equal(Object.hasOwn(retainedProfile, 'uid'), false, 'OTP must preserve the historic profile without migrating it')
  assert.deepEqual((await db.doc('jobs/otp-http-existing-job').get()).data(), legacyJob)
  for (const [kind, codeExpected] of [['unverified', 412], ['tradesperson', 403], ['admin', 403], ['disabled', 412]]) {
    const user = await auth.createUser({ uid: 'otp-http-' + kind, email: 'otp-http-' + kind + '@example.test', password: 'TestPassword123!', emailVerified: kind !== 'unverified', disabled: kind === 'disabled' })
    if (kind === 'tradesperson') await db.doc('tradespeople/' + user.uid).set({ uid: user.uid, balanceTokens: 17 })
    if (kind === 'admin') await db.doc('admins/' + user.uid).set({ uid: user.uid })
    const attempt = flow(user.email)
    assert.equal((await post('requestClientOtp', attempt)).status, 200)
    assert.equal((await verify(attempt, await mail(user.email))).status, codeExpected)
    assert.equal((await db.doc('clients/' + user.uid).get()).exists, false)
    if (kind === 'tradesperson') assert.equal((await db.doc('tradespeople/' + user.uid).get()).data().balanceTokens, 17)
    if (kind === 'unverified') assert.equal((await auth.getUser(user.uid)).emailVerified, false)
  }
  console.log('OTP real-emulator HTTP passed: one-send replay, session binding, wrong code, custom-token exchange, verified client creation, UID/profile/job preservation, forbidden and unverified accounts.')
} finally { await db.terminate(); await deleteApp(app) }
