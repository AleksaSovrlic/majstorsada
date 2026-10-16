import assert from 'node:assert/strict'
import { test } from 'node:test'
import { db, makeAuth, requestId, requireFunctions } from './helpers.mjs'
const { createOtpIdentity } = requireFunctions('./lib/otpIdentity.js')
const email = name => `${name}-${requestId()}@example.test`
const errorCode = code => error => error.code === code

test('New verified identity is created after durable target choice; one client profile precedes token', async () => {
  const auth = makeAuth(), identity = createOtpIdentity({ db, auth }), address = email('new')
  const target = await identity.findTarget(address)
  assert.equal(auth.users.size, 0)
  assert.equal(target.kind, 'new')
  const ensured = await identity.ensureUser(address, target)
  assert.equal(ensured.uid, target.uid)
  assert.equal(auth.users.get(target.uid).emailVerified, true)
  await identity.ensureProfile(address, ensured)
  assert.equal((await db.doc('clients/' + target.uid).get()).data().email, address)
  assert.match(await identity.token(address, ensured), /^fixture-token-/)
  assert.deepEqual(await identity.ensureUser(address, target), { uid: target.uid, kind: 'existing' })
})
for (const storedUid of [true, false]) test(`Verified historic client preserves Auth UID, profile and jobs with stored uid ${storedUid ? 'present' : 'absent'}`, async () => {
  const auth = makeAuth(), identity = createOtpIdentity({ db, auth }), address = email('legacy'), uid = requestId()
  const user = { uid, email: address, emailVerified: true, disabled: false, providerData: [{ providerId: 'password' }] }
  const profile = { ...(storedUid ? { uid } : {}), email: address, recentJobCreations: [100], customFixture: true }
  const job = { clientId: uid, status: 'accepted' }
  auth.users.set(uid, user)
  await db.doc('clients/' + uid).set(profile)
  await db.doc('jobs/identity-' + uid).set(job)
  const target = await identity.findTarget(address)
  assert.deepEqual(target, { uid, kind: 'existing' })
  const ensured = await identity.ensureUser(address, target)
  assert.equal(ensured.uid, uid)
  await identity.ensureProfile(address, ensured)
  assert.match(await identity.token(address, ensured), /^fixture-token-/)
  const preservedProfile = (await db.doc('clients/' + uid).get()).data()
  assert.deepEqual(preservedProfile, profile)
  assert.equal(Object.hasOwn(preservedProfile, 'uid'), storedUid)
  assert.deepEqual((await db.doc('jobs/identity-' + uid).get()).data(), job)
  assert.deepEqual(auth.users.get(uid), user)
})
for (const mode of ['unverified', 'disabled', 'admin', 'tradesperson', 'conflict', 'mfa']) test(`Identity refuses ${mode} without creating client or altering credentials`, async () => {
  const auth = makeAuth(), identity = createOtpIdentity({ db, auth }), address = email(mode), uid = requestId()
  const user = { uid, email: address, emailVerified: mode !== 'unverified', disabled: mode === 'disabled', providerData: [{ providerId: 'password' }], passwordFixture: 'unchanged', multiFactor: { enrolledFactors: mode === 'mfa' ? [{}] : [] } }
  auth.users.set(uid, user)
  if (['admin', 'conflict'].includes(mode)) await db.doc('admins/' + uid).set({ uid })
  if (['tradesperson', 'conflict'].includes(mode)) await db.doc('tradespeople/' + uid).set({ uid, balanceTokens: 8 })
  await assert.rejects(identity.findTarget(address))
  assert.equal((await db.doc('clients/' + uid).get()).exists, false)
  assert.deepEqual(auth.users.get(uid), user)
  assert.equal(auth.tokens.length, 0)
})
test('Existing account deletion or email change never recreates it or mints a token', async () => {
  const auth = makeAuth(), identity = createOtpIdentity({ db, auth }), address = email('deleted'), uid = requestId()
  auth.users.set(uid, { uid, email: address, emailVerified: true })
  const target = await identity.findTarget(address)
  auth.users.delete(uid)
  await assert.rejects(identity.ensureUser(address, target), errorCode('failed-precondition'))
  assert.equal(auth.users.size, 0)
  auth.users.set(uid, { uid, email: email('changed'), emailVerified: true })
  await assert.rejects(identity.ensureUser(address, target), errorCode('failed-precondition'))
  assert.equal(auth.tokens.length, 0)
})
test('Create/email race rechecks winning account and never verifies an unverified winner', async () => {
  for (const verified of [true, false]) {
    const auth = makeAuth(), identity = createOtpIdentity({ db, auth }), address = email('race'), target = await identity.findTarget(address), winner = requestId()
    auth.users.set(winner, { uid: winner, email: address, emailVerified: verified })
    if (verified) {
      const resolved = await identity.ensureUser(address, target)
      assert.deepEqual(resolved, { uid: winner, kind: 'existing' })
      await identity.ensureProfile(address, resolved)
      assert.equal((await db.doc('clients/' + winner).get()).exists, true)
    } else await assert.rejects(identity.ensureUser(address, target), errorCode('failed-precondition'))
    assert.equal(auth.users.has(target.uid), false)
    assert.equal(auth.users.get(winner).emailVerified, verified)
  }
})
test('Concurrent tradesperson registration and OTP profile completion create exactly one role', async () => {
  const { completeRegistration } = requireFunctions('./lib/jobLifecycle.js')
  const auth = makeAuth(), identity = createOtpIdentity({ db, auth }), address = email('role-race'), uid = requestId()
  auth.users.set(uid, { uid, email: address, emailVerified: true })
  const target = { uid, kind: 'existing' }
  const outcomes = await Promise.allSettled([
    identity.ensureProfile(address, target),
    completeRegistration({ uid, email: address, email_verified: true }, { role: 'tradesperson', displayName: 'Fixture Majstor', phoneNumber: '+381641234567', specialization: 'vodoinstalater', city: 'Beograd' }, db),
  ])
  const [client, tradesperson] = await db.getAll(db.doc('clients/' + uid), db.doc('tradespeople/' + uid))
  assert.equal([client, tradesperson].filter(snap => snap.exists).length, 1)
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
})

for (const changed of ['email', 'disabled', 'role']) test(`Remote token signing refuses a ${changed} change before token return`, async () => {
  const auth = makeAuth(), identity = createOtpIdentity({ db, auth }), address = email('signing-race'), uid = requestId()
  auth.users.set(uid, { uid, email: address, emailVerified: true, disabled: false })
  await db.doc('clients/' + uid).set({ uid, email: address })
  const original = auth.createCustomToken.bind(auth)
  auth.createCustomToken = async targetUid => {
    const token = await original(targetUid)
    if (changed === 'email') auth.users.get(uid).email = email('moved')
    if (changed === 'disabled') auth.users.get(uid).disabled = true
    if (changed === 'role') await db.doc('admins/' + uid).set({ uid })
    return token
  }
  await assert.rejects(identity.token(address, { uid, kind: 'existing' }), errorCode('failed-precondition'))
  assert.equal(auth.tokens.length, 1, 'Minted token must remain internal')
})
