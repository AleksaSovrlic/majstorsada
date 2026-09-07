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
  return { uid, email: `${uid}@example.test` }
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
      send(body) { clearTimeout(timeout); resolve({ status, body }); return this },
      end() { return this.send('') },
    }
    Promise.resolve(api[name](req, res)).catch(error => { clearTimeout(timeout); reject(error) })
  })
}
const dataOf = async path => (await seedDb.doc(path).get()).data()

test('Admin allocation -> acceptance -> completion -> one client rating', async () => {
  const uid = 'api-flow-tp', owner = 'api-flow-client', id = 'api-flow-job', admin = 'api-admin'
  await seedDb.doc(`admins/${admin}`).set({ uid: admin })
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid))
  await seedDb.doc(`jobs/${id}`).set(job(owner, { imagesReady: true }))
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
  const users = ['api-race-a', 'api-race-b'], id = 'api-race-job'
  await Promise.all(users.map(uid => seedDb.doc(`tradespeople/${uid}`).set(profile(uid, { balanceTokens: 1 }))))
  await seedDb.doc(`jobs/${id}`).set(job('api-race-client', { imagesReady: true }))
  const results = await Promise.all(users.map(uid => invoke('acceptJob', uid, { jobId: id })))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 412])
  const winner = (await dataOf(`jobs/${id}`)).acceptedByTradespersonId
  assert.ok(users.includes(winner))
  for (const uid of users) assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, uid === winner ? 0 : 1)
})
test('One remaining token cannot pay for two simultaneous jobs', async () => {
  const uid = 'api-last-token', ids = ['api-last-job-a', 'api-last-job-b']
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid, { balanceTokens: 1 }))
  await Promise.all(ids.map(id => seedDb.doc(`jobs/${id}`).set(job('api-last-client', { imagesReady: true }))))
  const results = await Promise.all(ids.map(jobId => invoke('acceptJob', uid, { jobId })))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 412])
  assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, 0)
  const jobs = await Promise.all(ids.map(id => dataOf(`jobs/${id}`)))
  assert.equal(jobs.filter(j => j.status === 'accepted' && j.acceptedByTradespersonId === uid).length, 1)
  assert.equal(jobs.filter(j => j.status === 'pending').length, 1)
})
test('Acceptance rejects anonymous callers, missing profiles and zero tokens without modifying job', async () => {
  const uid = 'api-zero-tp', id = 'api-zero-job'
  await seedDb.doc(`tradespeople/${uid}`).set(profile(uid))
  await seedDb.doc(`jobs/${id}`).set(job('api-zero-client', { imagesReady: true }))
  assert.equal((await invoke('acceptJob', null, { jobId: id })).status, 401)
  assert.equal((await invoke('acceptJob', 'api-missing-profile', { jobId: id })).status, 403)
  assert.equal((await invoke('acceptJob', uid, { jobId: id })).status, 412)
  assert.equal((await dataOf(`jobs/${id}`)).status, 'pending')
  assert.equal((await dataOf(`tradespeople/${uid}`)).balanceTokens, 0)
})
