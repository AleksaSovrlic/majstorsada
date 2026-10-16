import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  INGRESS_URLS, IngressProbeError, canonicalProbeIp, validateIngressProbeConfig,
  readIngressProbeConfig, discoverProbeIp, probeIngress, deriveIngressRoutes, readCloudIngressRoutes, verifyClosedIngress,
} from '../../tools/otp-ingress-probe.mjs'

const token = 'private-mock-oauth-token-never-persist'
const privateDetail = 'private-mock-response-or-fetch-detail'
const clientIp = '192.0.2.44'
const proxyIp = '35.1.2.3'
const now = Date.parse('2026-10-05T12:05:00.000Z')
const startedAt = '2026-10-05T12:00:00.000Z'
const root = fileURLToPath(new URL('../../', import.meta.url))
const config = (changes = {}) => Object.entries({
  OTP_ENABLED: 'false', OTP_PUBLIC_ENABLED: 'false', OTP_TRUSTED_PROXY_HOPS: '0', OTP_DAILY_LIMIT: '500',
  OTP_DIAGNOSTICS_WINDOW_START: startedAt, OTP_DIAGNOSTIC_GOOGLE_SUBJECT: '123456789012345678901',
  OTP_DIAGNOSTIC_GOOGLE_EMAIL: 'operator@example.com', ...changes,
}).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${value}\n`).join('')
const jsonResponse = (data, { status = 200, headers = {} } = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...headers },
})
function sanitized(error) {
  assert.ok(error instanceof IngressProbeError)
  assert.equal(error.cause, undefined)
  for (const value of [token, privateDetail, clientIp, proxyIp]) {
    assert.ok(!(error.stack + JSON.stringify(error)).includes(value), 'Failure must not expose transient private values')
  }
  return true
}
function cloud({ expected = clientIp, suffix = [proxyIp], mutate, respond, routes = INGRESS_URLS.map(url => ({url})) } = {}) {
  const calls = []
  let tokenCalls = 0
  const getToken = async () => { tokenCalls++; return token }
  const fetchImpl = async (url, options) => {
    const routeIndex = routes.findIndex(route => route.url === url)
    assert.ok(routeIndex >= 0, 'Probe is restricted to the two production Google OTP URLs')
    const prefix = options.headers['X-Forwarded-For']
    const callerIps = prefix === undefined ? [] : prefix.split(',').map(canonicalProbeIp)
    const request = JSON.parse(options.body)
    const context = { url, options, routeIndex, variantIndex: calls.length % 5, callIndex: calls.length }
    calls.push(context)
    const data = { ok: true, diagnostic: 'ingress-v1', nonce: request.nonce,
      forwarded: [...callerIps, expected, ...suffix], socketIp: '10.0.0.1' }
    if (mutate) await mutate(data, context)
    return respond ? respond(data, context) : jsonResponse(data)
  }
  return { calls, getToken, fetchImpl, tokenCalls: () => tokenCalls }
}

// The happy path includes reflected hostile prefixes; only the independently
// measured address and the stable suffix may determine the recommendation.
test('Both fixed Google OTP URLs reject spoofed left prefixes and report only metadata', async () => {
  const fake = cloud()
  const report = await probeIngress({ ...fake, expectedClientIp: clientIp, now: () => now })
  assert.equal(report.projectId, 'majstorsada-b2ad4')
  assert.equal(report.region, 'europe-west3')
  assert.equal(report.candidateTrustedProxyHops, 2)
  assert.equal(report.status, 'candidate_requires_operator_review')
  assert.equal(report.requestCount, 10)
  assert.equal(report.verifiedAt, new Date(now).toISOString())
  assert.equal(fake.tokenCalls(), 1)
  assert.equal(fake.calls.length, 10)
  assert.deepEqual(report.routes, ['requestClientOtp', 'verifyClientOtp'].map(name => ({
    function: name, surface: 'cloudfunctions', requests: 5, forwardedCounts: [2, 3, 3, 5, 3], spoofedPrefixesRejected: true,
  })))
  assert.deepEqual(INGRESS_URLS, ['requestClientOtp', 'verifyClientOtp'].map(name =>
    `https://europe-west3-majstorsada-b2ad4.cloudfunctions.net/${name}`))
  const nonces = new Set()
  for (const [index, { options, url }] of fake.calls.entries()) {
    assert.equal(options.method, 'POST')
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    assert.equal(options.signal.aborted, false)
    assert.equal(new URL(url).search, '')
    assert.equal(options.headers.Authorization, `Bearer ${token}`)
    assert.equal(options.headers.Origin, 'https://majstorsada.rs')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.equal(options.headers['X-OTP-Diagnostic'], 'ingress-v1')
    const body = JSON.parse(options.body)
    assert.deepEqual(Object.keys(body).sort(), ['diagnostic', 'nonce'])
    assert.equal(body.diagnostic, 'ingress-v1')
    assert.match(body.nonce, /^[A-Za-z0-9_-]{43}$/)
    assert.ok(!nonces.has(body.nonce)); nonces.add(body.nonce)
    if (index % 5 === 0) {
      assert.equal(options.headers['X-Forwarded-For'], undefined)
      assert.equal(options.headers['CF-Connecting-IP'], undefined)
    } else assert.equal(options.headers['CF-Connecting-IP'], '203.0.113.99')
  }
  for (const key of ['ipValuesPersisted', 'tokensPersisted', 'otpEnabled', 'mailSent', 'databaseWrites']) assert.equal(report[key], false)
  for (const value of [token, privateDetail, clientIp, proxyIp, '10.0.0.1', ...nonces]) {
    assert.ok(!JSON.stringify(report).includes(value), 'Evidence cannot persist raw IPs, credentials or request bodies')
  }
})

test('Canonical expected IPv4-mapped addresses and compressed IPv6 retain the measured right edge', async () => {
  for (const [input, canonical] of [
    ['::ffff:192.0.2.44', clientIp], ['::FFFF:c000:022c', clientIp],
    ['2001:0DB8:0000:0000:0000:0000:0000:002A', '2001:db8::2a'],
  ]) {
    const fake = cloud({ expected: canonical })
    const report = await probeIngress({ ...fake, expectedClientIp: input, now: () => now })
    assert.equal(report.candidateTrustedProxyHops, 2)
    assert.equal(report.requestCount, 10)
    assert.ok(!JSON.stringify(report).includes(canonical))
  }
  assert.equal(canonicalProbeIp(' 192.0.2.44\n'), clientIp)
  for (const value of ['', 'spoofed', '192.0.2.44, 192.0.2.45', '[::1]', 'fe80::1%eth0', 123, null, 'x'.repeat(65)]) {
    assert.equal(canonicalProbeIp(value), null)
  }
})

test('Recommendations support each allowed rightmost position without taking the caller first address', async () => {
  for (let hops = 1; hops <= 4; hops++) {
    const fake = cloud({ suffix: ['35.1.2.3', '35.1.2.4', '35.1.2.5'].slice(0, hops - 1) })
    assert.equal((await probeIngress({ ...fake, expectedClientIp: clientIp, now: () => now })).candidateTrustedProxyHops, hops)
    assert.equal(fake.calls.length, 10)
  }
})

test('Missing, repeated or too-distant expected IPs fail before recommending any hop', async () => {
  for (const [mutate, message] of [
    [data => { data.forwarded = data.forwarded.filter(ip => ip !== clientIp) }, /CLIENT_IP_AMBIGUOUS/],
    [data => { data.forwarded.unshift(clientIp) }, /CLIENT_IP_AMBIGUOUS/],
    [data => { data.forwarded.push('35.1.2.4', '35.1.2.5', '35.1.2.6') }, /CLIENT_IP_OUTSIDE_ALLOWED_SUFFIX/],
  ]) {
    const fake = cloud({ mutate })
    await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: clientIp }), error => sanitized(error) && message.test(error.message))
    assert.equal(fake.calls.length, 1)
  }
})

test('The socket IP and CF header cannot replace an independently missing forwarded client IP', async () => {
  const fake = cloud({ mutate: data => { data.forwarded = [proxyIp]; data.socketIp = clientIp } })
  await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: clientIp }), error => sanitized(error) && /CLIENT_IP_AMBIGUOUS/.test(error.message))
  assert.equal(fake.calls.length, 1)
})

test('Changed hop or non-client suffix on a later variant or the other endpoint fails closed', async () => {
  for (const [changeAt, change] of [
    [1, data => { data.forwarded.pop() }],
    [4, data => { data.forwarded[data.forwarded.length - 1] = '35.1.2.99' }],
    [5, data => { data.forwarded.push('35.1.2.4') }],
    [5, data => { data.forwarded[data.forwarded.length - 1] = '35.1.2.99' }],
  ]) {
    const fake = cloud({ mutate: (data, { callIndex }) => { if (callIndex === changeAt) change(data) } })
    await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: clientIp }), error => sanitized(error) && /INCONSISTENT_TRUSTED_SUFFIX/.test(error.message))
    assert.equal(fake.calls.length, changeAt + 1)
  }
})

test('Synthetic probe addresses cannot be accepted as the independently observed client', async () => {
  for (const expected of ['198.51.100.11', '2001:db8::11', '203.0.113.19', '203.0.113.99']) {
    const fake = cloud({ expected })
    await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: expected }), sanitized)
    assert.equal(fake.calls.length, 0)
    assert.equal(fake.tokenCalls(), 0)
  }
})

test('Unknown or synthetic addresses in a supposedly trusted suffix are blockers', async () => {
  for (const suffix of [[null], ['198.51.100.11'], ['2001:db8::11'], ['203.0.113.99']]) {
    const fake = cloud({ suffix })
    await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: clientIp }), sanitized)
    assert.equal(fake.calls.length, 1)
  }
})

test('Response nonce, exact object schema and canonical address shape are mandatory', async () => {
  const changes = [
    data => { data.nonce = 'another-request-nonce' }, data => { data.ok = false },
    data => { data.diagnostic = 'other-version' }, data => { delete data.socketIp },
    data => { data.forwarded = 'invalid' }, data => { data.forwarded.push(...Array(32).fill(null)) },
    data => { data.forwarded[0] = '192.000.2.44' }, data => { data.socketIp = 'spoofed' },
    data => { data.forwarded[0] = '2001:0DB8:0:0:0:0:0:2A' },
    data => { data.forwarded[0] = '::ffff:192.0.2.44' },
    data => { data.token = token },
  ]
  for (const mutate of changes) {
    const fake = cloud({ mutate })
    await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: clientIp }), sanitized)
    assert.equal(fake.calls.length, 1)
  }
})

test('Non-diagnostic HTTP status, caching or content type prevents reading evidence', async () => {
  for (const responseOptions of [
    { status: 403 }, { status: 302 }, { status: 201 },
    { headers: { 'Cache-Control': 'public, max-age=600' } },
    { headers: { 'Cache-Control': 'no-cache' } },
    { headers: { 'Content-Type': 'text/plain' } },
  ]) {
    const fake = cloud({ respond: data => jsonResponse(data, responseOptions) })
    await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: clientIp }), error => sanitized(error) && /ENDPOINT_NOT_DIAGNOSTIC_READY/.test(error.message))
    assert.equal(fake.calls.length, 1)
  }
})

test('Redirected or foreign diagnostic responses cannot be accepted even by a supplied fetch', async () => {
  for (const properties of [{ redirected: true }, { url: 'https://foreign.example/diagnostic' }]) {
    const fake = cloud({ respond: data => {
      const response = jsonResponse(data)
      for (const [key, value] of Object.entries(properties)) Object.defineProperty(response, key, { value })
      return response
    } })
    await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: clientIp }), sanitized)
    assert.equal(fake.calls.length, 1)
  }
})

test('Actual body bytes bound the diagnostic response regardless of forged content length', async () => {
  const fake = cloud({ respond: data => jsonResponse({ ...data, padding: 'x'.repeat(8193) }, { headers: { 'Content-Length': '1' } }) })
  await assert.rejects(() => probeIngress({ ...fake, expectedClientIp: clientIp }), error => sanitized(error) && /RESPONSE_TOO_LARGE/.test(error.message))
  assert.equal(fake.calls.length, 1)
  const malformed = cloud({ respond: () => new Response(privateDetail + token, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  }) })
  await assert.rejects(() => probeIngress({ ...malformed, expectedClientIp: clientIp }), sanitized)
})

test('Auth and opaque network/body failures redact secrets and never retry an uncertain request', async () => {
  let calls = 0
  await assert.rejects(() => probeIngress({ expectedClientIp: clientIp,
    getToken: async () => { throw new Error(token + privateDetail) },
    fetchImpl: async () => { calls++; throw new Error('Should not fetch') },
  }), error => sanitized(error) && /OPERATOR_AUTH_UNAVAILABLE/.test(error.message))
  assert.equal(calls, 0)
  for (const value of ['', token + '\n', 't'.repeat(4097), undefined]) {
    await assert.rejects(() => probeIngress({ expectedClientIp: clientIp, getToken: async () => value,
      fetchImpl: async () => { calls++; throw new Error('Should not fetch') },
    }), error => sanitized(error) && /OPERATOR_AUTH_INVALID/.test(error.message))
  }
  assert.equal(calls, 0)
  await assert.rejects(() => probeIngress({ expectedClientIp: clientIp, getToken: async () => token,
    fetchImpl: async () => { calls++; throw new Error(token + privateDetail) },
  }), sanitized)
  assert.equal(calls, 1)
  const brokenBody = cloud({ respond: () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error(token + privateDetail)) },
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) })
  await assert.rejects(() => probeIngress({ ...brokenBody, expectedClientIp: clientIp }), sanitized)
  assert.equal(brokenBody.calls.length, 1)
})

test('An invalid expected IP cannot request a token or send any probe', async () => {
  for (const expectedClientIp of [undefined, '', 'not-an-ip', '192.0.2.44, 192.0.2.45']) {
    const fake = cloud()
    await assert.rejects(() => probeIngress({ ...fake, expectedClientIp }), sanitized)
    assert.equal(fake.calls.length, 0); assert.equal(fake.tokenCalls(), 0)
  }
})

test('The independent reflector uses one fixed HTTPS GET with redirect and timeout limits', async () => {
  let calls = 0
  assert.equal(await discoverProbeIp(async (url, options) => {
    calls++; assert.equal(url, 'https://checkip.amazonaws.com')
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal); assert.equal(options.signal.aborted, false)
    assert.equal(options.headers, undefined); assert.equal(options.body, undefined)
    return new Response('::ffff:192.0.2.44\n')
  }), clientIp)
  assert.equal(calls, 1)
})

test('Reflector rejects invalid, oversized, foreign or redirected replies with sanitized errors', async () => {
  for (const response of [
    () => new Response('invalid'), () => new Response(clientIp + '\n192.0.2.45'),
    () => new Response(' '.repeat(129), { headers: { 'Content-Length': '1' } }),
    () => new Response(privateDetail + token, { status: 500 }),
    () => new Response(clientIp, { status: 201 }),
    ...[{ redirected: true }, { url: 'https://foreign.example/reflector' }].map(properties => () => {
      const result = new Response(clientIp)
      for (const [key, value] of Object.entries(properties)) Object.defineProperty(result, key, { value })
      return result
    }),
  ]) {
    let calls = 0
    await assert.rejects(() => discoverProbeIp(async () => { calls++; return response() }), sanitized)
    assert.equal(calls, 1)
  }
  let calls = 0
  await assert.rejects(() => discoverProbeIp(async () => { calls++; throw new Error(token + privateDetail) }), sanitized)
  assert.equal(calls, 1)
})

test('Local configuration requires the exact closed gates and a currently active canonical window', () => {
  assert.deepEqual(validateIngressProbeConfig(config(), { now, environment: {} }), {
    actor: 'operator@example.com', subject: '123456789012345678901', start: startedAt,
  })
  assert.doesNotThrow(() => validateIngressProbeConfig(config(), { now: Date.parse(startedAt), environment: {} }))
  assert.doesNotThrow(() => validateIngressProbeConfig(config(), { now: Date.parse(startedAt) + 30 * 60000 - 1, environment: {} }))
  for (const changes of [
    { OTP_ENABLED: 'true' }, { OTP_ENABLED: undefined }, { OTP_PUBLIC_ENABLED: 'true' },
    { OTP_TRUSTED_PROXY_HOPS: '1' }, { OTP_DAILY_LIMIT: '501' }, { OTP_DAILY_LIMIT: '0500' },
    { OTP_DIAGNOSTIC_GOOGLE_SUBJECT: '' }, { OTP_DIAGNOSTIC_GOOGLE_EMAIL: '' },
    { OTP_DIAGNOSTICS_WINDOW_START: '' }, { OTP_DIAGNOSTICS_WINDOW_START: '2026-10-05T12:00:00Z' },
    { OTP_DIAGNOSTICS_WINDOW_START: '2026-10-05T14:00:00.000+02:00' },
    { OTP_DIAGNOSTICS_WINDOW_START: '2026-02-30T12:00:00.000Z' },
  ]) assert.throws(() => validateIngressProbeConfig(config(changes), { now, environment: {} }), sanitized)
  for (const inactive of [Date.parse(startedAt) - 1, Date.parse(startedAt) + 30 * 60000, now + 86400000, NaN, 'invalid-clock']) {
    assert.throws(() => validateIngressProbeConfig(config(), { now: inactive, environment: {} }), sanitized)
  }
})

test('Local dotenv syntax, duplicate gates, common overrides and shell overrides stop before egress', async () => {
  let egress = 0
  const gateThenProbe = async (text, options = {}) => {
    validateIngressProbeConfig(text, { now, environment: {}, ...options })
    egress++; assert.fail('A failing local preflight must not reach token or network work')
  }
  const cases = [
    [config() + 'OTP_ENABLED=false\n'], [config() + ' export OTP_ENABLED = "false"\n'],
    [config() + 'BROKEN ASSIGNMENT\n'], [config() + 'UNRELATED="first\nOTP_ENABLED=false\nlast"\n'],
    [config() + 'OTP_HMAC_SECRET=' + token + '\n'], [config() + 'AWS_SECRET_ACCESS_KEY=' + token + '\n'],
    [config(), { commonText: 'OTP_ENABLED=false\n' }],
    [config(), { commonText: 'OTP_DIAGNOSTIC_GOOGLE_EMAIL=operator@example.com\n' }],
    ...['OTP_ENABLED', 'OTP_PUBLIC_ENABLED', 'OTP_TRUSTED_PROXY_HOPS', 'OTP_DAILY_LIMIT',
      'OTP_DIAGNOSTICS_WINDOW_START', 'OTP_DIAGNOSTIC_GOOGLE_SUBJECT', 'OTP_DIAGNOSTIC_GOOGLE_EMAIL',
      'FUNCTIONS_EMULATOR', 'OTP_DEMO_MODE', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']
      .map(key => [config(), { environment: { [key]: 'override' } }]),
  ]
  for (const [text, options] of cases) await assert.rejects(() => gateThenProbe(text, options), sanitized)
  assert.equal(egress, 0)
})

test('File preflight rejects every local emulator dotenv file, including an empty file', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'majstorsada-otp-ingress-test-'))
  try {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(resolve(temporaryRoot, 'functions'))
    await writeFile(resolve(temporaryRoot, '.firebaserc'), JSON.stringify({ projects: { default: 'majstorsada-b2ad4' } }))
    await writeFile(resolve(temporaryRoot, 'functions/.env.majstorsada-b2ad4'), config())
    const options = { now, environment: {} }
    assert.equal((await readIngressProbeConfig(temporaryRoot, options)).actor, 'operator@example.com')
    for (const content of ['', '# Emulator dotenv\n']) {
      await writeFile(resolve(temporaryRoot, 'functions/.env.local'), content)
      await assert.rejects(() => readIngressProbeConfig(temporaryRoot, options), sanitized)
    }
  } finally {
    assert.equal(dirname(temporaryRoot), resolve(tmpdir()))
    assert.ok(basename(temporaryRoot).startsWith('majstorsada-otp-ingress-test-'))
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('CLI refuses all modes without a single explicit --probe before auth or live egress', () => {
  for (const args of [[], ['--plan'], ['--verify'], ['--probe', '--extra'], ['--probe', '--probe']]) {
    const result = spawnSync(process.execPath, [resolve(root, 'tools/otp-ingress-probe.mjs'), ...args], {
      cwd: root, encoding: 'utf8', timeout: 10000,
    })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /EXPLICIT_PROBE_REQUIRED/)
    assert.ok(!result.stderr.includes(token))
  }
})

// Closure is checked without exporting an operator token or reading IP evidence.
test('Closure checks both real routes without credentials and refuses an active diagnostic response',async()=>{
  const {verifyClosedIngress}=await import('../../tools/otp-ingress-probe.mjs')
  let calls=0
  const report=await verifyClosedIngress({fetchImpl:async(url,options)=>{
    calls++;assert.ok(INGRESS_URLS.includes(url));assert.equal(options.headers.Authorization,undefined)
    return new Response(JSON.stringify({ok:false,code:'unavailable'}),{status:503,headers:{'cache-control':'private, no-store','content-type':'application/json'}})
  }})
  assert.equal(calls,2);assert.equal(report.diagnosticsClosed,true)
  await assert.rejects(()=>verifyClosedIngress({fetchImpl:async()=>new Response('{}',{status:401})}))
  await assert.rejects(()=>verifyClosedIngress({fetchImpl:async()=>new Response(JSON.stringify({ok:false,code:'unavailable',forwarded:['private-ip']}),{status:503,headers:{'cache-control':'no-store'}})}))
})

const cloudMetadata = () => ['requestClientOtp','verifyClientOtp'].map(name => ({
  name: `projects/majstorsada-b2ad4/locations/europe-west3/functions/${name}`,
  environment: 'GEN_2', state: 'ACTIVE', serviceConfig: {
    serviceAccountEmail: 'otp-runtime@majstorsada-b2ad4.iam.gserviceaccount.com',
    service: `projects/majstorsada-b2ad4/locations/europe-west3/services/${name.toLowerCase()}`,
    uri: `https://${name.toLowerCase()}-abcdefghij-ey.a.run.app`,
  },
}))
test('Scoped metadata derives all six immutable public aliases and unique labels', () => {
  const routes = deriveIngressRoutes(cloudMetadata().reverse())
  assert.equal(routes.length,6);assert.equal(new Set(routes.map(route=>route.url)).size,6)
  assert.equal(Object.isFrozen(routes),true)
  assert.ok(routes.every(Object.isFrozen))
  assert.deepEqual(routes.slice(0,2).map(route=>route.url),INGRESS_URLS)
  assert.deepEqual(routes.filter(route=>route.surface==='run-deterministic').map(route=>route.url),[
    'https://requestclientotp-526260795061.europe-west3.run.app/',
    'https://verifyclientotp-526260795061.europe-west3.run.app/',
  ])
  assert.equal(new Set(routes.map(route=>route.function+':'+route.surface)).size,6)
})
test('Every Run alias rejects spoofed prefixes and agrees on the trusted right-edge position', async () => {
  const routes = deriveIngressRoutes(cloudMetadata()), fake=cloud({routes})
  const report=await probeIngress({...fake,routes,expectedClientIp:clientIp,now:()=>now})
  assert.equal(report.requestCount,30);assert.equal(report.routes.length,6)
  assert.equal(report.candidateTrustedProxyHops,2);assert.equal(fake.tokenCalls(),1)
  for(const name of ['requestClientOtp','verifyClientOtp']) {
    assert.equal(fake.calls.filter(call=>routes[call.routeIndex].function===name).length,15)
  }
  assert.ok(report.routes.every(route=>route.spoofedPrefixesRejected && route.requests===5))
  for(const value of [token,clientIp,proxyIp])assert.ok(!JSON.stringify(report).includes(value))
})
test('A different Run alias hop or suffix is a blocker before enabling business OTP', async () => {
  for(const mutate of [data=>data.forwarded.pop(),data=>data.forwarded.push('35.1.2.9'),
    data=>{data.forwarded[data.forwarded.length-1]='35.1.2.9'}]) {
    const routes=deriveIngressRoutes(cloudMetadata())
    const fake=cloud({routes,mutate:(data,{routeIndex})=>{if(routeIndex===2)mutate(data)}})
    await assert.rejects(()=>probeIngress({...fake,routes,expectedClientIp:clientIp}),
      error=>sanitized(error)&&/INCONSISTENT_TRUSTED_SUFFIX/.test(error.message))
    assert.equal(fake.calls.length,11)
  }
})
test('Foreign, duplicate, unbranded or incomplete route lists cannot request or forward an operator token', async () => {
  const approved=deriveIngressRoutes(cloudMetadata())
  for(const routes of [[],approved.slice(),[...approved,{url:'https://foreign.example/'}],
    [{...approved[0],url:'https://foreign.example/'},...approved.slice(1)],
    [...approved.slice(0,5),approved[0]]]) {
    const fake=cloud({routes})
    await assert.rejects(()=>probeIngress({...fake,routes,expectedClientIp:clientIp}),
      error=>sanitized(error)&&/INGRESS_ROUTES_UNAPPROVED/.test(error.message))
    assert.equal(fake.calls.length,0);assert.equal(fake.tokenCalls(),0)
  }
})
test('Function metadata must pin project, region, generation, identity, active state and exact service', () => {
  const mutations=[
    values=>values.pop(),values=>values.push(values[0]),values=>{values[1]=values[0]},
    values=>{values[0].name=values[0].name.replace('majstorsada-b2ad4','foreign-project')},
    values=>{values[0].name=values[0].name.replace('europe-west3','us-central1')},
    values=>{values[0].environment='GEN_1'},values=>{values[0].state='DEPLOYING'},
    values=>{values[0].serviceConfig.serviceAccountEmail='foreign@example.com'},
    values=>{values[0].serviceConfig.service='projects/foreign/locations/europe-west3/services/requestclientotp'},
    values=>{values[0].serviceConfig.service='projects/majstorsada-b2ad4/locations/europe-west3/services/other'},
    ...['http://requestclientotp-abc.run.app','https://foreign.example/',
      'https://requestclientotp-abc.run.app.evil.example/',
      'https://user:password@requestclientotp-abc.run.app/',
      'https://requestclientotp-abc.run.app:8443/',
      'https://requestclientotp-abc.run.app/path','https://requestclientotp-abc.run.app/?token=x',
      'https://requestclientotp-abc.run.app/#fragment','https://other-abc.run.app/',
      'https://requestclientotp-526260795061.europe-west3.run.app/',null]
      .map(uri=>values=>{values[0].serviceConfig.uri=uri}),
  ]
  for(const mutate of mutations){const values=cloudMetadata();mutate(values);assert.throws(()=>deriveIngressRoutes(values),sanitized)}
  const values=cloudMetadata();values[0].serviceConfig.service=values[0].serviceConfig.service.replace('majstorsada-b2ad4','526260795061')
  assert.equal(deriveIngressRoutes(values).length,6)
})
test('Cloud route lookup uses only two named read-only Function requests with sanitized failure', async()=>{
  const calls=[],metadata=cloudMetadata()
  const routes=await readCloudIngressRoutes(async(...args)=>{calls.push(args);return metadata[calls.length-1]})
  assert.equal(routes.length,6)
  assert.deepEqual(calls,['requestClientOtp','verifyClientOtp'].map(name=>[
    'functions','GET',`/v2/projects/majstorsada-b2ad4/locations/europe-west3/functions/${name}`,
  ]))
  let count=0
  await assert.rejects(()=>readCloudIngressRoutes(async()=>{count++;throw new Error(privateDetail+token)}),
    error=>sanitized(error)&&/FUNCTION_METADATA_UNAVAILABLE/.test(error.message))
  assert.equal(count,1)
})
test('Closure covers every public default alias without an operator token or identity lookup',async()=>{
  const routes=deriveIngressRoutes(cloudMetadata()),urls=[]
  const report=await verifyClosedIngress({routes,fetchImpl:async(url,options)=>{
    urls.push(url);assert.equal(options.headers.Authorization,undefined)
    return jsonResponse({ok:false,code:'unavailable'},{status:503})
  }})
  assert.deepEqual(urls,routes.map(route=>route.url));assert.equal(report.endpointsChecked,6)
  assert.equal(report.authenticatedLookupRequested,false)
  await assert.rejects(()=>verifyClosedIngress({routes:routes.slice(),fetchImpl:async()=>assert.fail('Unapproved route must not send')}),sanitized)
})
