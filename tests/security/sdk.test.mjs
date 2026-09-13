import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seedDb, profile, functionsRequire } from './helpers.mjs'
const api = functionsRequire('./lib/index.js')
const { getMessaging, FirebaseMessagingError } = functionsRequire('firebase-admin/messaging')

test('Admin 14 push errors remove only permanently invalid tokens', async t => {
  const uid = 'sdk-push-user', refs = ['valid', 'unregistered', 'invalid', 'temporary'].map(id => seedDb.doc(`tradespeople/${uid}/fcmTokens/${id}`))
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid, { specialization: 'sdk-test-only', status: 'available' }))
  await Promise.all(refs.map(ref => ref.set({ token: ref.id })))
  const messaging = getMessaging(), original = messaging.sendEachForMulticast
  t.after(() => { messaging.sendEachForMulticast = original })
  let calls = 0
  messaging.sendEachForMulticast = async message => {
    calls++
    assert.equal(message.data.jobId, 'sdk-push-job')
    const errors = { unregistered: 'registration-token-not-registered', invalid: 'invalid-registration-token', temporary: 'server-unavailable' }
    const responses = message.tokens.map(token => errors[token] ? { success: false, error: new FirebaseMessagingError({ code: errors[token], message: 'Controlled emulator test' }) } : { success: true, messageId: 'local-test' })
    return { successCount: 1, failureCount: 3, responses }
  }
  await api.notifyOnJobCreated.run({ params: { jobId: 'sdk-push-job' }, data: { data: () => ({ specializationRequired: 'sdk-test-only', status: 'pending', imagesReady: true }) } })
  assert.equal(calls, 1)
  assert.deepEqual(await Promise.all(refs.map(async ref => (await ref.get()).exists)), [true, false, false, true])
  await api.notifyOnJobImagesReady.run({ params: { jobId: 'sdk-push-job' }, data: { before: { data: () => ({ imagesReady: true }) }, after: { data: () => ({ imagesReady: true, specializationRequired: 'sdk-test-only' }) } } })
  assert.equal(calls, 1, 'Already-ready update must not send another notification')
})

test('Production SDK adapter preserves the application CORS origin restriction', async t => {
  assert.notEqual(process.env.FIREBASE_DEBUG_MODE, 'true', 'Test the production adapter without the emulator debug CORS wrapper')
  const express = functionsRequire('express')
  const app = express(); app.use('/account', api.resolveAccount)
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  t.after(() => new Promise((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()) }))
  for (const [origin, expected] of [['https://majstorsada.rs', 'https://majstorsada.rs'], ['https://untrusted.example', null]]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/account`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' }, signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), expected)
    await response.text()
  }
})
