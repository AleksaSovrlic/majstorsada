import assert from 'node:assert/strict'
import { test } from 'node:test'
import { db, makeAuth, requestId, sessionSecret, requireFunctions, Timestamp } from './helpers.mjs'
const { createOtpService } = requireFunctions('./lib/otpService.js')
const { OtpDeliveryError } = requireFunctions('./lib/otpTransport.js')
const { OTP_POLICY: P, otpHash } = requireFunctions('./lib/otpPolicy.js')
const SECRET = 'fixture-only-HMAC-secret-with-32-plus-bytes'
const errorCode = code => error => error.code === code
let clock = Date.now()
function input(email = `client-${requestId()}@example.test`) { return { requestId: requestId(), sessionSecret: sessionSecret(), email } }
async function fixture(options = {}) {
  await db.doc('_otpBudget/global').set({ reservations: [], admissions: [] })
  const auth = options.auth || makeAuth(), mails = [], events = []
  const sender = options.sendMail || (async (email, code) => { mails.push({ email, code }); return { messageId: requestId() } })
  const service = createOtpService({ db: options.db || db, auth, secret: SECRET, now: () => clock, sendMail: sender, onEvent: event => events.push(event), ...options })
  const ip = 'fixture-ip-' + requestId()
  return { auth, mails, service, events, ip }
}
const verification = (data, code) => ({ requestId: data.requestId, sessionSecret: data.sessionSecret, code })
const challenge = async data => (await db.doc('_otpChallenges/' + data.requestId).get()).data()
const address = data => db.doc('_otpRateStates/email_' + otpHash(SECRET, 'email', data.email.toLowerCase().trim()))
const budget = async () => (await db.doc('_otpBudget/global').get()).data()

test('One send and one verify use numeric code, verified UID, profile-before-token and bounded same-session recovery', async () => {
  const { service, mails, auth, ip } = await fixture(), data = input()
  const response = await service.request(data, ip)
  assert.equal(response.delivery, 'accepted'); assert.equal(response.replayed, false)
  assert.match(mails[0].code, /^\d{6}$/)
  assert.equal(auth.users.size, 0, 'Sending does not create an Auth account')
  const stored = await challenge(data)
  assert.equal(stored.code, undefined); assert.equal(stored.sessionSecret, undefined)
  const done = await service.verify(verification(data, mails[0].code), ip)
  assert.match(done.customToken, /^fixture-token-/)
  assert.equal(auth.users.size, 1)
  const uid = [...auth.users.keys()][0]
  assert.equal(auth.users.get(uid).emailVerified, true)
  assert.equal((await db.doc('clients/' + uid).get()).exists, true)
  assert.match((await service.verify(verification(data, mails[0].code), ip)).customToken, /^fixture-token-/)
  assert.equal(auth.users.size, 1)
  clock += P.completionMs + 1
  await assert.rejects(service.verify(verification(data, mails[0].code), ip), errorCode('failed-precondition'))
})
test('Concurrent duplicate request IDs send exactly once across independent service instances', async () => {
  let release, entered
  const entering = new Promise(resolve => { entered = resolve }), gate = new Promise(resolve => { release = resolve })
  let sent = 0
  const sendMail = async () => { sent++; entered(); await gate; return { messageId: 'fixture-message' } }
  const { service, auth, ip } = await fixture({ sendMail }), data = input()
  const first = service.request(data, ip)
  await entering
  const second = createOtpService({ db, auth, secret: SECRET, now: () => clock, sendMail })
  const repeated = await second.request(data, ip)
  assert.equal(repeated.delivery, 'pending'); assert.equal(repeated.replayed, true)
  release(); assert.equal((await first).delivery, 'accepted')
  assert.equal((await second.request(data, ip)).delivery, 'accepted')
  assert.equal(sent, 1); assert.equal((await budget()).reservations.length, 1)
  await assert.rejects(second.request({ ...data, email: 'different@example.test' }, ip), errorCode('already-exists'))
  await assert.rejects(second.request({ ...data, sessionSecret: sessionSecret() }, ip), errorCode('failed-precondition'))
  assert.equal(sent, 1)
})
test('499 global reservations plus ten concurrent new callers admit exactly one send', async () => {
  const { service, mails, ip, events } = await fixture()
  await db.doc('_otpBudget/global').set({ reservations: Array.from({ length: 499 }, (_, index) => ({ id: 'seed-' + index, releaseAt: clock + P.dailyMs })), admissions: [] })
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => service.request(input(), ip)))
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(mails.length, 1); assert.equal((await budget()).reservations.length, 500)
  assert.equal(events.some(event => event.name === 'otp_budget_threshold' && event.count === 500), true)
})
test('Two address reservations plus concurrent sends admit only one third reservation', async () => {
  const { service, mails, ip } = await fixture(), original = input()
  await address(original).set({ kind: 'email', generation: 0, reservations: [{ id: 'first', releaseAt: clock + P.dailyMs }, { id: 'second', releaseAt: clock + P.dailyMs }], resendAt: 0, deleteAfter: Timestamp.fromMillis(clock + P.dailyMs) })
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => service.request(input(original.email), ip)))
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(mails.length, 1); assert.equal((await address(original).get()).data().reservations.length, 3)
})
test('Global burst admits five different emails per second, then advances without resetting daily quota', async () => {
  const { service, mails, ip } = await fixture()
  for (let i = 0; i < 5; i++) await service.request(input(), ip)
  await assert.rejects(service.request(input(), ip), errorCode('resource-exhausted'))
  clock += 1001
  await service.request(input(), ip)
  assert.equal(mails.length, 6); assert.equal((await budget()).reservations.length, 6)
})
test('Five concurrent incorrect guesses consume exactly five attempts and reject even the right code thereafter', async () => {
  const { service, mails, ip } = await fixture(), data = input()
  await service.request(data, ip)
  const wrong = mails[0].code === '000000' ? '000001' : '000000'
  await Promise.allSettled(Array.from({ length: 5 }, () => service.verify(verification(data, wrong), ip)))
  assert.equal((await challenge(data)).wrongAttempts, 5)
  await assert.rejects(service.verify(verification(data, mails[0].code), ip), errorCode('failed-precondition'))
})
test('Parallel correct verifies authorize one completion; same browser can retry a lost response', async () => {
  const { service, mails, ip, auth } = await fixture(), data = input()
  await service.request(data, ip)
  const responses = await Promise.allSettled([service.verify(verification(data, mails[0].code), ip), service.verify(verification(data, mails[0].code), ip)])
  assert.ok(responses.some(item => item.status === 'fulfilled'))
  assert.equal((await address(data).get()).data().generation, 1)
  assert.equal(auth.users.size, 1)
  await service.verify(verification(data, mails[0].code), ip)
  assert.equal(auth.users.size, 1)
  await assert.rejects(service.verify({ ...verification(data, mails[0].code), sessionSecret: sessionSecret() }, ip), errorCode('failed-precondition'))
})
test('Rejected resend preserves previous valid code; definitive transport failure restores it and retains reservations', async () => {
  let calls = 0, firstCode
  const { service, ip } = await fixture({ sendMail: async (_email, code) => { if (++calls === 1) { firstCode = code; return { messageId: 'first' } } throw Object.assign(new Error('Rejected before acceptance'), { definitive: true }) } })
  const first = input(), second = { ...input(first.email), sessionSecret: first.sessionSecret }
  await service.request(first, ip)
  await assert.rejects(service.request(second, ip), errorCode('resource-exhausted'))
  assert.equal((await address(first).get()).data().activeRequestId, first.requestId)
  clock += P.cooldownMs + 1
  assert.equal((await service.request(second, ip)).delivery, 'failed')
  assert.equal((await address(first).get()).data().activeRequestId, first.requestId)
  assert.equal((await budget()).reservations.length, 2)
  await service.verify(verification(first, firstCode), ip)
})
test('Unknown outcome never resends same request and uses the latest possibly delivered code', async () => {
  const sent = []
  const { service, ip } = await fixture({ sendMail: async (_email, code) => { sent.push(code); if (sent.length === 2) throw new Error('Connection lost after acceptance'); return { messageId: 'first' } } })
  const first = input(), second = input(first.email)
  await service.request(first, ip); clock += P.cooldownMs + 1
  assert.equal((await service.request(second, ip)).delivery, 'unknown')
  assert.equal((await service.request(second, ip)).replayed, true)
  assert.equal(sent.length, 2)
  await assert.rejects(service.verify(verification(first, sent[0]), ip), errorCode('failed-precondition'))
  await service.verify(verification(second, sent[1]), ip)
})
test('Expired dispatch does not call transport; expired daily reservation remains guarded and later releases', async () => {
  let transactions = 0
  const delayedDb = new Proxy(db, { get(target, property) { if (property === 'runTransaction') return async (callback, options) => { const value = await target.runTransaction(callback, options); if (++transactions === 2) clock += P.dispatchMs + 1; return value }; const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value } })
  const { service, mails, ip } = await fixture({ db: delayedDb }), data = input()
  assert.equal((await service.request(data, ip)).delivery, 'failed')
  assert.equal(mails.length, 0); assert.equal((await budget()).reservations.length, 1)
  const release = (await budget()).reservations[0].releaseAt
  await db.doc('_otpBudget/global').set({ reservations: [{ id: 'guarded', releaseAt: release }], admissions: [] })
  const limited = createOtpService({ db, auth: makeAuth(), secret: SECRET, now: () => clock, sendMail: async () => ({ messageId: 'fixture' }), dailyLimit: 1 })
  clock = release - 1
  await assert.rejects(limited.request(input(), ip), errorCode('resource-exhausted'))
  clock = release + 1
  await limited.request(input(), ip)
})
test('Valid codes verify at global cap and successful completion invalidates older generations', async () => {
  const { service, mails, ip } = await fixture(), first = input(), second = input(first.email)
  await service.request(first, ip); clock += P.cooldownMs + 1; await service.request(second, ip)
  await db.doc('_otpBudget/global').set({ reservations: Array.from({ length: 500 }, (_, index) => ({ id: 'full-' + index, releaseAt: clock + P.dailyMs })), admissions: [] })
  await service.verify(verification(second, mails[1].code), ip)
  await assert.rejects(service.verify(verification(first, mails[0].code), ip), errorCode('failed-precondition'))
  assert.equal((await address(first).get()).data().generation, 1)
})
test('Crash after Auth create and signing failure resume the recorded UID without another email', async () => {
  const auth = makeAuth(), create = auth.createUser.bind(auth), signing = auth.createCustomToken.bind(auth)
  let firstCreate = true, firstSign = true
  auth.createUser = async value => { const user = await create(value); if (firstCreate) { firstCreate = false; throw new Error('Lost create response') }; return user }
  auth.createCustomToken = async uid => { if (firstSign) { firstSign = false; throw new Error('IAM temporarily unavailable') }; return signing(uid) }
  const { service, mails, ip } = await fixture({ auth }), data = input()
  await service.request(data, ip)
  await assert.rejects(service.verify(verification(data, mails[0].code), ip))
  const storedUid = (await challenge(data)).targetUid
  assert.equal(auth.users.size, 1); assert.equal(auth.users.has(storedUid), true)
  await assert.rejects(service.verify(verification(data, mails[0].code), ip))
  assert.equal((await db.doc('clients/' + storedUid).get()).exists, true)
  await service.verify(verification(data, mails[0].code), ip)
  assert.equal(auth.users.size, 1); assert.equal(mails.length, 1)
  assert.equal((await challenge(data)).targetUid, storedUid)
})
test('Owner allowlist fails closed on send and verify, including receipts created before mode changed', async () => {
  const { service, mails, ip, auth } = await fixture(), data = input()
  await service.request(data, ip)
  const gated = createOtpService({ db, auth, secret: SECRET, now: () => clock, sendMail: async () => { throw new Error('Must not send') }, allowedEmails: [] })
  await assert.rejects(gated.request(input(), ip), errorCode('permission-denied'))
  await assert.rejects(gated.verify(verification(data, mails[0].code), ip), errorCode('permission-denied'))
  assert.equal(auth.users.size, 0)
})
test('Unknown verification requests and wrong sessions create no durable IP state', async () => {
  const { service, mails, ip } = await fixture(), data = input(), bogusIp = 'bogus-' + requestId()
  const rate = db.doc('_otpRateStates/ip_' + otpHash(SECRET, 'ip-verify', bogusIp))
  for (let i = 0; i < 3; i++) {
    await assert.rejects(service.verify({ requestId: requestId(), sessionSecret: sessionSecret(), code: '123456' }, bogusIp), errorCode('failed-precondition'))
  }
  assert.equal((await rate.get()).exists, false)
  await service.request(data, ip)
  await assert.rejects(service.verify({ ...verification(data, mails[0].code), sessionSecret: sessionSecret() }, bogusIp), errorCode('failed-precondition'))
  assert.equal((await rate.get()).exists, false)
  assert.equal((await challenge(data)).wrongAttempts, 0)
})
test('Durable IP limits count genuine wrong-code attempts and release after ten minutes, across service instances', async () => {
  const { service, mails, ip, auth } = await fixture(), data = input()
  await service.request(data, ip)
  for (let i = 1; i < P.sendIpLimit; i++) await service.request(data, ip)
  let newCode
  const other = createOtpService({ db, auth, secret: SECRET, now: () => clock, sendMail: async (_email, code) => { newCode = code; return { messageId: 'fixture' } } })
  await assert.rejects(other.request(data, ip), errorCode('resource-exhausted'))
  assert.equal(mails.length, 1)
  const verifyRate = db.doc('_otpRateStates/ip_' + otpHash(SECRET, 'ip-verify', ip))
  await verifyRate.set({ kind: 'ip', calls: Array.from({ length: P.verifyIpLimit - 1 }, () => clock), deleteAfter: Timestamp.fromMillis(clock + P.rateWindowMs + P.dispatchGuardMs) })
  const wrong = mails[0].code === '000000' ? '000001' : '000000'
  await assert.rejects(other.verify(verification(data, wrong), ip), errorCode('failed-precondition'))
  assert.equal((await challenge(data)).wrongAttempts, 1)
  assert.equal((await verifyRate.get()).data().calls.length, P.verifyIpLimit)
  await assert.rejects(other.verify(verification(data, mails[0].code), ip), errorCode('resource-exhausted'))
  assert.equal((await challenge(data)).wrongAttempts, 1)
  clock += P.rateWindowMs + 1
  const fresh = input(data.email)
  await other.request(fresh, ip)
  assert.match((await other.verify(verification(fresh, newCode), ip)).customToken, /^fixture-token-/)
})
test('Operation instrumentation records the actual uncontended Firestore path without faking transactions', async t => {
  const counts = { reads: 0, writes: 0, transactions: 0 }
  const instrumented = new Proxy(db, { get(target, property) {
    if (property === 'runTransaction') return (callback, options) => target.runTransaction(async tx => {
      counts.transactions++
      const wrapped = new Proxy(tx, { get(transaction, method) {
        const value = Reflect.get(transaction, method)
        if (method === 'getAll') return (...refs) => { counts.reads += refs.length; return value.apply(transaction, refs) }
        if (method === 'get') return (...args) => { counts.reads++; return value.apply(transaction, args) }
        if (['create', 'set', 'update', 'delete'].includes(method)) return (...args) => { counts.writes++; return value.apply(transaction, args) }
        return typeof value === 'function' ? value.bind(transaction) : value
      } })
      return callback(wrapped)
    }, options)
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value
  } })
  const { service, mails, ip } = await fixture({ db: instrumented }), data = input()
  await service.request(data, ip); await service.verify(verification(data, mails[0].code), ip)
  t.diagnostic(`Uncontended new-user OTP: ${counts.reads} Firestore reads, ${counts.writes} writes, ${counts.transactions} transaction callbacks; Auth/IAM/transport not counted.`)
  assert.ok(counts.reads <= 40); assert.ok(counts.writes <= 20)
})

test('Crash after SES accepts but before finalization replays as unknown after dispatch deadline, without another email', async () => {
  let transactions = 0, crash = true
  const crashingDb = new Proxy(db, { get(target, property) {
    if (property === 'runTransaction') return async (callback, options) => { if (++transactions === 4 && crash) { crash = false; throw new Error('Server stopped before delivery save') }; return target.runTransaction(callback, options) }
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value
  } })
  const { service, mails, ip } = await fixture({ db: crashingDb }), data = input()
  await assert.rejects(service.request(data, ip))
  assert.equal(mails.length, 1); assert.equal((await challenge(data)).delivery, 'pending')
  clock += P.dispatchMs + 1
  const replay = await service.request(data, ip)
  assert.equal(replay.delivery, 'unknown'); assert.equal(replay.replayed, true)
  assert.equal(mails.length, 1)
  await service.verify(verification(data, mails[0].code), ip)
})

test('An acknowledged OTP-created Auth user deleted before retry is not recreated', async () => {
  const auth = makeAuth(), signing = auth.createCustomToken.bind(auth)
  let fail = true
  auth.createCustomToken = async uid => { if (fail) { fail = false; throw new Error('Signing unavailable') }; return signing(uid) }
  const { service, mails, ip } = await fixture({ auth }), data = input()
  await service.request(data, ip)
  await assert.rejects(service.verify(verification(data, mails[0].code), ip))
  const saved = await challenge(data)
  assert.equal(saved.targetKind, 'existing')
  auth.users.delete(saved.targetUid)
  await assert.rejects(service.verify(verification(data, mails[0].code), ip), errorCode('failed-precondition'))
  assert.equal(auth.users.size, 0); assert.equal(auth.tokens.length, 0)
})

test('Expired completion lease after Auth side effect returns no token, then resumes the same UID inside fixed receipt', async () => {
  const auth = makeAuth(), create = auth.createUser.bind(auth)
  let slow = true
  auth.createUser = async value => { const created = await create(value); if (slow) { slow = false; clock += P.leaseMs + 1 }; return created }
  const { service, mails, ip } = await fixture({ auth }), data = input()
  await service.request(data, ip)
  await assert.rejects(service.verify(verification(data, mails[0].code), ip), errorCode('failed-precondition'))
  const uid = (await challenge(data)).targetUid, receipt = (await challenge(data)).completionUntil
  assert.equal(auth.tokens.length, 0); assert.equal(auth.users.size, 1)
  assert.equal((await db.doc('clients/' + uid).get()).exists, false)
  await service.verify(verification(data, mails[0].code), ip)
  assert.equal(auth.users.size, 1); assert.equal((await challenge(data)).targetUid, uid)
  assert.equal((await challenge(data)).completionUntil, receipt, 'Retry must not extend the receipt')
})
test('Lease expiry during token signing never returns that minted token; bounded retry can finish', async () => {
  const auth = makeAuth(), signing = auth.createCustomToken.bind(auth)
  let slow = true
  auth.createCustomToken = async uid => { const token = await signing(uid); if (slow) { slow = false; clock += P.leaseMs + 1 }; return token }
  const { service, mails, ip } = await fixture({ auth }), data = input()
  await service.request(data, ip)
  await assert.rejects(service.verify(verification(data, mails[0].code), ip), errorCode('failed-precondition'))
  assert.equal(auth.tokens.length, 1, 'A minted token remains internal when final receipt commit fails')
  const done = await service.verify(verification(data, mails[0].code), ip)
  assert.match(done.customToken, /-2$/)
  const receipt = (await challenge(data)).completionUntil
  clock = receipt + 1
  await assert.rejects(service.verify(verification(data, mails[0].code), ip), errorCode('failed-precondition'))
  assert.equal(auth.tokens.length, 2)
})


test('Safe delivery stages preserve definitive and unknown reservations, replay behavior and log privacy', async () => {
  for (const [stage, definitive] of [['metadata', true], ['federation', true], ['configuration', true], ['ses', false]]) {
    let sends = 0
    const { service, ip, events } = await fixture({ sendMail: async () => {
      sends++
      throw Object.assign(new OtpDeliveryError(definitive, stage), {
        rawError: 'private-jwt user@example.com 012345', recipient: 'user@example.com', code: '012345',
      })
    } })
    const data = input(), delivery = definitive ? 'failed' : 'unknown'
    assert.equal((await service.request(data, ip)).delivery, delivery)
    assert.deepEqual(events, [{ name: 'otp_delivery', delivery, stage, category: definitive ? 'explicit-rejection' : 'ambiguous' }])
    assert.equal((await budget()).reservations.length, 1)
    assert.equal((await address(data).get()).data().reservations.length, 1)
    assert.equal((await challenge(data)).delivery, delivery)
    assert.equal((await address(data).get()).data().activeRequestId, definitive ? '' : data.requestId)
    assert.equal((await service.request(data, ip)).replayed, true)
    assert.equal(sends, 1)
    assert.equal(events.length, 1)
    const serialized = JSON.stringify(events)
    for (const privateValue of ['private-jwt', data.email, data.requestId, data.sessionSecret, '012345', 'user@example.com']) {
      assert.ok(!serialized.includes(privateValue))
    }
  }
})

test('Delivery logs discard unrecognized stage and derive category from outcome instead of external text', async () => {
  for (const stage of ['private-jwt user@example.com 012345', { private: 'jwt' }, 'ses']) {
    const { service, ip, events } = await fixture({ sendMail: async () => {
      throw Object.assign(new Error('private-jwt user@example.com 012345'), { definitive: false, stage, category: 'private-provider-category' })
    } })
    assert.equal((await service.request(input(), ip)).delivery, 'unknown')
    assert.deepEqual(events, [{ name: 'otp_delivery', delivery: 'unknown', ...(stage === 'ses' ? { stage: 'ses', category: 'ambiguous' } : {}) }])
    assert.ok(!JSON.stringify(events).includes('private'))
    assert.equal((await budget()).reservations.length, 1)
  }
})
