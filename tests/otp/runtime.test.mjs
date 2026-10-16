import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const api = require('./lib/otpRuntime.js')
const { declaredParams } = require('firebase-functions/params')
const parameter = name => declaredParams.find(item => item.name === name)?.toSpec()

test('OTP deployment manifest binds Turnstile only to sending and preserves runtime limits', () => {
  for (const [name, secrets] of [
    ['requestClientOtp', ['OTP_HMAC_SECRET', 'OTP_TURNSTILE_SECRET']],
    ['verifyClientOtp', ['OTP_HMAC_SECRET']],
  ]) {
    const endpoint = api[name].__endpoint
    assert.deepEqual(endpoint.secretEnvironmentVariables.map(item => item.key).sort(), secrets)
    assert.deepEqual(endpoint.region, ['europe-west3'])
    assert.equal(endpoint.serviceAccountEmail.toJSON(), 'params.OTP_RUNTIME_SERVICE_ACCOUNT')
    assert.equal(endpoint.platform, 'gcfv2')
    assert.equal(endpoint.minInstances, 0)
    assert.equal(endpoint.maxInstances, 2)
    assert.equal(endpoint.concurrency, 10)
    assert.equal(endpoint.availableMemoryMb, 256)
    assert.equal(endpoint.timeoutSeconds, 60)
    assert.deepEqual(endpoint.httpsTrigger.invoker, ['public'])
  }
})

test('OTP runtime keeps its dedicated identity, closed defaults and daily sending cap', () => {
  assert.equal(parameter('OTP_RUNTIME_SERVICE_ACCOUNT')?.default, 'otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com')
  assert.equal(parameter('OTP_ENABLED')?.default, false)
  assert.equal(parameter('OTP_PUBLIC_ENABLED')?.default, false)
  assert.equal(parameter('OTP_TRUSTED_PROXY_HOPS')?.default, 0)
  assert.equal(parameter('OTP_DAILY_LIMIT')?.default, 500)
})

test('Real Firebase HTTP wrappers stay closed before Auth, Firestore or AWS initialization', async t => {
  const priorEnabled = process.env.OTP_ENABLED
  process.env.OTP_ENABLED = 'false'
  t.after(() => {
    if (priorEnabled === undefined) delete process.env.OTP_ENABLED
    else process.env.OTP_ENABLED = priorEnabled
  })
  const { getApps } = require('firebase-admin/app')
  assert.equal(getApps().length, 0)
  const awsModule = require.resolve('@aws-sdk/client-sesv2')
  assert.equal(require.cache[awsModule], undefined)
  const express = require('express'), app = express()
  app.use(express.json())
  app.post('/request', api.requestClientOtp)
  app.post('/verify', api.verifyClientOtp)
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections()
    server.close(error => error ? reject(error) : resolve())
  }))
  const common = { requestId: 'request-id-00000000001', sessionSecret: 's'.repeat(43) }
  for (const [operation, data] of [
    ['request', { ...common, email: 'user@example.com', turnstileToken: 'fresh-bot-token' }],
    ['verify', { ...common, code: '012345' }],
  ]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${operation}`, {
      method: 'POST',
      headers: { origin: 'https://majstorsada.rs', 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'unavailable')
    assert.match(response.headers.get('cache-control'), /no-store/)
  }
  assert.equal(getApps().length, 0)
  assert.equal(require.cache[awsModule], undefined)
})

test('Published SDK diagnostic defaults refuse requests without initializing account or AWS work', async t => {
  const keys=['OTP_ENABLED','OTP_PUBLIC_ENABLED','OTP_DIAGNOSTICS_WINDOW_START','OTP_DIAGNOSTIC_GOOGLE_SUBJECT','OTP_DIAGNOSTIC_GOOGLE_EMAIL']
  const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
  Object.assign(process.env,{OTP_ENABLED:'false',OTP_PUBLIC_ENABLED:'false',OTP_DIAGNOSTICS_WINDOW_START:'',OTP_DIAGNOSTIC_GOOGLE_SUBJECT:'123456789012345678901',OTP_DIAGNOSTIC_GOOGLE_EMAIL:'operator@example.com'})
  t.after(()=>{for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key]}})
  const express=require('express'),app=express();app.use(express.json());app.post('/request',api.requestClientOtp);app.post('/verify',api.verifyClientOtp)
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))})
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}))
  for(const route of ['request','verify']) {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/${route}`,{method:'POST',headers:{origin:'https://majstorsada.rs','content-type':'application/json','x-otp-diagnostic':'ingress-v1'},body:JSON.stringify({diagnostic:'ingress-v1',nonce:Buffer.alloc(32,5).toString('base64url')}),signal:AbortSignal.timeout(5000)})
    assert.equal(response.status,503);assert.equal((await response.json()).code,'unavailable')
  }
  assert.equal(require('firebase-admin/app').getApps().length,0)
  assert.equal(require.cache[require.resolve('@aws-sdk/client-sesv2')],undefined)
})

const runtimeSource = stripTypeScriptTypes(readFileSync(new URL('../../functions/src/otpRuntime.ts', import.meta.url), 'utf8'))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

async function runtimeFixture(options = {}) {
  const calls = { demo: options.demo ?? false, transportImports: 0, senderInitializations: 0, serviceInitializations: 0,
    firestoreInitializations: 0, parameterReads: [], deliveries: [], outbox: [], events: [], senderConfigs: [] }
  const transportStarted = deferred(), apps = [], modules = new Map()
  const context = vm.createContext({ process: { env: { GCLOUD_PROJECT: 'fixture-project' } }, Date })
  const db = options.db || { doc: path => ({ create: async data => { calls.outbox.push({ path, data }) } }) }
  const values = { OTP_ENABLED: true, OTP_PUBLIC_ENABLED: true, OTP_SEND_ENABLED: true,
    OTP_HMAC_SECRET: 'fixture-only-HMAC-secret-with-32-plus-bytes', OTP_TURNSTILE_SECRET: 'fixture-only-bot-secret',
    OTP_AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/majstorsada-otp', OTP_AWS_AUDIENCE: 'majstorsada-otp-ses',
    OTP_GOOGLE_SUBJECT: '123456789012345678901' }
  const parameter = (name, config = {}) => ({ value: () => { calls.parameterReads.push(name); return values[name] ?? config.default } })
  const imports = {
    'node:crypto': { randomUUID: () => 'fixture-outbox-' + (calls.outbox.length + 1) },
    'firebase-admin/app': { getApps: () => apps, initializeApp: (_config, name) => { const app = { name }; apps.push(app); return app } },
    'firebase-admin/auth': { getAuth: () => ({}) },
    'firebase-admin/firestore': { getFirestore: () => { calls.firestoreInitializations++; return db } },
    'firebase-functions/params': { defineBoolean: parameter, defineInt: parameter, defineSecret: parameter, defineString: parameter },
    'firebase-functions/v2/https': { HttpsError: Error, onRequest: (_config, handler) => handler },
    'firebase-functions/logger': { info: (_message, event) => calls.events.push(event), error: () => {} },
    './otpDiagnostics': { createOtpDiagnostics: () => ({}) },
    './otpHttp': {
      isOtpDemoEnvironment: () => calls.demo,
      createTurnstileVerifier: () => async () => {},
      createOtpHandler: config => async data => {
        const service = await config.serviceFactory()
        return service[config.operation === 'request' ? 'request' : 'verify'](data, 'fixture-ip')
      },
    },
    './otpService': { createOtpService: config => {
      calls.serviceInitializations++
      if (options.realService) return require('./lib/otpService.js').createOtpService({ ...config, now: () => 100000 })
      return {
        verify: async () => ({ customToken: 'fixture-custom-token' }),
        request: async data => data.replayed ? { replayed: true } : config.sendMail(data.email, data.code, data.dispatchUntil),
      }
    } },
    './otpTransport': { createSesOtpSender: config => {
      const senderId = ++calls.senderInitializations
      calls.senderConfigs.push({ ...config })
      options.initialize?.(senderId)
      return async (...args) => {
        calls.deliveries.push({ senderId, args })
        return options.send ? options.send(...args) : { messageId: 'fixture-message' }
      }
    } },
  }
  function module(name) {
    assert.ok(imports[name], 'Unexpected runtime import ' + name)
    if (!modules.has(name)) modules.set(name, new vm.SyntheticModule(Object.keys(imports[name]), function () {
      for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value)
    }, { context }))
    return modules.get(name)
  }
  const runtime = new vm.SourceTextModule(runtimeSource, { context, importModuleDynamically: async name => {
    assert.equal(name, './otpTransport')
    const attempt = ++calls.transportImports
    transportStarted.resolve()
    if (options.transportReady) await options.transportReady
    options.importTransport?.(attempt)
    const dependency = module(name)
    if (dependency.status === 'unlinked') await dependency.link(() => {})
    if (dependency.status === 'linked') await dependency.evaluate()
    return dependency
  } })
  await runtime.link(module)
  await runtime.evaluate()
  return { api: runtime.namespace, calls, transportStarted: transportStarted.promise }
}

const mail = { email: 'user@example.test', code: '012345', dispatchUntil: 160000 }

test('Warm and concurrent verification, plus a replayed request, never load the email transport', async () => {
  const f = await runtimeFixture()
  const verified = await Promise.all(Array.from({ length: 10 }, () => f.api.verifyClientOtp({})))
  assert.ok(verified.every(result => result.customToken === 'fixture-custom-token'))
  await f.api.verifyClientOtp({})
  assert.equal((await f.api.requestClientOtp({ replayed: true })).replayed, true)
  assert.equal(f.calls.serviceInitializations, 1)
  assert.equal(f.calls.firestoreInitializations, 1)
  assert.equal(f.calls.transportImports, 0)
  assert.equal(f.calls.senderInitializations, 0)
  assert.equal(f.calls.parameterReads.some(name => name.startsWith('OTP_AWS_') || name === 'OTP_GOOGLE_SUBJECT'), false)
})

test('Concurrent sends share one lazy sender while verification proceeds during initialization', { timeout: 5000 }, async () => {
  const ready = deferred(), f = await runtimeFixture({ transportReady: ready.promise })
  const sending = Promise.all(Array.from({ length: 10 }, (_, index) => f.api.requestClientOtp({ ...mail, dispatchUntil: 160000 + index })))
  await f.transportStarted
  assert.equal(f.calls.transportImports, 1)
  assert.equal(f.calls.senderInitializations, 0)
  assert.equal((await f.api.verifyClientOtp({})).customToken, 'fixture-custom-token')
  ready.resolve()
  assert.equal((await sending).length, 10)
  await f.api.requestClientOtp(mail)
  assert.equal(f.calls.serviceInitializations, 1)
  assert.equal(f.calls.transportImports, 1)
  assert.equal(f.calls.senderInitializations, 1)
  assert.equal(f.calls.deliveries.length, 11)
  assert.ok(f.calls.deliveries.every(item => item.senderId === 1))
  assert.deepEqual(f.calls.deliveries.slice(0, 10).map(item => item.args), Array.from({ length: 10 }, (_, index) => [mail.email, mail.code, 160000 + index]))
  assert.deepEqual(f.calls.senderConfigs, [{ roleArn: 'arn:aws:iam::123456789012:role/majstorsada-otp', audience: 'majstorsada-otp-ses', googleSubject: '123456789012345678901', region: 'eu-central-1' }])
})

test('Failed transport import or sender construction is unsent and a later request can initialize again', async t => {
  for (const stage of ['import', 'construction']) await t.test(stage, async () => {
    const ready = deferred(), privateDetail = 'private-provider-detail user@example.test 012345'
    const f = await runtimeFixture({ transportReady: ready.promise,
      importTransport: attempt => { if (stage === 'import' && attempt === 1) throw new Error(privateDetail) },
      initialize: attempt => { if (stage === 'construction' && attempt === 1) throw new Error(privateDetail) },
    })
    const failures = Promise.allSettled(Array.from({ length: 5 }, () => f.api.requestClientOtp(mail)))
    await f.transportStarted
    ready.resolve()
    for (const result of await failures) {
      assert.equal(result.status, 'rejected')
      assert.equal(result.reason.definitive, true)
      assert.equal(result.reason.stage, 'configuration')
      assert.equal(result.reason.category, 'explicit-rejection')
      assert.equal(result.reason.message, 'OTP email transport failed')
      assert.equal(result.reason.cause, undefined)
      assert.ok(!JSON.stringify(result.reason).includes(privateDetail))
    }
    assert.equal(f.calls.transportImports, 1)
    assert.equal(f.calls.deliveries.length, 0)
    assert.equal((await f.api.verifyClientOtp({})).customToken, 'fixture-custom-token')
    assert.equal((await f.api.requestClientOtp(mail)).messageId, 'fixture-message')
    assert.equal(f.calls.transportImports, 2)
    assert.equal(f.calls.senderInitializations, stage === 'import' ? 1 : 2)
    assert.equal(f.calls.serviceInitializations, 1)
    assert.equal(f.calls.deliveries.length, 1)
  })
})

test('An ambiguous delivery is attempted once and preserves the initialized sender for later requests', async () => {
  const failure = Object.assign(new Error('OTP email transport failed'), { definitive: false, stage: 'ses' })
  let attempts = 0
  const f = await runtimeFixture({ send: async () => { if (++attempts === 1) throw failure; return { messageId: 'later-message' } } })
  await assert.rejects(() => f.api.requestClientOtp(mail), error => error === failure)
  assert.equal(attempts, 1)
  assert.equal((await f.api.requestClientOtp(mail)).messageId, 'later-message')
  assert.equal(attempts, 2)
  assert.equal(f.calls.transportImports, 1)
  assert.equal(f.calls.senderInitializations, 1)
})

function localRequestDb() {
  const documents = new Map()
  const doc = path => ({ path, id: path.split('/').at(-1) })
  const snapshot = ref => ({ data: () => documents.get(ref.path) })
  const db = { doc, runTransaction: async callback => callback({
    get: async ref => snapshot(ref), getAll: async (...refs) => refs.map(snapshot),
    set: (ref, value) => documents.set(ref.path, value),
    create: (ref, value) => { assert.equal(documents.has(ref.path), false); documents.set(ref.path, value) },
    update: (ref, value) => { assert.ok(documents.has(ref.path)); documents.set(ref.path, { ...documents.get(ref.path), ...value }) },
  }) }
  return { db, documents }
}

test('The real OTP service records initialization failure as failed, keeps its quota, and never resends a replay', async () => {
  const { db, documents } = localRequestDb()
  const f = await runtimeFixture({ db, realService: true, initialize: attempt => { if (attempt === 1) throw new Error('private-configuration-detail') } })
  const data = { requestId: 'failed-request-id-0000001', email: 'first@example.test', sessionSecret: 's'.repeat(43) }
  assert.equal((await f.api.requestClientOtp(data)).delivery, 'failed')
  assert.equal(documents.get('_otpChallenges/' + data.requestId).delivery, 'failed')
  assert.equal(documents.get('_otpBudget/global').reservations.length, 1)
  assert.equal(f.calls.deliveries.length, 0)
  const replayed = await f.api.requestClientOtp(data)
  assert.equal(replayed.delivery, 'failed')
  assert.equal(replayed.replayed, true)
  assert.equal(f.calls.senderInitializations, 1)
  assert.equal((await f.api.requestClientOtp({ ...data, requestId: 'successful-request-id-000001', email: 'second@example.test' })).delivery, 'accepted')
  assert.equal(f.calls.senderInitializations, 2)
  assert.equal(f.calls.deliveries.length, 1)
  assert.equal(documents.get('_otpBudget/global').reservations.length, 2)
  assert.deepEqual(f.calls.events[0], { name: 'otp_delivery', delivery: 'failed', stage: 'configuration', category: 'explicit-rejection' })
  assert.ok(!JSON.stringify(f.calls.events).includes('private-configuration-detail'))
})

test('The demo outbox skips AWS initialization and checks the emulator guard on every send', async () => {
  const f = await runtimeFixture({ demo: true })
  await f.api.verifyClientOtp({})
  assert.equal((await f.api.requestClientOtp(mail)).messageId, 'fixture-outbox-1')
  assert.equal(f.calls.outbox.length, 1)
  assert.equal(f.calls.outbox[0].path, '_otpTestOutbox/fixture-outbox-1')
  assert.equal(f.calls.outbox[0].data.email, mail.email)
  assert.equal(f.calls.outbox[0].data.code, mail.code)
  assert.equal(f.calls.transportImports, 0)
  assert.equal(f.calls.senderInitializations, 0)
  f.calls.demo = false
  await assert.rejects(() => f.api.requestClientOtp(mail), /OTP demo environment changed/)
  assert.equal(f.calls.outbox.length, 1)
  assert.equal(f.calls.transportImports, 0)
})