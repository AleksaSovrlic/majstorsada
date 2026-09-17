import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const source = stripTypeScriptTypes(readFileSync('app/plugins/messaging.client.ts', 'utf8'))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate) }

async function fixture(options = {}) {
  const calls = { support: 0, register: 0, listener: 0, token: 0, writes: [], reads: 0, deletes: [], warnings: [], notifications: [], permission: 0 }
  const auth = { currentUser: { uid: 'worker-a' }, role: options.role || 'tradesperson', ensureAuthReady: async () => {}, resolveUserRole: async () => { auth.role = 'tradesperson'; return auth.role } }
  if (options.anonymous) auth.currentUser = null
  function Notification(title, data) { calls.notifications.push({ title, data }); this.onclick = null }
  Notification.permission = options.permission || 'default'
  Notification.requestPermission = () => { calls.permission++; Notification.permission = 'granted'; return Promise.resolve('granted') }
  const swReg = { scope: 'https://example.test/' }
  const worker = {
    register: async () => { calls.register++; return options.register ? options.register(calls.register) : swReg },
    ready: options.activation || Promise.resolve(swReg)
  }
  const document = { visibilityState: 'visible', hasFocus: () => true }
  const context = vm.createContext({
    defineNuxtPlugin: p => p,
    useRuntimeConfig: () => ({ public: { firebase: { projectId: options.demo ? 'demo-test' : 'production-shaped-fixture' }, firebaseVapidKey: 'fixture' } }),
    navigator: { ...(options.noWorker ? {} : { serviceWorker: worker }), userAgent: 'fixture-agent' },
    Notification, document, location: { origin: 'https://example.test' }, window: { focus() {}, location: {} },
    console: { warn: (...args) => calls.warnings.push(args), log() {} },
    btoa: value => Buffer.from(value).toString('base64')
  })
  const messaging = {
    isSupported: async () => { calls.support++; return options.support ? options.support() : true },
    getMessaging: () => ({}),
    getToken: async () => { calls.token++; return options.token ? options.token(calls.token) : 'fixture-token' },
    onMessage: (_m, fn) => { calls.listener++; calls.deliver = fn; return () => {} }
  }
  const firestore = {
    doc: (_db, ...path) => path.join('/'), collection: (_db, ...path) => path.join('/'),
    query: (...args) => args, where: (...args) => args, serverTimestamp: () => 'server-time',
    setDoc: async (path, data, optionsArg) => { calls.writes.push({ path, data, options: optionsArg }); if (options.write) await options.write() },
    getDocs: async () => { calls.reads++; return options.docs ? await options.docs() : { docs: [] } },
    deleteDoc: async ref => { calls.deletes.push(ref) }
  }
  const modules = new Map()
  function module(name) {
    if (!modules.has(name)) {
      const exports = name === 'firebase/messaging' ? messaging : name === 'firebase/firestore' ? firestore : name === '@/stores/auth' ? { useAuthStore: () => auth } : null
      assert.ok(exports, 'Unexpected import ' + name)
      modules.set(name, new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value) }, { context }))
    }
    return modules.get(name)
  }
  const plugin = new vm.SourceTextModule(source, {
    context, initializeImportMeta: meta => { meta.dev = false },
    importModuleDynamically: async name => { const m = module(name); if (m.status === 'unlinked') await m.link(() => {}); if (m.status === 'linked') await m.evaluate(); return m }
  })
  await plugin.link(name => module(name)); await plugin.evaluate()
  const result = plugin.namespace.default.setup({ $firebaseApp: {}, $firestore: {} })
  assert.equal(typeof result?.then, 'undefined', 'Plugin setup must never block hydration')
  return { api: result.provide.fcm, calls, auth, Notification, document, swReg }
}

test('slow support detection exposes a usable API without blocking application setup', async () => {
  const support = deferred()
  const f = await fixture({ support: () => support.promise })
  assert.equal(typeof f.api.getAndSaveFcmToken, 'function')
  assert.equal(f.calls.register, 0)
  support.resolve(true); await flush()
  assert.equal(f.calls.register, 1)
})

test('startup, dashboard and button share one initialization and one token write', async () => {
  const registration = deferred()
  const f = await fixture({ permission: 'granted', register: () => registration.promise })
  const requests = [f.api.getAndSaveFcmToken(), f.api.getAndSaveFcmToken()]
  await flush(); assert.equal(f.calls.register, 1); assert.equal(f.calls.writes.length, 0)
  registration.resolve(f.swReg)
  assert.deepEqual(await Promise.all(requests), ['fixture-token', 'fixture-token'])
  assert.equal(f.calls.listener, 1); assert.equal(f.calls.token, 1)
  assert.equal(f.calls.writes.length, 1); assert.equal(f.calls.reads, 1)
  assert.ok(f.calls.writes[0].path.startsWith('tradespeople/worker-a/fcmTokens/'))
  assert.equal(f.calls.writes[0].options.merge, true)
})

test('token subscription waits for worker activation without blocking setup', async () => {
  const activation = deferred()
  const f = await fixture({ permission: 'granted', activation: activation.promise })
  const request = f.api.getAndSaveFcmToken()
  await flush(); assert.equal(f.calls.token, 0)
  activation.resolve({}); assert.equal(await request, 'fixture-token')
})

for (const kind of ['support', 'registration', 'token', 'write']) {
  test('transient ' + kind + ' failure is contained and an explicit retry succeeds', async () => {
    let attempts = 0
    const failOnce = async () => { if (++attempts === 1) throw new Error('fixture offline'); return kind === 'support' ? true : kind === 'token' ? 'fixture-token' : {} }
    const opts = kind === 'registration' ? { register: failOnce } : { [kind]: failOnce }
    const f = await fixture(opts)
    await flush()
    f.Notification.permission = 'granted'
    const first = await f.api.getAndSaveFcmToken()
    const result = first || await f.api.getAndSaveFcmToken()
    assert.equal(result, 'fixture-token')
    assert.ok(f.calls.warnings.length >= 1)
    assert.equal(f.calls.listener, 1)
  })
}

for (const opts of [{ demo: true }, { noWorker: true }, { support: async () => false }]) {
  test('unsupported/demo environment remains usable without token requests', async () => {
    const f = await fixture(opts); await flush()
    assert.equal(await f.api.requestPermission(), 'denied')
    assert.equal(await f.api.getAndSaveFcmToken(), null)
    assert.equal(f.calls.token, 0); assert.equal(f.calls.writes.length, 0)
  })
}

for (const opts of [{ anonymous: true }, { role: 'client' }, { role: 'admin' }, { permission: 'denied' }]) {
  test('ineligible account or permission never triggers token generation or Firestore writes', async () => {
    const f = await fixture({ permission: 'granted', ...opts })
    assert.equal(await f.api.getAndSaveFcmToken(), null)
    await flush(); assert.equal(f.calls.token, 0); assert.equal(f.calls.writes.length, 0)
  })
}

test('permission prompt is called synchronously from the user click, even during initialization', async () => {
  const registration = deferred()
  const f = await fixture({ register: () => registration.promise })
  const request = f.api.requestPermission()
  assert.equal(f.calls.permission, 1)
  assert.equal(await request, 'granted')
  registration.resolve(f.swReg)
})

for (const replacement of [null, { uid: 'worker-b' }, { uid: 'worker-a' }]) {
  test('logout/account replacement while getToken is pending cannot write for the stale session', async () => {
    const token = deferred()
    const f = await fixture({ permission: 'granted', token: () => token.promise })
    const request = f.api.getAndSaveFcmToken(); await flush()
    f.auth.currentUser = replacement
    token.resolve('fixture-token')
    assert.equal(await request, null); assert.equal(f.calls.writes.length, 0)
  })
}

test('new account has independent synchronization while an old session finishes', async () => {
  const first = deferred()
  const f = await fixture({ permission: 'granted', token: n => n === 1 ? first.promise : Promise.resolve('new-token') })
  const old = f.api.getAndSaveFcmToken(); await flush()
  f.auth.currentUser = { uid: 'worker-b' }
  assert.equal(await f.api.getAndSaveFcmToken(), 'new-token')
  first.resolve('old-token'); assert.equal(await old, null)
  assert.equal(f.calls.writes.length, 1); assert.ok(f.calls.writes[0].path.includes('/worker-b/'))
})

test('session change while dedupe reads are pending prevents subsequent deletions', async () => {
  const docs = deferred()
  const f = await fixture({ permission: 'granted', docs: () => docs.promise })
  const request = f.api.getAndSaveFcmToken(); await flush()
  f.auth.currentUser = null
  docs.resolve({ docs: [{ id: 'old', ref: 'old-token', data: () => ({ userAgent: 'fixture-agent' }) }] })
  assert.equal(await request, null); assert.equal(f.calls.deletes.length, 0)
})

test('dedupe preserves current token and other devices; only same-device stale tokens are removed', async () => {
  const id = Buffer.from('fixture-token').toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
  const f = await fixture({ permission: 'granted', docs: async () => ({ docs: [
    { id, ref: 'current', data: () => ({ userAgent: 'fixture-agent' }) },
    { id: 'stale', ref: 'stale', data: () => ({ userAgent: 'fixture-agent' }) },
    { id: 'other', ref: 'other', data: () => ({ userAgent: 'other-device' }) }
  ] }) })
  assert.equal(await f.api.getAndSaveFcmToken(), 'fixture-token')
  assert.deepEqual(f.calls.deletes, ['stale'])
})

test('dedupe failure does not discard a successfully saved token', async () => {
  const f = await fixture({ permission: 'granted', docs: async () => { throw new Error('offline') } })
  assert.equal(await f.api.getAndSaveFcmToken(), 'fixture-token')
  assert.equal(f.calls.writes.length, 1); assert.equal(f.calls.warnings.length, 1)
})

test('foreground message behavior is preserved for focused, hidden and denied-permission pages', async () => {
  const f = await fixture(); await flush()
  const payload = { data: { title: 'New job', body: 'Details', link: '/majstor/dashboard' } }
  f.Notification.permission = 'granted'
  f.calls.deliver(payload); assert.equal(f.calls.notifications.length, 0)
  f.document.visibilityState = 'hidden'; f.calls.deliver(payload)
  assert.equal(f.calls.notifications.length, 1); assert.equal(f.calls.notifications[0].title, 'New job')
  f.Notification.permission = 'denied'; f.calls.deliver(payload)
  assert.equal(f.calls.notifications.length, 1)
})
import { parse, compileScript } from '@vue/compiler-sfc'
const dashboardSource = readFileSync('app/pages/majstor/dashboard.vue', 'utf8')
const descriptor = parse(dashboardSource).descriptor
const dashboardScript = compileScript(descriptor, { id: 'startup-regression' })
const mountedNode = dashboardScript.scriptSetupAst.find(node => node.type === 'ExpressionStatement' && node.expression?.callee?.name === 'onMounted').expression.arguments[0]
const mountedSource = stripTypeScriptTypes(descriptor.scriptSetup.content.slice(mountedNode.start, mountedNode.end))

test('dashboard starts profile and owned-job feeds while token synchronization remains pending', async () => {
  const push = deferred(), events = []
  const run = vm.runInNewContext('(' + mountedSource + ')', {
    auth: { currentUser: { uid: 'worker' }, ensureAuthReady: async () => {} },
    tpStore: { subscribeProfile: uid => events.push('profile:' + uid) },
    startOwnedFeeds: () => events.push('jobs'),
    Notification: { permission: 'granted' },
    nuxt: { $fcm: { getAndSaveFcmToken: () => { events.push('push'); return push.promise } } }
  })
  let mounted = false
  const pending = run().then(() => { mounted = true })
  await flush()
  assert.deepEqual(events, ['profile:worker', 'jobs', 'push'])
  assert.equal(mounted, true, 'Mounted hook must not await pending notification work')
  push.resolve(null); await pending
})

test('permission revocation while token request is pending prevents persistence', async () => {
  const token = deferred()
  const f = await fixture({ permission: 'granted', token: () => token.promise })
  const request = f.api.getAndSaveFcmToken(); await flush()
  f.Notification.permission = 'denied'; token.resolve('fixture-token')
  assert.equal(await request, null); assert.equal(f.calls.writes.length, 0)
})

const workerSource = readFileSync('public/firebase-messaging-sw.js', 'utf8')
function workerFixture(failMessaging = false) {
  const listeners = {}, shown = []
  let deliver
  const self = { addEventListener: (event, callback) => { listeners[event] = callback }, registration: { showNotification: async (title, options) => shown.push({ title, options }) } }
  vm.runInNewContext(workerSource, {
    importScripts() {}, self, clients: {},
    firebase: { apps: [{}], messaging: () => { if (failMessaging) throw new Error('offline'); return { onBackgroundMessage: callback => { deliver = callback } } } }
  })
  return { listeners, shown, deliver }
}

test('background worker displays data payload once when Firebase messaging is available', async () => {
  const f = workerFixture()
  const payload = { data: { title: 'Job', body: 'Details', link: '/majstor/dashboard' } }
  await f.deliver(payload)
  let pending
  f.listeners.push({ data: { json: () => payload }, waitUntil: promise => { pending = promise } })
  await pending
  assert.equal(f.shown.length, 1); assert.equal(f.shown[0].options.data.link, '/majstor/dashboard')
})

test('background worker fallback displays a push when Firebase initialization failed', async () => {
  const f = workerFixture(true)
  let pending
  f.listeners.push({ data: { json: () => ({ data: { title: 'Fallback job' } }) }, waitUntil: promise => { pending = promise } })
  await pending
  assert.equal(f.shown.length, 1); assert.equal(f.shown[0].title, 'Fallback job')
})
