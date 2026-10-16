import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seedDb, profile, job, functionsRequire } from './helpers.mjs'
const api = functionsRequire('./lib/index.js')
const { getMessaging, FirebaseMessagingError } = functionsRequire('firebase-admin/messaging')

test('Admin 14 push errors remove only permanently invalid tokens', async t => {
  const uid = 'sdk-push-user', refs = ['valid', 'unregistered', 'invalid', 'temporary'].map(id => seedDb.doc(`tradespeople/${uid}/fcmTokens/${id}`))
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid, { specialization: 'sdk-test-only', status: 'available' }))
  await Promise.all(refs.map(ref => ref.set({ token: ref.id })))
  const messaging = getMessaging(), original = messaging.sendEachForMulticast
  t.after(() => { messaging.sendEachForMulticast = original })
  await seedDb.doc('jobs/sdk-push-job').set(job('sdk-owner', { specializationRequired: 'sdk-test-only' }))
  let calls = 0
  messaging.sendEachForMulticast = async message => {
    calls++
    assert.equal(message.data.jobId, 'sdk-push-job')
    const errors = { unregistered: 'registration-token-not-registered', invalid: 'invalid-registration-token', temporary: 'server-unavailable' }
    const responses = message.tokens.map(token => errors[token] ? { success: false, error: new FirebaseMessagingError({ code: errors[token], message: 'Controlled emulator test' }) } : { success: true, messageId: 'local-test' })
    return { successCount: 1, failureCount: 3, responses }
  }
  await assert.rejects(api.notifyOnJobCreated.run({ params: { jobId: 'sdk-push-job' }, data: { data: () => ({ specializationRequired: 'sdk-test-only', status: 'pending', imagesReady: true }) } }), /Temporary messaging failure/)
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


test('Push resumes after a full token page and completed delivery ignores duplicate events', async t => {
  const uid = 'sdk-many-devices', id = 'sdk-many-job', spec = 'sdk-many-only'
  await seedDb.doc('tradespeople/' + uid).set(profile(uid, { specialization: spec, status: 'available' }))
  const batch = seedDb.batch()
  for (let i = 0; i < 101; i++) batch.set(seedDb.doc(`tradespeople/${uid}/fcmTokens/${String(i).padStart(3, '0')}`), { token: String(i) })
  await batch.commit()
  await seedDb.doc('jobs/' + id).set(job('sdk-many-owner', { specializationRequired: spec }))
  const messaging = getMessaging(), original = messaging.sendEachForMulticast
  t.after(() => { messaging.sendEachForMulticast = original })
  const sizes = []; let failLast = true
  messaging.sendEachForMulticast = async message => {
    sizes.push(message.tokens.length)
    if (message.tokens.length === 1 && failLast) throw new Error('Simulated transport interruption')
    return { successCount: message.tokens.length, failureCount: 0, responses: message.tokens.map(() => ({ success: true })) }
  }
  const event = { params: { jobId: id }, data: { data: () => ({ specializationRequired: spec, status: 'pending', imagesReady: true }) } }
  await assert.rejects(api.notifyOnJobCreated.run(event), /Simulated transport/)
  const checkpoint = (await seedDb.doc(`jobs/${id}/system/notification`).get()).data()
  assert.equal(checkpoint.tokenCursor, '099'); assert.equal(checkpoint.leaseUntil, 0)
  failLast = false
  await api.notifyOnJobCreated.run(event)
  await api.notifyOnJobCreated.run(event)
  assert.deepEqual(sizes, [100, 1, 1], 'The acknowledged first 100 devices must not be resent')
  assert.equal((await seedDb.doc(`jobs/${id}/system/notification`).get()).data().done, true)
})

test('Push lease excludes concurrent workers and an expired job is not sent', async () => {
  const id = 'sdk-leased-job', spec = 'sdk-lease-only'
  await seedDb.doc('jobs/' + id).set(job('sdk-lease-owner', { specializationRequired: spec }))
  const state = seedDb.doc(`jobs/${id}/system/notification`)
  await state.set({ leaseUntil: Date.now() + 120000, leaseId: 'another-worker' })
  const event = { params: { jobId: id }, data: { data: () => ({ specializationRequired: spec, status: 'pending', imagesReady: true }) } }
  await assert.rejects(api.notifyOnJobCreated.run(event), /already running/)
  await seedDb.doc('jobs/' + id).update({ expiresAt: new Date(1) })
  await api.notifyOnJobCreated.run(event)
  assert.equal((await state.get()).data().leaseId, 'another-worker')
})

test('OTP production SDK endpoints default closed, bind only new secrets and keep original function limits', async t => {
  assert.notEqual(process.env.FIREBASE_DEBUG_MODE, 'true')
  assert.equal(functionsRequire.cache[functionsRequire.resolve('@aws-sdk/client-sesv2')], undefined, 'Existing API cold starts must not import AWS SDK')
  const express = functionsRequire('express'), app = express()
  app.use(express.json())
  app.post('/request', api.requestClientOtp); app.post('/verify', api.verifyClientOtp)
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  t.after(() => new Promise((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()) }))
  for (const endpoint of ['request', 'verify']) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${endpoint}`, { method: 'POST', headers: { origin: 'https://majstorsada.rs', 'content-type': 'application/json' }, body: JSON.stringify({ data: {} }), signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'unavailable')
    assert.match(response.headers.get('cache-control'), /no-store/)
  }
  for (const endpoint of [api.requestClientOtp, api.verifyClientOtp]) {
    assert.equal(endpoint.__endpoint.maxInstances, 2)
    assert.equal(endpoint.__endpoint.concurrency, 10)
    assert.equal(endpoint.__endpoint.minInstances, 0)
    assert.deepEqual(endpoint.__endpoint.secretEnvironmentVariables.map(item => item.key).sort(), endpoint === api.requestClientOtp ? ['OTP_HMAC_SECRET', 'OTP_TURNSTILE_SECRET'] : ['OTP_HMAC_SECRET'])
  }
  assert.equal(api.resolveAccount.__endpoint.maxInstances, 3)
  assert.equal(api.resolveAccount.__endpoint.concurrency, 80)
})
