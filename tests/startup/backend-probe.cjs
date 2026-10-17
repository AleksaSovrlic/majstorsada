'use strict'
// Isolated real compiled entrypoint. No emulators, credentials or cloud access.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../..')
const sdkRequire = createRequire(path.join(root, 'functions/package.json'))
for (const name of ['node:http', 'node:https']) {
  const api = require(name)
  api.request = api.get = () => { throw new Error('Backend startup test attempted network access') }
}
require('node:net').connect = require('node:net').createConnection = () => { throw new Error('Backend startup test attempted network access') }
global.fetch = () => { throw new Error('Backend startup test attempted network access') }

async function main() {
  const entry = sdkRequire(path.join(root, 'functions/lib/index.js'))
  const metadata = {
    functions: Object.fromEntries(Object.entries(entry).filter(([,value]) => typeof value === 'function').map(([name,value]) => [name, { endpoint: value.__endpoint, trigger: value.__trigger }])),
    params: sdkRequire('firebase-functions/params').declaredParams.map(param => param.toSpec()),
  }
  const pathsAtStartup = Object.keys(require.cache).map(file => file.replaceAll('\\', '/'))
  const phoneLoaded = () => Object.keys(require.cache).some(file => file.replaceAll('\\', '/').includes('/node_modules/libphonenumber-js/'))
  const lifecycle = sdkRequire(path.join(root, 'functions/lib/jobLifecycle.js'))
  const sdk = sdkRequire('firebase-admin/firestore')
  const actor = { uid: 'backend-startup-fixture', email: 'fixture@example.test', email_verified: true }
  const rolePaths = ['admins', 'tradespeople', 'clients'].map(collection => `${collection}/${actor.uid}`)

  function database(existing = []) {
    const state = { transactions: 0, transactionOptions: [], reads: [], creates: [] }
    const db = {
      doc: path => ({ path }),
      async runTransaction(action, ...options) {
        state.transactions++
        state.transactionOptions.push(options)
        return action({
          getAll: async (...refs) => {
            state.reads.push(refs.map(ref => ref.path))
            return refs.map(ref => ({ exists: existing.includes(ref.path.split('/')[0]), ref }))
          },
          create: (ref, value) => state.creates.push({ path: ref.path, value }),
          set: () => { throw new Error('Unexpected role write') },
          update: () => { throw new Error('Unexpected role write') },
          delete: () => { throw new Error('Unexpected role write') },
        })
      },
    }
    return { db, state }
  }

  const initialPhoneLoaded = phoneLoaded()
  const client = database()
  await lifecycle.completeRegistration(actor, { role: 'client' }, client.db)
  assert.equal(client.state.creates.length, 1)
  assert.deepEqual(client.state.reads, [rolePaths])
  const afterClientPhoneLoaded = phoneLoaded()

  const roleCases = []
  const originalGetFirestore = sdk.getFirestore
  try {
    for (const existing of [[], ['admins'], ['tradespeople'], ['clients'], ['admins', 'tradespeople'], ['admins', 'clients'], ['tradespeople', 'clients'], ['admins', 'tradespeople', 'clients']]) {
      const { db, state } = database(existing)
      sdk.getFirestore = () => db
      let outcome
      try { outcome = await lifecycle.resolveAccount(actor, {}) }
      catch (error) { outcome = { code: error.code, message: error.message } }
      assert.equal(state.transactions, 1)
      assert.deepEqual(state.transactionOptions, [[]], 'Keep default read-write transaction semantics')
      assert.deepEqual(state.reads, [rolePaths], 'Always read all three role documents together')
      assert.deepEqual(state.creates, [])
      roleCases.push({ existing, outcome })
    }
    const { db, state } = database(['clients'])
    sdk.getFirestore = () => db
    await assert.rejects(lifecycle.resolveAccount(actor, { forged: true }), { code: 'invalid-argument' })
    assert.equal(state.transactions, 0)
  } finally { sdk.getFirestore = originalGetFirestore }
  const afterRolePhoneLoaded = phoneLoaded()

  const registration = { role: 'tradesperson', displayName: 'Fixture Majstor', specialization: 'vodoinstalater', city: 'Beograd' }
  const cases = [
    { input: '0641234567', expected: '+381641234567' },
    { input: '+381641234567', expected: '+381641234567' },
    { input: '064 123 4567', expected: '+381641234567' },
    { input: '0111234567', expected: '+381111234567' },
    { input: '+381 11 123 4567', expected: '+381111234567' },
    { input: '00381641234567', expected: '+381641234567' },
    { input: '+442079460123', expected: '+442079460123' },
    { input: '123' }, { input: '' }, { input: 'nije telefon' },
    { input: '0'.repeat(31) }, { input: null }, { input: 641234567 }, { input: {} },
  ]
  const phones = []
  for (const fixture of cases) {
    const { db, state } = database()
    let outcome
    try {
      await lifecycle.completeRegistration(actor, { ...registration, phoneNumber: fixture.input }, db)
      outcome = { phone: state.creates[0].value.phoneNumber }
      assert.equal(state.transactions, 1)
      assert.deepEqual(state.reads, [rolePaths])
      assert.equal(outcome.phone, fixture.expected)
    } catch (error) {
      if (fixture.expected) throw error
      assert.equal(error.code, 'invalid-argument')
      assert.equal(error.message, 'Molimo unesite ispravan broj telefona.')
      assert.equal(state.transactions, 0, 'Reject invalid phone before database work')
      outcome = { code: error.code, message: error.message }
    }
    if (!fixture.expected) assert.equal(outcome.code, 'invalid-argument')
    phones.push({ ...fixture, outcome })
  }

  // createJob shares the same private validator; invalid input still stops before DB.
  const invalidRequest = { requestId: 'startup-phone-fixture', problemDescription: 'Curi test slavina', address: 'Test 1', coordinates: { lat: 44.8, lng: 20.46 }, city: 'Beograd', contactPhone: '123', specializationRequired: 'vodoinstalater', photoCount: 0 }
  let unexpectedDb = false
  try {
    sdk.getFirestore = () => { unexpectedDb = true; throw new Error('Database reached before invalid phone rejection') }
    await assert.rejects(lifecycle.createJob(actor, invalidRequest), { code: 'invalid-argument', message: 'Molimo unesite ispravan broj telefona.' })
    assert.equal(unexpectedDb, false)
  } finally { sdk.getFirestore = originalGetFirestore }

  process.stdout.write(JSON.stringify({ metadata, pathsAtStartup, initialPhoneLoaded, afterClientPhoneLoaded, afterRolePhoneLoaded, afterValidationPhoneLoaded: phoneLoaded(), roleCases, phones }))
}
main().then(() => process.exit(0), error => { process.stderr.write(String(error.stack || error)); process.exit(1) })
