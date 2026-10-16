import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { createOtpHandler, createTurnstileVerifier, trustedOtpIp } = require('./lib/otpHttp.js')
const requestData = { requestId: 'request-id-00000000001', email: 'user@example.com', sessionSecret: 's'.repeat(43), turnstileToken: 'fresh-bot-token' }
const verifyData = { requestId: requestData.requestId, sessionSecret: requestData.sessionSecret, code: '012345' }
const origin = 'https://majstorsada.rs'
const invoke = async (handler, data, overrides = {}) => {
  const headers = { origin, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.4', ...overrides.headers }
  const req = { method: 'POST', body: { data }, socket: { remoteAddress: '127.0.0.1' }, ...overrides, get: name => headers[name.toLowerCase()] }
  let status, body; const output = {}
  const res = { setHeader(name, value) { output[name] = value }, status(value) { status = value; return this }, send(value) { body = value; return this } }
  await handler(req, res); return { status, body, headers: output }
}
function setup(extra = {}) {
  const calls = { bot: 0, service: 0, request: 0, verify: 0 }
  const config = { operation: 'request', enabled: () => true, trustedProxyHops: () => 1,
    verifyBot: async (token, context) => { calls.bot++; assert.equal(token, requestData.turnstileToken); assert.equal(context.requestId, requestData.requestId); assert.equal(context.ip, '198.51.100.4') },
    serviceFactory: () => { calls.service++; return { request: async (data, ip) => { calls.request++; assert.equal(data.turnstileToken, undefined); assert.equal(ip, '198.51.100.4'); return { requestId: data.requestId } }, verify: async () => { calls.verify++; return { customToken: 'private-custom-token' } } } }, ...extra }
  return { handler: createOtpHandler(config), calls }
}
test('Disabled, foreign/missing origin, bad method/content/body all cause no expensive work', async () => {
  const cases = [{ config: { enabled: () => false }, status: 503 }, { headers: { origin: 'https://attacker.test' }, status: 403 }, { headers: { origin: undefined }, status: 403 }, { method: 'GET', status: 405 }, { headers: { 'content-type': 'text/plain' }, status: 400 }, { body: { data: { ...requestData, uid: 'attacker' } }, status: 400 }, { body: { data: { ...requestData, sessionSecret: 'weak' } }, status: 400 }, { rawBody: Buffer.from('x'.repeat(4097)), status: 400 }]
  for (const item of cases) {
    const { handler, calls } = setup(item.config)
    const result = await invoke(handler, requestData, item)
    assert.equal(result.status, item.status); assert.deepEqual(calls, { bot: 0, service: 0, request: 0, verify: 0 })
  }
})
test('Request body uses actual bytes, ignores forged content-length, and only dispatches sanitized data', async () => {
  const { handler, calls } = setup()
  assert.equal((await invoke(handler, requestData, { headers: { 'content-length': '1' }, rawBody: Buffer.from(JSON.stringify({ data: { ...requestData, padding: 'x'.repeat(5000) } })) })).status, 400)
  assert.equal((await invoke(handler, requestData)).status, 200)
  assert.deepEqual(calls, { bot: 1, service: 1, request: 1, verify: 0 })
})
test('Allowlist distinguishes closed empty list from public undefined and bot rejection fails closed', async () => {
  let pair = setup({ allowedEmails: () => [] })
  assert.equal((await invoke(pair.handler, requestData)).status, 503); assert.equal(pair.calls.bot, 0)
  pair = setup({ allowedEmails: () => ['USER@example.com'] })
  assert.equal((await invoke(pair.handler, requestData)).status, 200)
  pair = setup({ verifyBot: async () => { throw new Error('secret details') } })
  const rejected = await invoke(pair.handler, requestData)
  assert.equal(rejected.status, 500); assert.ok(!JSON.stringify(rejected.body).includes('secret')); assert.equal(pair.calls.service, 0)
})
test('Verify does not require interactive bot token, validates code as string and keeps token response uncacheable', async () => {
  const { handler, calls } = setup({ operation: 'verify' })
  const result = await invoke(handler, verifyData)
  assert.equal(result.status, 200); assert.equal(result.headers['Cache-Control'], 'private, no-store'); assert.equal(calls.bot, 0); assert.equal(calls.verify, 1)
  assert.equal((await invoke(handler, { ...verifyData, code: 123456 })).status, 400)
  assert.equal((await invoke(handler, { ...verifyData, code: 'ABCDEF' })).status, 400)
})
test('Local bounded burst brake stops work before bot verification', async () => {
  const { handler, calls } = setup({ now: () => 1000 })
  for (let index = 0; index < 20; index++) assert.equal((await invoke(handler, requestData)).status, 200)
  const limited = await invoke(handler, requestData)
  assert.equal(limited.status, 429); assert.equal(limited.headers['Retry-After'], '60'); assert.equal(calls.bot, 20)
})
test('Right-edge IP is explicit and spoofable caller prefixes/CF header cannot override it', () => {
  const req = header => ({ get: () => header, headers: { 'cf-connecting-ip': '1.1.1.1' } })
  assert.throws(() => trustedOtpIp(req('198.51.100.4')))
  assert.equal(trustedOtpIp(req('spoofed, 1.1.1.1, 198.51.100.4'), { trustedProxyHops: 1 }), '198.51.100.4')
  assert.equal(trustedOtpIp(req('1.1.1.1, 198.51.100.4, 35.1.1.1'), { trustedProxyHops: 2 }), '198.51.100.4')
  assert.throws(() => trustedOtpIp(req('1.1.1.1'), { trustedProxyHops: 2 }))
  assert.throws(() => trustedOtpIp(req('spoofed'), { trustedProxyHops: 1 }))
})
test('Turnstile checks hostname/action/cdata and rejects replay, remote error and mismatch', async () => {
  const context = { requestId: requestData.requestId, ip: '198.51.100.4' }
  let calls = 0
  const verifier = result => createTurnstileVerifier({ secret: 'server-only-secret-value', fetch: async (url, options) => {
    calls++; assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify'); assert.ok(options.signal instanceof AbortSignal)
    const posted = JSON.parse(options.body); assert.equal(posted.remoteip, context.ip); assert.equal(posted.response, 'token'); return Response.json(result)
  } })
  const valid = { success: true, hostname: 'majstorsada.rs', action: 'client_otp', cdata: context.requestId }
  await verifier(valid)('token', context)
  for (const result of [{ ...valid, success: false }, { ...valid, hostname: 'attacker.test' }, { ...valid, action: 'another_action' }, { ...valid, cdata: 'another-request' }]) await assert.rejects(() => verifier(result)('token', context), error => error.code === 'permission-denied')
  const unavailable = createTurnstileVerifier({ secret: 'server-only-secret-value', fetch: async () => { throw new Error('timeout') } })
  await assert.rejects(() => unavailable('token', context), error => error.code === 'unavailable')
  assert.equal(calls, 5)
})


test('Conservative email normalization agrees with core policy and rejects syntax before bot work', async () => {
  const { handler, calls } = setup()
  assert.equal((await invoke(handler, { ...requestData, email: ' USER@example.com ' })).status, 200)
  for (const email of ['u..ser@example.com', '.user@example.com', 'user@-example.com', 'user@example.c', 'user@one@example.com']) assert.equal((await invoke(handler, { ...requestData, email })).status, 400)
  assert.equal(calls.bot, 1); assert.equal(calls.request, 1)
})

test('Actual Express/onRequest adapter evaluates strict demo guard after late emulator environment setup', async () => {
  const express = require('express')
  const { onRequest, HttpsError } = require('firebase-functions/v2/https')
  const { isOtpDemoEnvironment } = require('./lib/otpHttp.js')
  const keys = ['GCLOUD_PROJECT', 'FUNCTIONS_EMULATOR', 'OTP_DEMO_MODE', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  let server, botCalls = 0, serviceCalls = 0
  try {
    for (const key of keys) delete process.env[key]
    const handler = onRequest({ region: 'europe-west3' }, createOtpHandler({
      operation: 'request', enabled: () => true, demo: isOtpDemoEnvironment, trustedProxyHops: () => 0,
      verifyBot: async () => { botCalls++; throw new HttpsError('permission-denied', 'Invalid test bot token') },
      serviceFactory: () => { serviceCalls++; throw new Error('Must not reach service') }
    }))
    Object.assign(process.env, { GCLOUD_PROJECT: 'demo-majstorsada-http', FUNCTIONS_EMULATOR: 'true', OTP_DEMO_MODE: 'true', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8289', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9198' })
    assert.equal(isOtpDemoEnvironment(), true)
    const app = express(); app.use(express.json()); app.post('/request', handler)
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    const response = await fetch(`http://127.0.0.1:${server.address().port}/request`, { method: 'POST', headers: { Origin: 'http://localhost:3333', 'Content-Type': 'application/json', 'X-Forwarded-For': 'caller-controlled', 'CF-Connecting-IP': '1.1.1.1' }, body: JSON.stringify({ data: requestData }) })
    assert.equal(response.status, 403); assert.equal((await response.json()).code, 'permission-denied')
    assert.equal(botCalls, 1); assert.equal(serviceCalls, 0)
    process.env.GCLOUD_PROJECT = 'real-production-project'
    const closed = await fetch(`http://127.0.0.1:${server.address().port}/request`, { method: 'POST', headers: { Origin: 'http://localhost:3333', 'Content-Type': 'application/json' }, body: JSON.stringify({ data: requestData }) })
    assert.equal(closed.status, 403); assert.equal(botCalls, 1)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
  }
})
test('Strict loopback emulator accepts a wrapped request without socket metadata but production remains closed', () => {
  const previous = Object.fromEntries(['GCLOUD_PROJECT', 'FUNCTIONS_EMULATOR', 'OTP_DEMO_MODE', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'].map(name => [name, process.env[name]]))
  try {
    Object.assign(process.env, { GCLOUD_PROJECT: 'demo-majstorsada-e2e', FUNCTIONS_EMULATOR: 'true', OTP_DEMO_MODE: 'true', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' })
    assert.equal(trustedOtpIp({ get: () => '203.0.113.9' }, { demo: true }), '127.0.0.1')
    process.env.GCLOUD_PROJECT = 'majstorsada-b2ad4'
    assert.throws(() => trustedOtpIp({ get: () => '203.0.113.9' }, { demo: true }), /Prijava kodom trenutno nije dostupna/)
  } finally { for (const [name, value] of Object.entries(previous)) if (value === undefined) delete process.env[name]; else process.env[name] = value }
})
