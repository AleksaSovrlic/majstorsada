import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'
import { computed, ref, shallowRef, watch } from 'vue'

const source = stripTypeScriptTypes(readFileSync('app/composables/useClientOtp.ts', 'utf8'))
const authSource = stripTypeScriptTypes(readFileSync('app/stores/auth.ts', 'utf8'))
const flush = async () => { for (let n = 0; n < 3; n++) await new Promise(setImmediate) }
const routeSource = stripTypeScriptTypes(readFileSync('app/utils/accountRoute.ts', 'utf8'))
const recoverySource = stripTypeScriptTypes(readFileSync('app/utils/clientOtpAuthRecovery.ts', 'utf8'))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function fixture(options = {}) {
  const storage = options.storage || new Map()
  const requests = [], redirects = [], signIns = []
  const listeners = [], roleCalls = [], roleRequests = [], watcherRoleErrors = []
  let currentUser = null
  // Firebase sets currentUser before persistence and notifies only after success.
  const setCurrentUserSilently = value => { currentUser = value }
  const notifyAuthListeners = () => listeners.forEach(fn => fn(currentUser))
  const firebaseAuth = { get currentUser() { return currentUser }, set currentUser(value) { setCurrentUserSilently(value); notifyAuthListeners() } }
  let roleAttempts = 0, sendAttempts = 0
  const context = vm.createContext({
    crypto: webcrypto, btoa, atob, TextDecoder, AbortSignal, Date, ref, shallowRef,
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    useRuntimeConfig: () => ({ public: { firebase: { projectId: 'demo-majstorsada-e2e', functionsRegion: 'europe-west3' } } }),
    useNuxtApp: () => ({ $firebaseAuth: options.ssr ? undefined : firebaseAuth }), useRouter: () => ({ replace: async target => redirects.push(target) }),
    fetch: async (url, init) => {
      const data = JSON.parse(init.body).data
      requests.push({ url, data, init })
      if (url.endsWith('/requestClientOtp')) {
        if (options.send) return await options.send(data, ++sendAttempts)
        return { ok: true, json: async () => ({ ok: true, requestId: data.requestId, delivery: 'accepted', expiresAt: Date.now() + 600000, resendAt: Date.now() + 60000 }) }
      }
      if (options.verify) return await options.verify(data)
      return { ok: true, json: async () => ({ ok: true, customToken: options.customToken ?? 'memory-only-custom-token' }) }
    }
  })
  let authStore = { ensureAuthReady: async () => { if (options.authReady) await options.authReady.promise }, resolveUserRole: async force => { roleCalls.push(force); assert.equal(force, undefined); roleAttempts++; if (options.role) return await options.role(roleAttempts, firebaseAuth); return 'client' } }
  const imports = {
    vue: { computed, ref },
    'firebase/auth': { onAuthStateChanged: (auth, fn) => { listeners.push(fn); fn(auth.currentUser); return () => { const index = listeners.indexOf(fn); if (index >= 0) listeners.splice(index, 1) } }, signInWithCustomToken: async (_auth, token) => { signIns.push(token); if (options.signIn) return await options.signIn(firebaseAuth, { setCurrentUserSilently, notifyAuthListeners }); firebaseAuth.currentUser = { uid: 'existing-client' }; return { user: firebaseAuth.currentUser } } },
    '@/stores/auth': { useAuthStore: () => authStore }
  }
  let stopRoleWatcher = () => {}
  if (options.realRoleStore) {
    Object.assign(imports['firebase/auth'], { signInWithEmailAndPassword: async () => { throw new Error('Password sign-in is forbidden in OTP tests') }, signOut: async () => { firebaseAuth.currentUser = null } })
    imports.pinia = { defineStore: (_id, setup) => { let store; return () => store ||= setup() } }
    imports['@/utils/api'] = { useApi: () => async name => {
      const uid = firebaseAuth.currentUser?.uid
      roleRequests.push({ uid, name })
      if (options.resolveAccount) return await options.resolveAccount(roleRequests.length, firebaseAuth)
      return { role: 'client' }
    } }
    imports['@/stores/tradesperson'] = { useTradespersonStore: () => ({ unsubscribe() {}, profile: null }) }
    const authModule = new vm.SourceTextModule(authSource, { context })
    await authModule.link(name => new vm.SyntheticModule(Object.keys(imports[name]), function () { for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value) }, { context }))
    await authModule.evaluate()
    authStore = authModule.namespace.useAuthStore()
    await authStore.ensureAuthReady()
    // Match app.vue's fresh-UID watch while exercising the actual Auth store's
    // cache, single-flight lookup and failure invalidation.
    stopRoleWatcher = watch(() => authStore.currentUser.value?.uid, async uid => {
      if (uid) await authStore.resolveUserRole().catch(cause => watcherRoleErrors.push(cause))
    })
  }
  const routeModule = new vm.SourceTextModule(routeSource, { context })
  await routeModule.link(() => {}); await routeModule.evaluate()
  imports['@/utils/accountRoute'] = { accountRoute: routeModule.namespace.accountRoute }
  const recoveryModule = new vm.SourceTextModule(recoverySource, { context })
  await recoveryModule.link(() => {}); await recoveryModule.evaluate()
  imports['@/utils/clientOtpAuthRecovery'] = { extractOtpTokenUid: recoveryModule.namespace.extractOtpTokenUid, isAuthStorageError: recoveryModule.namespace.isAuthStorageError, AUTH_STORAGE_MESSAGE: recoveryModule.namespace.AUTH_STORAGE_MESSAGE }
  const module = new vm.SourceTextModule(source, { context, initializeImportMeta: meta => { meta.dev = true; meta.client = !options.ssr } })
  await module.link(name => new vm.SyntheticModule(Object.keys(imports[name]), function () { for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value) }, { context }))
  await module.evaluate()
  const api = module.namespace.useClientOtp(options.from || '/zahtev?tip=bravar')
  api.email.value = ' Client@Example.test '
  return { api, storage, requests, redirects, firebaseAuth, signIns, listeners, authStore, roleCalls, roleRequests, watcherRoleErrors, stopRoleWatcher, setCurrentUserSilently, notifyAuthListeners }
}
const token = async () => 'demo-turnstile-token'
const customTokenFor = (uid = 'existing-client') => `${Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ uid })).toString('base64url')}.fixture-signature`
const storageFailure = (name = 'InvalidStateError', message = "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.") => Object.assign(new Error(`Firebase: An internal AuthError has occurred: ${message} (auth/internal-error).`), {
  code: 'auth/internal-error', customData: { originalError: Object.assign(new Error(message), { name }) }
})

test('one six-digit code preserves zeros, signs in the same UID and safely keeps selected trade', async () => {
  const f = await fixture(); await f.api.send(token); f.api.code.value = '012345'; await f.api.verify()
  assert.equal(f.requests[1].data.code, '012345')
  assert.equal(f.requests[0].data.email, 'client@example.test')
  assert.match(f.requests[0].data.sessionSecret, /^[A-Za-z0-9_-]{43}$/)
  assert.match(f.requests[0].data.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(f.firebaseAuth.currentUser.uid, 'existing-client')
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
  assert.equal(f.storage.size, 0)
  assert.equal(f.requests[0].init.credentials, 'omit')
  assert.equal(f.requests[0].init.headers.Authorization, undefined)
})

test('network loss and reload retry the same opaque request without storing code or token', async () => {
  const storage = new Map()
  const send = async (data, count) => { if (count === 1) throw new Error('fixture connection lost'); return { ok: true, json: async () => ({ ok: true, requestId: data.requestId, delivery: 'accepted', expiresAt: Date.now() + 600000, resendAt: Date.now() + 60000 }) } }
  const f = await fixture({ storage, send }); await f.api.send(token)
  const original = f.requests[0].data
  assert.equal(f.api.pending.value.requestId, original.requestId)
  const second = await fixture({ storage }); second.api.restore()
  assert.equal(second.requests.length, 0, 'reload must not resend automatically')
  await second.api.send(token)
  assert.equal(second.requests[0].data.requestId, original.requestId)
  assert.equal(second.requests[0].data.sessionSecret, original.sessionSecret)
  const saved = [...storage.values()].join('')
  assert.ok(!saved.includes('customToken')); assert.ok(!saved.includes('"code"'))
})

test('rejected or definitively failed resend preserves the previous usable code flow', async () => {
  for (const kind of ['rejected', 'failed']) {
    const f = await fixture({ send: async (data, count) => ({ ok: count === 1 || kind === 'failed', status: count === 1 || kind === 'failed' ? 200 : 429, json: async () => count === 1 ? { ok: true, requestId: data.requestId, delivery: 'accepted', expiresAt: Date.now() + 600000, resendAt: Date.now() - 1000 } : kind === 'rejected' ? { ok: false, code: 'resource-exhausted', error: 'Quota', retryAfter: 60 } : { ok: true, requestId: data.requestId, delivery: 'failed', expiresAt: Date.now() + 600000, resendAt: Date.now() + 60000 } }) })
    await f.api.send(token); const old = f.api.active.value.requestId
    await f.api.send(token, true)
    assert.equal(f.api.active.value.requestId, old); assert.equal(f.api.pending.value, null)
    assert.ok(f.api.waiting.value); assert.ok(f.api.cooldown.value > 0)
  }
})

test('sign-in or role lookup retry uses the memory-only receipt without another verification or email', async () => {
  for (const phase of ['signIn', 'role']) {
    let signInAttempts = 0
    const f = await fixture({
      ...(phase === 'role' ? { role: async n => { if (n === 1) throw new Error('fixture role outage'); return 'client' } } : {}),
      ...(phase === 'signIn' ? { signIn: async auth => { if (++signInAttempts === 1) throw new Error('fixture Auth outage'); auth.currentUser = { uid: 'existing-client' }; return { user: auth.currentUser } } } : {})
    })
    await f.api.send(token); f.api.code.value = '012345'; await f.api.verify()
    assert.ok(f.api.completionPending.value); assert.equal(f.redirects.length, 0)
    assert.ok(![...f.storage.values()].join('').includes('memory-only-custom-token'))
    await f.api.verify()
    assert.equal(f.requests.filter(r => r.url.endsWith('/verifyClientOtp')).length, 1)
    assert.equal(f.requests.filter(r => r.url.endsWith('/requestClientOtp')).length, 1)
    assert.equal(f.redirects.length, 1)
  }
})

test('foreign session replacing a pending verification cannot be overwritten by custom-token sign-in', async () => {
  const response = deferred()
  const f = await fixture({ verify: async () => { await response.promise; return { ok: true, json: async () => ({ ok: true, customToken: 'fixture' }) } } })
  await f.api.send(token); f.api.code.value = '012345'; const verification = f.api.verify()
  f.firebaseAuth.currentUser = { uid: 'another-tab-user' }; response.resolve(); await verification
  assert.equal(f.signIns.length, 0); assert.equal(f.redirects.length, 0)
  assert.equal(f.firebaseAuth.currentUser.uid, 'another-tab-user')
})

test('double clicks share one busy operation and disposal prevents a delayed sign-in', async () => {
  const pending = deferred()
  const f = await fixture()
  const first = f.api.send(async () => { await pending.promise; return 'fixture' })
  const second = f.api.send(token)
  assert.equal(f.requests.length, 0); f.api.dispose(); pending.resolve(); await Promise.all([first, second])
  assert.equal(f.requests.length, 0)
})

test('invalid restored redirects and stale storage are discarded; arbitrary origins do not become redirects', async () => {
  const f = await fixture({ from: 'https://untrusted.example' }); await f.api.send(token)
  assert.equal(f.api.active.value.from, '/zahtev')
  const stored = JSON.parse([...f.storage.values()][0]); stored.active.from = '//untrusted.example'
  f.storage.set('majstorsada.clientOtp.v1', JSON.stringify(stored))
  const second = await fixture({ storage: f.storage }); second.api.restore()
  assert.equal(second.api.active.value, null)
  assert.equal(second.storage.size, 0)
})

test('login then logout in another tab invalidates the still-pending verification even when the UID is null again', async () => {
  const response = deferred()
  const f = await fixture({ verify: async () => { await response.promise; return { ok: true, json: async () => ({ ok: true, customToken: 'fixture' }) } } })
  await f.api.send(token); f.api.code.value = '012345'; const verification = f.api.verify()
  f.firebaseAuth.currentUser = { uid: 'another-tab-user' }; f.firebaseAuth.currentUser = null
  response.resolve(); await verification
  assert.equal(f.signIns.length, 0); assert.equal(f.redirects.length, 0)
})

test('bot validation failure sends no HTTP request, exposes an error and permits a deliberate retry', async () => {
  const f = await fixture()
  await f.api.send(async () => { throw new Error('fixture bot unavailable') })
  assert.equal(f.requests.length, 0); assert.equal(f.api.pending.value, null)
  assert.match(f.api.error.value, /bot unavailable/)
  await f.api.send(token)
  assert.equal(f.requests.length, 1)
})

test('missing digits and expired codes do not call the verification endpoint', async () => {
  const f = await fixture(); await f.api.send(token)
  f.api.code.value = '0123'; await f.api.verify()
  assert.equal(f.requests.length, 1)
  f.api.code.value = '012345'; f.api.active.value = { ...f.api.active.value, expiresAt: Date.now() - 1 }
  await f.api.verify()
  assert.equal(f.requests.length, 1); assert.match(f.api.error.value, /istekao/)
})

test('SSR initializes the OTP shell without Firebase browser Auth, subscriptions, storage writes or transport', async () => {
  const f = await fixture({ ssr: true })
  assert.equal(f.listeners.length, 0)
  assert.equal(f.requests.length, 0)
  assert.equal(f.storage.size, 0)
  assert.equal(f.api.waiting.value, false)
  f.api.dispose()
})

test('HTTP 500 after mail acceptance and gateway 503 remain ambiguous and preserve the same request for recovery', async () => {
  for (const status of [500, 503]) {
    const f = await fixture({ send: async () => ({ ok: false, status, json: async () => ({ ok: false, code: 'internal', error: 'Controlled transport failure' }) }) })
    await f.api.send(token)
    const original = f.requests[0].data
    assert.equal(f.api.pending.value.requestId, original.requestId)
    assert.equal(f.api.pending.value.sessionSecret, original.sessionSecret)
    await f.api.send(token)
    assert.equal(f.requests[1].data.requestId, original.requestId)
    assert.equal(f.api.pending.value.requestId, original.requestId)
  }
})

test('a replay rejected with 429 or bot failure retains the original unresolved request, then safely resumes it', async () => {
  const f = await fixture({ send: async (data, count) => {
    if (count === 1) throw new Error('fixture accepted mail then response lost')
    if (count === 2) return { ok: false, status: 429, json: async () => ({ ok: false, code: 'resource-exhausted', error: 'Controlled IP throttle', retryAfter: 60 }) }
    return { ok: true, status: 200, json: async () => ({ ok: true, requestId: data.requestId, delivery: 'accepted', expiresAt: Date.now() + 600000, resendAt: Date.now() + 60000 }) }
  } })
  await f.api.send(token); const original = f.requests[0].data.requestId
  await f.api.send(token)
  assert.equal(f.api.pending.value.requestId, original)
  await f.api.send(async () => { throw new Error('fixture bot outage during replay') })
  assert.equal(f.api.pending.value.requestId, original)
  await f.api.send(token)
  assert.equal(f.requests[2].data.requestId, original)
  assert.equal(f.api.active.value.requestId, original)
  assert.equal(f.api.pending.value, null)
})

test('lost verify response then same-ID receipt retry clears browser flow only after sign-in', async () => {
  let calls = 0
  const f = await fixture({ verify: async () => {
    calls++
    if (calls === 1) throw new Error('fixture successful verify but response lost')
    return { ok: true, status: 200, json: async () => ({ ok: true, customToken: 'receipt-token' }) }
  } })
  await f.api.send(token)
  const requestId = f.api.active.value.requestId
  f.api.code.value = '012345'; await f.api.verify()
  assert.equal(f.api.active.value.requestId, requestId)
  assert.equal(f.redirects.length, 0)
  assert.equal(f.storage.size, 1)
  await f.api.verify()
  assert.equal(calls, 2)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
  assert.equal(f.storage.size, 0)
})

test('returning already signed-in client is redirected by OTP component and old flow is cleared', async () => {
  const f = await fixture({ from: '/zahtev?tip=bravar', existing: true })
  f.firebaseAuth.currentUser = { uid: 'existing-client' }
  f.storage.set('majstorsada.clientOtp.v1', 'stale-flow')
  await f.api.continueExistingSession('existing-client')
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
  assert.equal(f.storage.size, 0)
  assert.equal(f.requests.length, 0)
})



test('unknown verify outcome just before expiry permits only the same code during the bounded receipt, then signs in', async () => {
  const response = deferred()
  let calls = 0
  const f = await fixture({ verify: async () => {
    if (++calls === 1) { await response.promise; throw new Error('fixture accepted verify then response lost') }
    return { ok: true, status: 200, json: async () => ({ ok: true, customToken: 'receipt-token' }) }
  } })
  await f.api.send(token)
  const expiry = Date.now() + 30
  f.api.active.value = { ...f.api.active.value, expiresAt: expiry }
  f.api.code.value = '012345'
  const first = f.api.verify()
  await new Promise(resolve => setTimeout(resolve, 45))
  response.resolve(); await first
  f.api.now.value = Date.now()
  assert.equal(f.api.expiresIn.value, 0)
  assert.equal(f.api.canResumeAfterExpiry.value, true)
  f.api.code.value = '999999'
  assert.equal(f.api.canResumeAfterExpiry.value, false, 'another code must not inherit the unknown receipt')
  f.api.code.value = '012345'
  assert.equal(f.api.canResumeAfterExpiry.value, true)
  await f.api.verify()
  assert.equal(calls, 2)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
  assert.equal(f.storage.size, 0)
})

test('definitive wrong-code response near expiry and an unsent expired code have no receipt retry', async () => {
  const f = await fixture({ verify: async () => ({ ok: false, status: 412, json: async () => ({ ok: false, code: 'failed-precondition', error: 'Kod nije ispravan.' }) }) })
  await f.api.send(token)
  f.api.code.value = '999999'; await f.api.verify()
  f.api.active.value = { ...f.api.active.value, expiresAt: Date.now() - 1 }
  f.api.now.value = Date.now()
  assert.equal(f.api.canResumeAfterExpiry.value, false)
  await f.api.verify()
  assert.equal(f.requests.filter(r => r.url.endsWith('/verifyClientOtp')).length, 1)
})

test('unknown verify receipt cannot extend beyond two minutes from original expiry', async () => {
  const f = await fixture({ verify: async () => { throw new Error('fixture lost response') } })
  await f.api.send(token)
  f.api.active.value = { ...f.api.active.value, expiresAt: Date.now() + 1000 }
  f.api.code.value = '012345'; await f.api.verify()
  assert.equal(f.api.canResumeAfterExpiry.value, true)
  f.api.now.value = f.api.active.value.expiresAt + 120001
  assert.equal(f.api.canResumeAfterExpiry.value, false)
})

test('returning client is detected after Firebase finishes restoring an initially null user', async () => {
  const authReady = deferred()
  const f = await fixture({ authReady, existing: true })
  const redirect = f.api.continueExistingSession()
  assert.equal(f.redirects.length, 0)
  f.firebaseAuth.currentUser = { uid: 'existing-client' }
  authReady.resolve()
  await redirect
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
  assert.equal(f.requests.length, 0)
})

test('an ambiguous verify does not create a retry receipt after a cross-tab identity change', async () => {
  const response = deferred()
  const f = await fixture({ verify: async () => { await response.promise; throw new Error('fixture response lost') } })
  await f.api.send(token)
  f.api.active.value = { ...f.api.active.value, expiresAt: Date.now() + 60 }
  f.api.code.value = '012345'
  const verification = f.api.verify()
  f.firebaseAuth.currentUser = { uid: 'another-tab-user' }
  f.firebaseAuth.currentUser = null
  response.resolve()
  await verification
  f.api.now.value = Date.now()
  assert.equal(f.api.canResumeAfterExpiry.value, false)
  assert.equal(f.signIns.length, 0)
})
test('OTP finish and the fresh-UID watcher share one real role lookup while explicit force still refreshes', async t => {
  const account = deferred()
  const f = await fixture({ realRoleStore: true, resolveAccount: async n => {
    if (n === 1) await account.promise
    return { role: 'client' }
  } })
  t.after(f.stopRoleWatcher)
  await f.api.send(token); f.api.code.value = '012345'
  const verification = f.api.verify(); await flush()
  assert.equal(f.roleRequests.length, 1)
  assert.equal(f.api.finishing.value, true)
  assert.equal(f.redirects.length, 0)
  account.resolve(); await verification
  assert.equal(f.roleRequests.length, 1, 'OTP finish must join the watcher rather than force a second lookup')
  assert.equal(f.roleRequests[0].uid, 'existing-client')
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
  assert.equal(f.signIns.length, 1)
  await f.authStore.resolveUserRole(true)
  assert.equal(f.roleRequests.length, 2, 'other explicit refresh callers retain force semantics')
})

test('a shared fresh-UID lookup failure remains retryable from the OTP memory receipt', async t => {
  const account = deferred()
  const f = await fixture({ realRoleStore: true, resolveAccount: async n => {
    if (n === 1) { await account.promise; throw new Error('fixture shared role lookup failed') }
    return { role: 'client' }
  } })
  t.after(f.stopRoleWatcher)
  await f.api.send(token); f.api.code.value = '012345'
  const verification = f.api.verify(); await flush()
  assert.equal(f.roleRequests.length, 1)
  account.resolve(); await verification; await flush()
  assert.equal(f.roleRequests.length, 1)
  assert.equal(f.api.completionPending.value, true)
  assert.equal(f.authStore.role.value, 'unknown')
  assert.equal(f.redirects.length, 0)
  assert.match(f.api.error.value, /shared role lookup failed/)
  assert.ok(![...f.storage.values()].join('').includes('memory-only-custom-token'))
  await f.api.verify()
  assert.equal(f.roleRequests.length, 2, 'a rejected lookup cannot stay cached')
  assert.equal(f.requests.filter(r => r.url.endsWith('/verifyClientOtp')).length, 1)
  assert.equal(f.requests.filter(r => r.url.endsWith('/requestClientOtp')).length, 1)
  assert.equal(f.signIns.length, 1)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
  assert.equal(f.storage.size, 0)
})

for (const identityChange of ['foreign', 'logout-then-same-uid']) {
  test(`OTP role completion and its receipt retry reject a ${identityChange} identity change`, async t => {
    const account = deferred()
    const f = await fixture({ realRoleStore: true, resolveAccount: async n => {
      if (n === 1) await account.promise
      return { role: 'client' }
    } })
    t.after(f.stopRoleWatcher)
    await f.api.send(token); f.api.code.value = '012345'
    const verification = f.api.verify(); await flush()
    assert.equal(f.roleRequests.length, 1)
    if (identityChange === 'foreign') f.firebaseAuth.currentUser = { uid: 'another-tab-user' }
    else { f.firebaseAuth.currentUser = null; f.firebaseAuth.currentUser = { uid: 'existing-client' } }
    await flush()
    account.resolve(); await verification; await flush()
    assert.equal(f.redirects.length, 0)
    assert.equal(f.api.completionPending.value, true)
    assert.match(f.api.error.value, /Nalog je promenjen/)
    const roleRequests = f.roleRequests.length
    await f.api.verify()
    assert.equal(f.roleRequests.length, roleRequests, 'identity mismatch must reject before receipt role resolution')
    assert.equal(f.signIns.length, 1)
    assert.equal(f.requests.filter(r => r.url.endsWith('/verifyClientOtp')).length, 1)
    assert.equal(f.redirects.length, 0)
    assert.equal(f.storage.size, 1, 'the active browser flow clears only after valid completion')
  })
}


async function startOtpVerification(f) {
  await f.api.send(token)
  f.api.code.value = '012345'
  await f.api.verify()
}
function assertOneOtpRequestAndVerification(f) {
  assert.equal(f.requests.filter(r => r.url.endsWith('/requestClientOtp')).length, 1)
  assert.equal(f.requests.filter(r => r.url.endsWith('/verifyClientOtp')).length, 1)
}

for (const callback of ['silent', 'before-rejection', 'after-rejection', 'during-retry', 'after-success']) {
  test('a partial Auth persistence failure resumes through Firebase with an own callback ' + callback, async () => {
    let attempts = 0
    const issuedToken = customTokenFor()
    const f = await fixture({ customToken: issuedToken, signIn: async (auth, controls) => {
      if (++attempts === 1) {
        controls.setCurrentUserSilently({ uid: 'existing-client' })
        if (callback === 'before-rejection') controls.notifyAuthListeners()
        throw storageFailure()
      }
      if (callback === 'during-retry') controls.notifyAuthListeners()
      auth.currentUser = { uid: 'existing-client' }
      return { user: auth.currentUser }
    } })
    await startOtpVerification(f)
    assert.match(f.api.error.value, /sačuva prijavu/)
    assert.ok(!f.api.error.value.includes('IDBDatabase'), 'raw SDK details are not the user-facing error')
    assert.equal(f.api.completionPending.value, true)
    assert.equal(f.signIns.length, 1)
    assert.equal(f.roleCalls.length, 0, 'a currentUser left by a rejected SDK call is not completion')
    assert.deepEqual(f.redirects, [])
    assert.ok(![...f.storage.values()].join('').includes(issuedToken))
    assert.ok(![...f.storage.values()].join('').includes('012345'))
    if (callback === 'after-rejection') f.notifyAuthListeners()
    await f.api.verify()
    if (callback === 'after-success') f.notifyAuthListeners()
    assertOneOtpRequestAndVerification(f)
    assert.deepEqual(f.signIns, [issuedToken, issuedToken])
    assert.equal(f.roleCalls.length, 1)
    assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
    assert.equal(f.storage.size, 0)
    assert.equal(f.api.error.value, '')
    f.api.dispose()
  })
}

test('repeated persistence failures can replace the SDK User and require another deliberate SDK retry', async () => {
  let attempts = 0
  const f = await fixture({ customToken: customTokenFor(), signIn: async (auth, controls) => {
    controls.setCurrentUserSilently({ uid: 'existing-client', sdkAttempt: ++attempts })
    if (attempts < 3) throw storageFailure('QuotaExceededError', 'The quota has been exceeded.')
    controls.notifyAuthListeners()
    return { user: auth.currentUser }
  } })
  await startOtpVerification(f)
  const firstUser = f.firebaseAuth.currentUser
  await flush()
  assert.equal(f.signIns.length, 1, 'a failed write must not trigger an automatic retry loop')
  await f.api.verify()
  assert.notEqual(f.firebaseAuth.currentUser, firstUser)
  assert.match(f.api.error.value, /sačuva prijavu/)
  assert.equal(f.roleCalls.length, 0)
  assert.deepEqual(f.redirects, [])
  await f.api.verify()
  assertOneOtpRequestAndVerification(f)
  assert.equal(f.signIns.length, 3)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
})

test('persistence failure before a User assignment retains the existing token retry path', async () => {
  let attempts = 0
  const f = await fixture({ customToken: customTokenFor(), signIn: async auth => {
    if (++attempts === 1) throw storageFailure()
    auth.currentUser = { uid: 'existing-client' }
    return { user: auth.currentUser }
  } })
  await startOtpVerification(f)
  assert.equal(f.firebaseAuth.currentUser, null)
  assert.match(f.api.error.value, /sačuva prijavu/)
  await f.api.verify()
  assertOneOtpRequestAndVerification(f)
  assert.equal(f.signIns.length, 2)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
})

for (const change of ['foreign-user', 'same-uid-new-object', 'silent-same-uid-new-object', 'logout-then-same-uid', 'foreign-then-original-object']) {
  test('partial persistence recovery rejects a pre-retry session change: ' + change, async () => {
    const f = await fixture({ customToken: customTokenFor(), signIn: async (_auth, controls) => {
      controls.setCurrentUserSilently({ uid: 'existing-client' })
      throw storageFailure()
    } })
    await startOtpVerification(f)
    const original = f.firebaseAuth.currentUser
    if (change === 'foreign-user') f.firebaseAuth.currentUser = { uid: 'another-tab-user' }
    if (change === 'same-uid-new-object') f.firebaseAuth.currentUser = { uid: 'existing-client' }
    if (change === 'silent-same-uid-new-object') f.setCurrentUserSilently({ uid: 'existing-client' })
    if (change === 'logout-then-same-uid') { f.firebaseAuth.currentUser = null; f.firebaseAuth.currentUser = { uid: 'existing-client' } }
    if (change === 'foreign-then-original-object') { f.firebaseAuth.currentUser = { uid: 'another-tab-user' }; f.firebaseAuth.currentUser = original }
    await f.api.verify()
    assert.match(f.api.error.value, /Nalog je promenjen/)
    assert.equal(f.signIns.length, 1, 'a changed session cannot be overwritten by a recovery token')
    assert.equal(f.roleCalls.length, 0)
    assert.deepEqual(f.redirects, [])
    assertOneOtpRequestAndVerification(f)
  })
}

for (const change of ['foreign-then-own', 'logout-then-same-uid', 'same-uid-new-object']) {
  test('partial persistence recovery rejects a session change during deferred SDK retry: ' + change, async () => {
    let attempts = 0
    const sdkResponse = deferred()
    const f = await fixture({ customToken: customTokenFor(), signIn: async (auth, controls) => {
      if (++attempts === 1) { controls.setCurrentUserSilently({ uid: 'existing-client' }); throw storageFailure() }
      const ownCredentialUser = auth.currentUser
      await sdkResponse.promise
      if (change !== 'same-uid-new-object') auth.currentUser = { uid: 'existing-client' }
      return { user: change === 'same-uid-new-object' ? ownCredentialUser : auth.currentUser }
    } })
    await startOtpVerification(f)
    const retry = f.api.verify(); await flush()
    assert.equal(f.signIns.length, 2)
    if (change === 'foreign-then-own') f.firebaseAuth.currentUser = { uid: 'another-tab-user' }
    if (change === 'logout-then-same-uid') f.firebaseAuth.currentUser = null
    if (change === 'same-uid-new-object') f.setCurrentUserSilently({ uid: 'existing-client' })
    sdkResponse.resolve(); await retry
    assert.match(f.api.error.value, /Nalog je promenjen/)
    assert.equal(f.roleCalls.length, 0)
    assert.deepEqual(f.redirects, [])
    assertOneOtpRequestAndVerification(f)
  })
}

for (const kind of ['foreign-then-expected', 'logout-after-own-then-expected']) {
  test('a storage rejection cannot capture a session after a round trip during first SDK attempt: ' + kind, async () => {
    const response = deferred()
    const f = await fixture({ customToken: customTokenFor(), signIn: async (auth, controls) => {
      await response.promise
      controls.setCurrentUserSilently({ uid: 'existing-client' })
      throw storageFailure()
    } })
    await f.api.send(token); f.api.code.value = '012345'
    const first = f.api.verify(); await flush()
    if (kind === 'foreign-then-expected') f.firebaseAuth.currentUser = { uid: 'another-tab-user' }
    else { f.firebaseAuth.currentUser = { uid: 'existing-client' }; f.firebaseAuth.currentUser = null }
    response.resolve(); await first
    await f.api.verify()
    assert.match(f.api.error.value, /Nalog je promenjen/)
    assert.equal(f.signIns.length, 1)
    assert.equal(f.roleCalls.length, 0)
    assert.deepEqual(f.redirects, [])
  })
}

for (const cause of [
  Object.assign(new Error('A controlled unrelated internal error'), { code: 'auth/internal-error' }),
  Object.assign(new Error('A controlled network error'), { code: 'auth/network-request-failed' }),
  storageFailure('InvalidStateError', 'A different operation has an invalid state.'),
  storageFailure('Error', 'An IndexedDB transaction failed.'),
  storageFailure('AbortError', 'A transaction failed.'),
  storageFailure('UnknownError', 'A transaction failed.')
]) {
  test('a non-storage SDK failure does not authorize partial-user recovery: ' + (cause.customData?.originalError?.name || cause.code) + ': ' + cause.message, async () => {
    const f = await fixture({ customToken: customTokenFor(), signIn: async (_auth, controls) => {
      controls.setCurrentUserSilently({ uid: 'existing-client' })
      throw cause
    } })
    await startOtpVerification(f); await f.api.verify()
    assert.match(f.api.error.value, /Nalog je promenjen/)
    assert.equal(f.signIns.length, 1)
    assert.equal(f.roleCalls.length, 0)
    assert.deepEqual(f.redirects, [])
  })
}

for (const issuedToken of ['opaque-token', 'e30.%%%.c2ln', 'e30.bm90LWpzb24.c2ln', customTokenFor(''), customTokenFor(123), customTokenFor(null), customTokenFor('x'.repeat(129))]) {
  test('a token without a bounded string UID cannot bind partial-session recovery: ' + issuedToken.slice(0, 45), async () => {
    const f = await fixture({ customToken: issuedToken, signIn: async (_auth, controls) => {
      controls.setCurrentUserSilently({ uid: 'existing-client' })
      throw storageFailure()
    } })
    await startOtpVerification(f); await f.api.verify()
    assert.match(f.api.error.value, /Nalog je promenjen/)
    assert.equal(f.signIns.length, 1)
    assert.equal(f.roleCalls.length, 0)
    assert.deepEqual(f.redirects, [])
  })
}

test('UTF-8 custom-token UIDs bind the correct partial User without treating decoded JWT data as sign-in', async () => {
  const uid = 'klijent-Ж-č'
  let attempts = 0
  const f = await fixture({ customToken: customTokenFor(uid), signIn: async (auth, controls) => {
    controls.setCurrentUserSilently({ uid })
    if (++attempts === 1) throw storageFailure()
    controls.notifyAuthListeners()
    return { user: auth.currentUser }
  } })
  await startOtpVerification(f)
  assert.equal(f.roleCalls.length, 0)
  await f.api.verify()
  assert.equal(f.firebaseAuth.currentUser.uid, uid)
  assert.equal(f.signIns.length, 2)
  assertOneOtpRequestAndVerification(f)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
})

for (const mismatch of ['decoded-uid', 'credential-reference']) {
  test('a successful recovery SDK response still rejects a ' + mismatch + ' mismatch', async () => {
    let attempts = 0
    const f = await fixture({ customToken: customTokenFor(), signIn: async (auth, controls) => {
      if (++attempts === 1) { controls.setCurrentUserSilently({ uid: 'existing-client' }); throw storageFailure() }
      auth.currentUser = { uid: mismatch === 'decoded-uid' ? 'another-client' : 'existing-client' }
      return { user: mismatch === 'credential-reference' ? { uid: 'existing-client' } : auth.currentUser }
    } })
    await startOtpVerification(f); await f.api.verify()
    assert.match(f.api.error.value, /Nalog je promenjen/)
    assert.equal(f.signIns.length, 2)
    assert.equal(f.roleCalls.length, 0)
    assert.deepEqual(f.redirects, [])
  })
}

test('double completion clicks share one recovery SDK call while the deliberate retry is pending', async () => {
  let attempts = 0
  const response = deferred()
  const f = await fixture({ customToken: customTokenFor(), signIn: async (auth, controls) => {
    if (++attempts === 1) { controls.setCurrentUserSilently({ uid: 'existing-client' }); throw storageFailure() }
    await response.promise
    auth.currentUser = { uid: 'existing-client' }
    return { user: auth.currentUser }
  } })
  await startOtpVerification(f)
  const first = f.api.verify(), second = f.api.verify()
  await flush()
  assert.equal(f.signIns.length, 2)
  response.resolve(); await Promise.all([first, second])
  assertOneOtpRequestAndVerification(f)
  assert.equal(f.signIns.length, 2)
  assert.equal(f.roleCalls.length, 1)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
})

for (const phase of ['first-sdk', 'recovery-sdk']) {
  test('disposal during ' + phase + ' prevents later recovery, role calls and navigation', async () => {
    let attempts = 0
    const response = deferred()
    const f = await fixture({ customToken: customTokenFor(), signIn: async (auth, controls) => {
      const attempt = ++attempts
      if (phase === 'recovery-sdk' && attempt === 1) { controls.setCurrentUserSilently({ uid: 'existing-client' }); throw storageFailure() }
      await response.promise
      controls.setCurrentUserSilently({ uid: 'existing-client' })
      if (phase === 'first-sdk') throw storageFailure()
      controls.notifyAuthListeners()
      return { user: auth.currentUser }
    } })
    await f.api.send(token); f.api.code.value = '012345'
    let operation = f.api.verify()
    if (phase === 'recovery-sdk') { await operation; operation = f.api.verify() }
    await flush()
    f.api.dispose(); response.resolve(); await operation; await f.api.verify()
    assert.equal(f.signIns.length, phase === 'first-sdk' ? 1 : 2)
    assert.equal(f.api.completionPending.value, false)
    assert.equal(f.roleCalls.length, 0)
    assert.deepEqual(f.redirects, [])
  })
}

test('a role outage after storage recovery retries only the role lookup with no further SDK sign-in', async () => {
  let attempts = 0
  const f = await fixture({ customToken: customTokenFor(), signIn: async (auth, controls) => {
    controls.setCurrentUserSilently({ uid: 'existing-client' })
    if (++attempts === 1) throw storageFailure()
    controls.notifyAuthListeners()
    return { user: auth.currentUser }
  }, role: async attempt => {
    if (attempt === 1) throw new Error('Controlled recovered-session role outage')
    return 'client'
  } })
  await startOtpVerification(f); await f.api.verify()
  assert.match(f.api.error.value, /recovered-session role outage/)
  assert.equal(f.signIns.length, 2)
  assert.equal(f.roleCalls.length, 1)
  assert.deepEqual(f.redirects, [])
  await f.api.verify()
  assertOneOtpRequestAndVerification(f)
  assert.equal(f.signIns.length, 2)
  assert.equal(f.roleCalls.length, 2)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
})


test('storage recovery and the real fresh-UID watcher still share exactly one account lookup', async t => {
  let attempts = 0
  const account = deferred()
  const f = await fixture({ realRoleStore: true, customToken: customTokenFor(), signIn: async (auth, controls) => {
    controls.setCurrentUserSilently({ uid: 'existing-client' })
    if (++attempts === 1) throw storageFailure()
    controls.notifyAuthListeners()
    return { user: auth.currentUser }
  }, resolveAccount: async () => { await account.promise; return { role: 'client' } } })
  t.after(f.stopRoleWatcher)
  await startOtpVerification(f)
  assert.equal(f.roleRequests.length, 0)
  const completion = f.api.verify(); await flush()
  assert.equal(f.roleRequests.length, 1)
  assert.deepEqual(f.redirects, [])
  account.resolve(); await completion; await flush()
  assertOneOtpRequestAndVerification(f)
  assert.equal(f.signIns.length, 2)
  assert.equal(f.roleRequests.length, 1)
  assert.deepEqual(f.redirects, ['/zahtev?tip=bravar'])
})

test('a same-UID replacement during recovered-session role lookup blocks completion and its later receipt retry', async () => {
  let attempts = 0
  const account = deferred()
  const f = await fixture({ customToken: customTokenFor(), signIn: async (auth, controls) => {
    controls.setCurrentUserSilently({ uid: 'existing-client' })
    if (++attempts === 1) throw storageFailure()
    controls.notifyAuthListeners()
    return { user: auth.currentUser }
  }, role: async () => { await account.promise; return 'client' } })
  await startOtpVerification(f)
  const completion = f.api.verify(); await flush()
  assert.equal(f.roleCalls.length, 1)
  f.setCurrentUserSilently({ uid: 'existing-client' })
  account.resolve(); await completion; await f.api.verify()
  assertOneOtpRequestAndVerification(f)
  assert.match(f.api.error.value, /Nalog je promenjen/)
  assert.equal(f.signIns.length, 2)
  assert.equal(f.roleCalls.length, 1)
  assert.deepEqual(f.redirects, [])
})


for (const sdkAcceptsRetry of [true, false]) {
  test('an empty-signature custom token only binds recovery and Firebase must ' + (sdkAcceptsRetry ? 'confirm the retry' : 'still be allowed to reject the retry'), async () => {
    const issuedToken = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ uid: 'existing-client' })).toString('base64url') + '.'
    let attempts = 0
    const f = await fixture({ customToken: issuedToken, signIn: async (auth, controls) => {
      if (++attempts === 1) {
        controls.setCurrentUserSilently({ uid: 'existing-client' })
        throw storageFailure()
      }
      if (!sdkAcceptsRetry) throw Object.assign(new Error('Firebase rejected the custom token'), { code: 'auth/invalid-custom-token' })
      auth.currentUser = { uid: 'existing-client' }
      return { user: auth.currentUser }
    } })
    await startOtpVerification(f)
    assert.equal(f.roleCalls.length, 0)
    assert.deepEqual(f.redirects, [])
    assert.match(f.api.error.value, /sačuva prijavu/)
    await f.api.verify()
    assertOneOtpRequestAndVerification(f)
    assert.deepEqual(f.signIns, [issuedToken, issuedToken])
    assert.equal(f.roleCalls.length, sdkAcceptsRetry ? 1 : 0)
    assert.deepEqual(f.redirects, sdkAcceptsRetry ? ['/zahtev?tip=bravar'] : [])
    if (!sdkAcceptsRetry) assert.match(f.api.error.value, /Firebase rejected the custom token/)
  })
}

test('an empty-signature token does not authorize recovery after an unrelated SDK error', async () => {
  const issuedToken = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ uid: 'existing-client' })).toString('base64url') + '.'
  const f = await fixture({ customToken: issuedToken, signIn: async (_auth, controls) => {
    controls.setCurrentUserSilently({ uid: 'existing-client' })
    throw Object.assign(new Error('Unrelated internal Auth failure'), { code: 'auth/internal-error' })
  } })
  await startOtpVerification(f); await f.api.verify()
  assertOneOtpRequestAndVerification(f)
  assert.equal(f.signIns.length, 1)
  assert.equal(f.roleCalls.length, 0)
  assert.deepEqual(f.redirects, [])
  assert.match(f.api.error.value, /Nalog je promenjen/)
})
