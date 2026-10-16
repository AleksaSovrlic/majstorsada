import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

// Execute the actual routing utility and account-route validation in isolation.
// There are no Firebase, browser, network or storage fixtures in these tests.
const context = vm.createContext({ URL, URLSearchParams })
const route = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync('app/utils/accountRoute.ts', 'utf8')), { context })
await route.link(() => { throw new Error('Unexpected account-route dependency') })
await route.evaluate()
const utility = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync('app/utils/retiredEmailLink.ts', 'utf8')), { context })
await utility.link(name => { assert.equal(name, '@/utils/accountRoute'); return route })
await utility.evaluate()
const from = utility.namespace.retiredEmailLinkFrom
const redirect = (...args) => JSON.parse(JSON.stringify(utility.namespace.retiredEmailLinkRedirect(...args)))
const destination = target => ({ path: '/login', query: { from: target } })

test('Retired client links preserve selected service and only recognized business parameters', () => {
  for (const [requested, expected] of [
    ['/zahtev?tip=bravar', '/zahtev?tip=bravar'],
    ['/zahtev?tip=%20VODOINSTALATER%20', '/zahtev?tip=vodoinstalater'],
    ['/zahtev?tip=električar', '/zahtev?tip=elektricar'],
    ['/zahtev?tip=elektricar&mode=signIn&oobCode=private-code&apiKey=private-key#private-fragment', '/zahtev?tip=elektricar'],
    ['/potvrda?oobCode=private-code#private-fragment', '/potvrda'],
    ['/klijent/dashboard?apiKey=private-key#private-fragment', '/klijent/dashboard'],
  ]) assert.equal(from(requested), expected)
})

test('Cross-role, external, malformed and ambiguous continuation targets fall back to client request', () => {
  for (const requested of [
    undefined, null, 1, {}, ['/zahtev?tip=bravar'], '', 'https://foreign.example/zahtev',
    '//foreign.example/zahtev', '/%2f%2fforeign.example/zahtev', '/zahtev/../admin/dashboard',
    '/admin/dashboard', '/majstor/dashboard', '/login', '/finishLogin', '/account',
    '/zahtev\\admin', '/zahtev?tip= bravar', '/zahtev\n', '/zahtev?' + 'x'.repeat(2050),
  ]) assert.equal(from(requested), '/zahtev', String(requested))
})

test('Resume and repeat retain only singular bounded job IDs; duplicate or arbitrary fields are dropped', () => {
  const id = 'job_0123456789-AbCd'
  assert.equal(from('/zahtev?repeat=' + id + '&resume=' + id + '&tip=bravar&extra=value'), '/zahtev?tip=bravar&repeat=' + id + '&resume=' + id)
  for (const params of [
    'tip=bravar&tip=elektricar', 'tip=unknown', 'repeat=short', 'resume=' + 'a'.repeat(101),
    'repeat=' + id + '&repeat=' + id, 'resume=bad%2Fidentifier', 'mode=signIn&oobCode=private-code',
  ]) assert.equal(from('/zahtev?' + params), '/zahtev', params)
  assert.equal(from('/zahtev?repeat=' + 'a'.repeat(16)), '/zahtev?repeat=' + 'a'.repeat(16))
  assert.equal(from('/zahtev?resume=' + 'a'.repeat(100)), '/zahtev?resume=' + 'a'.repeat(100))
})

test('All retired finish paths and scalar signIn entries go directly to OTP without carrying Auth query data', () => {
  const query = { mode: 'signIn', oobCode: 'private-code', apiKey: 'private-key', lang: 'en', from: '/zahtev?tip=bravar', extra: 'private-extra' }
  for (const path of ['/finishLogin', '/finishLogin/', '/FINISHLOGIN', '/', '/vodoinstalater', '/login']) {
    assert.deepEqual(redirect(path, query), destination('/zahtev?tip=bravar'))
  }
  for (const oobCode of [undefined, null, '', ['duplicate', 'codes'], {}]) {
    assert.deepEqual(redirect('/', { mode: 'signIn', oobCode }), destination('/zahtev'))
  }
  assert.deepEqual(redirect('/finishLogin', {}), destination('/zahtev'))
  assert.equal(redirect('/login', { from: '/zahtev?tip=bravar' }), null, 'Sanitized destination must not form a redirect loop')
})

test('Legacy continueUrl preserves only a singular destination from the configured origin and finish path', () => {
  const continuation = 'https://majstorsada.rs/finishLogin?from=' + encodeURIComponent('/zahtev?tip=bravar&oobCode=private-code')
  for (const continueUrl of [continuation, encodeURIComponent(continuation)]) {
    assert.deepEqual(redirect('/', { mode: 'signIn', oobCode: 'old-code', continueUrl }), destination('/zahtev?tip=bravar'))
  }
  assert.deepEqual(redirect('/', { mode: 'signIn', continueUrl: 'http://localhost:3333/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar' }, 'http://localhost:3333'), destination('/zahtev?tip=bravar'))
})

test('Untrusted origins, credentials, unrelated routes and duplicate nested from cannot become continuations', () => {
  for (const continueUrl of [
    'https://foreign.example/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar',
    'https://majstorsada.rs.foreign.example/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar',
    'http://majstorsada.rs/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar',
    'https://user:password@majstorsada.rs/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar',
    'https://majstorsada.rs/zahtev?from=%2Fzahtev%3Ftip%3Dbravar',
    'https://majstorsada.rs/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar&from=%2Fzahtev%3Ftip%3Delektricar',
    'https://majstorsada.rs/finishLogin?from=%2F%2Fforeign.example',
    '/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar', 'invalid%escape', undefined, ['duplicate'],
  ]) assert.deepEqual(redirect('/', { mode: 'signIn', continueUrl }), destination('/zahtev'))
  assert.deepEqual(redirect('/', { mode: 'signIn', continueUrl: 'http://127.0.0.1:3333/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar' }, 'http://localhost:3333'), destination('/zahtev'))
  assert.deepEqual(redirect('/', { mode: 'signIn', continueUrl: 'https://majstorsada.rs/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar' }, 'malformed-site-url'), destination('/zahtev'))
})

test('Explicit from takes precedence, including invalid or duplicate from that must not fall through', () => {
  const continueUrl = 'https://majstorsada.rs/finishLogin?from=%2Fzahtev%3Ftip%3Dbravar'
  assert.deepEqual(redirect('/', { mode: 'signIn', from: '/zahtev?tip=elektricar', continueUrl }), destination('/zahtev?tip=elektricar'))
  for (const requested of [undefined, null, ['/zahtev?tip=bravar'], 'https://foreign.example']) {
    assert.deepEqual(redirect('/', { mode: 'signIn', from: requested, continueUrl }), destination('/zahtev'))
  }
})

test('Password reset, verification, ambiguous modes and Firebase reserved handlers stay outside retirement', () => {
  for (const mode of [undefined, 'resetPassword', 'verifyEmail', 'recoverEmail', ['signIn'], null, {}]) {
    assert.equal(redirect('/', { mode, oobCode: 'unrelated-code' }), null)
    assert.equal(redirect('/majstor/login', { mode, oobCode: 'unrelated-code' }), null)
  }
  for (const path of ['/__/auth/action', '/__/auth/handler']) {
    assert.equal(redirect(path, { mode: 'signIn', oobCode: 'reserved-code' }), null)
  }
  assert.deepEqual(redirect('/finishLogin', { mode: 'resetPassword' }), destination('/zahtev'), 'The retired application route never consumes any email action')
})