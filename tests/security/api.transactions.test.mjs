import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { seedDb, profile, job, functionsRequire } from './helpers.mjs'

// Execute the compiled production handlers against real emulator transactions.
// Only token verification is substituted: these tests do not test Firebase Auth.
process.env.NODE_ENV = 'test'
const api = functionsRequire('./lib/index.js')
const auth = functionsRequire('firebase-admin/auth').getAuth()
const originalVerify = auth.verifyIdToken
const testIdentities = new Set()
auth.verifyIdToken = async token => {
  const uid = token.startsWith('test:') ? token.slice(5) : null
  assert.ok(testIdentities.has(uid), 'Unknown test identity')
  return { uid, email: `${uid}@example.test`, email_verified: uid !== 'unverified-registration' }
}
after(() => { auth.verifyIdToken = originalVerify })

function invoke(name, uid, data) {
  if (uid) testIdentities.add(uid)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${name} timed out`)), 25000)
    let status = 200
    const headers = new Map()
    const req = { method: 'POST', headers: {}, body: { data }, get: name => name.toLowerCase() === 'authorization' && uid ? `Bearer test:${uid}` : undefined }
    const res = {
      status(code) { status = code; return this },
      setHeader(key, value) { headers.set(key.toLowerCase(), value) },
      getHeader(key) { return headers.get(key.toLowerCase()) },
      send(body) { clearTimeout(timeout); resolve({ status, body, headers: Object.fromEntries(headers) }); return this },
      end() { return this.send('') },
    }
    Promise.resolve(api[name](req, res)).catch(error => { clearTimeout(timeout); reject(error) })
  })
}
async function seedJob(id, owner, extra = {}) {
  await seedDb.doc('jobs/' + id).set(job(owner, extra))
  await seedDb.doc('jobs/' + id + '/private/contact').set({ contactPhone: '+381641234567' })
}
const dataOf = async path => (await seedDb.doc(path).get()).data()

test('Admin allocation -> acceptance -> completion -> one client rating', async () => {
  const uid = 'api-flow-tp', owner = 'api-flow-client', id = 'api-flow-job-0001', admin = 'api-admin'
  await seedDb.doc(`admins/${admin}`).set({ uid: admin })
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid))
  await seedDb.doc(`clients/${owner}`).set({ uid: owner })
  await seedJob(id, owner)
  assert.equal((await invoke('updateTokensByAdmin', owner, { uid, delta: 2 })).status, 403)
  assert.equal((await invoke('updateTokensByAdmin', admin, { uid, delta: 2 })).status, 200)
  assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, 2)
  assert.equal((await invoke('updateTokensByAdmin', admin, { uid, delta: -3 })).status, 412)
  assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, 2)
  assert.equal((await invoke('acceptJob', uid, { jobId: id })).status, 200)
  assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, 1)
  assert.equal((await dataOf(`jobs/${id}`)).acceptedByTradespersonId, uid)
  assert.equal((await invoke('submitJobRating', owner, { jobId: id, stars: 5 })).status, 412)
  assert.equal((await invoke('markJobAsComplete', owner, { jobId: id })).status, 403)
  assert.equal((await invoke('markJobAsComplete', uid, { jobId: id })).status, 200)
  assert.equal((await dataOf(`jobs/${id}`)).status, 'completed')
  assert.equal((await invoke('submitJobRating', 'api-other-client', { jobId: id, stars: 5 })).status, 403)
  assert.equal((await invoke('submitJobRating', owner, { jobId: id, stars: 5 })).status, 200)
  const retry = await invoke('submitJobRating', owner, { jobId: id, stars: 5 })
  assert.equal(retry.status, 200)
  assert.equal(retry.body.alreadyRated, true)
  const tp = await dataOf(`tradespeople/${uid}`)
  assert.equal(tp.ratingSum, 5)
  assert.equal(tp.ratingCount, 1)
  assert.equal(tp.averageRating, 5)
  assert.equal(tp.balanceTokens, 1)
})
test('Two tradespeople racing for one job produce one winner and one debit', async () => {
  const users = ['api-race-a', 'api-race-b'], id = 'api-race-job-0001'
  await Promise.all(users.map(uid => seedDb.doc(`tradespeople/${uid}`).set(profile(uid, { balanceTokens: 1 }))))
  await seedJob(id, 'api-race-client')
  const results = await Promise.all(users.map(uid => invoke('acceptJob', uid, { jobId: id })))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 412])
  const winner = (await dataOf(`jobs/${id}`)).acceptedByTradespersonId
  assert.ok(users.includes(winner))
  for (const uid of users) assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, uid === winner ? 0 : 1)
})
test('One remaining token cannot pay for two simultaneous jobs', async () => {
  const uid = 'api-last-token', ids = ['api-last-job-a-0001', 'api-last-job-b-0001']
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid, { balanceTokens: 1 }))
  await Promise.all(ids.map(id => seedJob(id, 'api-last-client')))
  const results = await Promise.all(ids.map(jobId => invoke('acceptJob', uid, { jobId })))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429])
  assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, 0)
  const jobs = await Promise.all(ids.map(id => dataOf(`jobs/${id}`)))
  assert.equal(jobs.filter(j => j.status === 'accepted' && j.acceptedByTradespersonId === uid).length, 1)
  assert.equal(jobs.filter(j => j.status === 'pending').length, 1)
})
test('Acceptance rejects anonymous callers, missing profiles and zero tokens without modifying job', async () => {
  const uid = 'api-zero-tp', id = 'api-zero-job-0001'
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid))
  await seedJob(id, 'api-zero-client')
  assert.equal((await invoke('acceptJob', null, { jobId: id })).status, 401)
  assert.equal((await invoke('acceptJob', 'api-missing-profile', { jobId: id })).status, 403)
  assert.equal((await invoke('acceptJob', uid, { jobId: id })).status, 429)
  assert.equal((await dataOf(`jobs/${id}`)).status, 'pending')
  assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, 0)
})

export { invoke, dataOf, seedJob }

const registration = { role: 'tradesperson', displayName: 'Test Majstor', phoneNumber: '+381641234567', specialization: 'vodoinstalater', city: 'Beograd' }
const request = id => ({ requestId: id, problemDescription: 'Curi test slavina', address: 'Test 1', coordinates: { lat: 44.8, lng: 20.46 }, city: 'Beograd', contactPhone: '0641234567', specializationRequired: 'vodoinstalater', photoCount: 0 })
test('Concurrent client and tradesperson registration chooses exactly one role', async () => {
  const uid = 'roles-race'
  const result = await Promise.all([invoke('completeRegistration', uid, registration), invoke('completeRegistration', uid, { role: 'client' })])
  assert.deepEqual(result.map(r => r.status).sort(), [200, 409])
  const profiles = await Promise.all(['clients', 'tradespeople'].map(c => dataOf(c + '/' + uid)))
  assert.equal(profiles.filter(Boolean).length, 1)
})
test('Registration retry preserves allocated tokens and existing profile edits', async () => {
  const uid = 'registration-retry'
  assert.equal((await invoke('completeRegistration', uid, registration)).status, 200)
  assert.equal((await dataOf('tradespeople/' + uid)).balanceTokens, 0)
  await seedDb.doc('tradespeople/' + uid).update({ balanceTokens: 7, displayName: 'Promenjeno ime', ratingCount: 2 })
  assert.equal((await invoke('completeRegistration', uid, registration)).status, 200)
  const stored = await dataOf('tradespeople/' + uid)
  assert.equal(stored.balanceTokens, 7); assert.equal(stored.ratingCount, 2); assert.equal(stored.displayName, 'Promenjeno ime')
  assert.equal((await invoke('completeRegistration', uid, { role: 'client' })).status, 409)
})
test('Unregistered, conflicting and existing roles never fall back to client', async () => {
  assert.equal((await invoke('resolveAccount', 'role-unknown', {})).body.role, 'unregistered')
  await seedDb.doc('tradespeople/role-conflict').set(profile('role-conflict'))
  await seedDb.doc('clients/role-conflict').set({ uid: 'role-conflict' })
  assert.equal((await invoke('resolveAccount', 'role-conflict', {})).status, 412)
  assert.equal((await invoke('createJob', 'role-conflict', request('conflicting-job-0001'))).status, 412)
})
test('Create is atomic and idempotent, private contact never enters the feed document', async () => {
  const uid = 'create-client', id = 'create-client-job-0001'
  assert.equal((await invoke('completeRegistration', uid, { role: 'client' })).status, 200)
  const results = await Promise.all([invoke('createJob', uid, request(id)), invoke('createJob', uid, request(id))])
  assert.deepEqual(results.map(r => r.status), [200, 200])
  assert.equal(results.filter(r => r.body.replayed === false).length, 1)
  const stored = await dataOf('jobs/' + id)
  assert.equal(stored.clientId, uid); assert.equal(stored.schemaVersion, 2); assert.equal(stored.imagesReady, true)
  assert.equal('contactPhone' in stored, false); assert.equal('clientEmail' in stored, false)
  assert.equal((await dataOf('jobs/' + id + '/private/contact')).contactPhone, '+381641234567')
  assert.equal((await invoke('createJob', uid, { ...request(id), address: 'Izmenjena' })).status, 409)
  assert.equal((await invoke('createJob', uid, request('create-client-job-0002'))).status, 429)
  const jobs = await seedDb.collection('jobs').where('clientId', '==', uid).get()
  assert.equal(jobs.size, 1)
})
for (const [name, patch] of Object.entries({ forbiddenField: { clientEmail: 'forged@example.test' }, invalidPhone: { contactPhone: '123' }, outsideCity: { coordinates: { lat: 43, lng: 20 } }, invalidCity: { city: 'Novi Sad' }, invalidTrade: { specializationRequired: 'forged' }, fractionalPhotos: { photoCount: 1.5 }, tooManyPhotos: { photoCount: 4 }, emptyDescription: { problemDescription: '' }, injectedOwner: { clientId: 'someone' }, invalidId: { requestId: '../escape' } })) {
  test('Create rejects ' + name + ' without partial writes', async () => {
    const uid = 'invalid-' + name, id = 'invalid-job-' + name + '-0001'
    await seedDb.doc('clients/' + uid).set({ uid })
    assert.equal((await invoke('createJob', uid, { ...request(id), ...patch })).status, 400)
    assert.equal(await dataOf('jobs/' + id), undefined)
    assert.equal(await dataOf('jobs/' + id + '/private/contact'), undefined)
    assert.equal((await dataOf('clients/' + uid)).lastJobCreatedAt, undefined)
  })
}
test('Registration rejects privileges, invalid profile values and admin role', async () => {
  for (const patch of [{ balanceTokens: 5 }, { role: 'admin' }, { city: 'Novi Sad' }, { displayName: '' }, { phoneNumber: '123' }]) {
    assert.equal((await invoke('completeRegistration', 'invalid-registration', { ...registration, ...patch })).status, 400)
  }
  assert.equal(await dataOf('tradespeople/invalid-registration'), undefined)
})
for (const [name, tpExtra, jobExtra, missingContact, expected] of [
  ['wrong-trade', { specialization: 'bravar' }, {}, false, 403],
  ['wrong-city', { city: 'Novi Sad' }, {}, false, 403],
  ['fractional-tokens', { balanceTokens: 1.5 }, {}, false, 429],
  ['string-tokens', { balanceTokens: '2' }, {}, false, 429],
  ['negative-tokens', { balanceTokens: -1 }, {}, false, 429],
  ['unready', {}, { imagesReady: false }, false, 412],
  ['legacy', {}, { schemaVersion: 1 }, false, 412],
  ['missing-contact', {}, {}, true, 412],
]) {
  test('Acceptance rejects ' + name + ' without debit', async () => {
    const uid = 'accept-' + name, id = 'accept-job-' + name + '-0001'
    await seedDb.doc('tradespeople/' + uid).set(profile(uid, { balanceTokens: 3, ...tpExtra }))
    await seedJob(id, 'test-owner', jobExtra)
    if (missingContact) await seedDb.doc('jobs/' + id + '/private/contact').delete()
    const before = await dataOf('tradespeople/' + uid)
    assert.equal((await invoke('acceptJob', uid, { jobId: id })).status, expected)
    assert.deepEqual(await dataOf('tradespeople/' + uid), before)
    assert.equal((await dataOf('jobs/' + id)).status, 'pending')
  })
}
test('Repeated acceptance, including concurrent retry and after completion, debits once', async () => {
  const uid = 'accept-retry', id = 'accept-retry-job-0001'
  await seedDb.doc('tradespeople/' + uid).set(profile(uid, { balanceTokens: 1 }))
  await seedJob(id, 'test-owner')
  const results = await Promise.all([invoke('acceptJob', uid, { jobId: id }), invoke('acceptJob', uid, { jobId: id })])
  assert.deepEqual(results.map(r => r.status), [200, 200])
  assert.equal((await dataOf('tradespeople/' + uid)).balanceTokens, 0)
  assert.equal((await invoke('markJobAsComplete', uid, { jobId: id })).status, 200)
  assert.equal((await invoke('acceptJob', uid, { jobId: id })).status, 200)
  assert.equal((await dataOf('tradespeople/' + uid)).balanceTokens, 0)
})

test('Unverified identity cannot create a client profile', async () => {
  assert.equal((await invoke('completeRegistration', 'unverified-registration', { role: 'client' })).status, 412)
  assert.equal(await dataOf('clients/unverified-registration'), undefined)
})
test('Image HTTP boundary rejects missing authentication', async () => {
  const result = await invoke('readJobImage', null, { jobId: 'image-http-job-0001', slot: 0 })
  assert.equal(result.status, 401)
  assert.equal(result.headers['cache-control'], 'private, no-store')
})
test('A tradesperson cannot accept a job owned by the same UID', async () => {
  const uid = 'accept-self-tp', id = 'accept-self-job-0001'
  await seedDb.doc('tradespeople/' + uid).set(profile(uid, { balanceTokens: 2 }))
  await seedJob(id, uid)
  assert.equal((await invoke('acceptJob', uid, { jobId: id })).status, 403)
  assert.equal((await dataOf('tradespeople/' + uid)).balanceTokens, 2)
})
test('Production write gate fails closed without explicit enablement', () => {
  const lifecycle = functionsRequire('./lib/jobLifecycle.js')
  const project = process.env.GCLOUD_PROJECT, enabled = process.env.PUBLIC_WRITES_ENABLED
  try {
    process.env.GCLOUD_PROJECT = 'production-gate-test'
    delete process.env.PUBLIC_WRITES_ENABLED
    assert.throws(() => lifecycle.requireWritesEnabled(), error => error.code === 'unavailable')
    process.env.PUBLIC_WRITES_ENABLED = 'true'
    assert.doesNotThrow(() => lifecycle.requireWritesEnabled())
  } finally {
    process.env.GCLOUD_PROJECT = project
    if (enabled === undefined) delete process.env.PUBLIC_WRITES_ENABLED
    else process.env.PUBLIC_WRITES_ENABLED = enabled
  }
})
