import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accountRoute, requiredRole } from '../../app/utils/accountRoute.ts'
test('Authentication redirects are internal and belong to the resolved role', () => {
  assert.equal(accountRoute('tradesperson', '/zahtev'), '/majstor/dashboard')
  assert.equal(accountRoute('client', '/admin/dashboard'), '/zahtev')
  assert.equal(accountRoute('unregistered', '/zahtev'), '/account')
  assert.equal(accountRoute('unknown', '/zahtev'), '/account')
  for (const target of ['https://example.test', '//example.test', '/%2fexample.test', '/zahtev/../admin/dashboard']) assert.equal(accountRoute('client', target), '/zahtev')
  assert.equal(accountRoute('client', '/zahtev?tip=bravar'), '/zahtev?tip=bravar')
  assert.equal(accountRoute('tradesperson', '/majstor/podesavanja'), '/majstor/podesavanja')
})
test('All private views including request drafts reset on session changes', () => {
  for (const path of ['/zahtev', '/potvrda', '/klijent/dashboard']) assert.equal(requiredRole(path), 'client')
  for (const path of ['/majstor/dashboard', '/majstor/podesavanja', '/majstor/recenzije']) assert.equal(requiredRole(path), 'tradesperson')
  assert.equal(requiredRole('/admin/majstor/test'), 'admin')
  for (const path of ['/login', '/finishLogin', '/majstor/register', '/majstor/login', '/admin/login']) assert.equal(requiredRole(path), null)
})
