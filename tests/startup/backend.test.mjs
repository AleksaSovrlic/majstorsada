import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const baseline = JSON.parse(readFileSync(new URL('./backend-metadata.json', import.meta.url), 'utf8'))
const child = spawnSync(process.execPath, [fileURLToPath(new URL('./backend-probe.cjs', import.meta.url))], {
  cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
  env: { ...process.env, GCLOUD_PROJECT: 'demo-backend-startup', FIREBASE_CONFIG: '{"projectId":"demo-backend-startup"}', FIRESTORE_EMULATOR_HOST: '127.0.0.1:1' },
})
assert.equal(child.status, 0, child.error?.message || child.stderr || child.stdout)
const result = JSON.parse(child.stdout)

test('all 18 API endpoint/trigger definitions and parameter specs match the pre-optimization baseline', () => {
  assert.equal(Object.keys(result.metadata.functions).length, 18)
  assert.deepEqual(result.metadata.functions, baseline.functions)
  assert.equal(result.metadata.params.length, 18)
  assert.deepEqual(result.metadata.params, baseline.params)
})

test('actual entrypoint avoids the broad Firebase v2 provider barrel', () => {
  const loaded = result.pathsAtStartup
  assert.ok(loaded.some(path => path.endsWith('/firebase-functions/lib/v2/options.js')))
  for (const path of ['/firebase-functions/lib/v2/index.js', '/firebase-functions/lib/v2/providers/alerts/index.js', '/firebase-functions/lib/v2/providers/dataconnect/index.js', '/firebase-admin/lib/database/index.js']) {
    assert.ok(!loaded.some(value => value.endsWith(path)), `${path} should not load for API startup`)
  }
})

test('phone metadata stays deferred through API startup, client registration and every account role lookup', () => {
  assert.equal(result.initialPhoneLoaded, false)
  assert.equal(result.afterClientPhoneLoaded, false)
  assert.equal(result.afterRolePhoneLoaded, false)
  assert.equal(result.afterValidationPhoneLoaded, true)
})

for (const [existing, role] of [[[], 'unregistered'], [['admins'], 'admin'], [['tradespeople'], 'tradesperson'], [['clients'], 'client']]) {
  test(`account lookup retains ${role} with one transaction reading all three roles`, () => {
    assert.deepEqual(result.roleCases.find(value => JSON.stringify(value.existing) === JSON.stringify(existing)).outcome, { role })
  })
}
for (const value of result.roleCases.filter(value => value.existing.length > 1)) {
  test(`account lookup still rejects conflicting roles: ${value.existing.join(', ')}`, () => {
    assert.deepEqual(value.outcome, { code: 'failed-precondition', message: 'Nalog ima neusaglašene uloge. Kontaktirajte podršku.' })
  })
}
for (const [index, fixture] of result.phones.entries()) {
  test(`actual registration phone validator ${fixture.expected ? 'normalizes' : 'rejects'} fixture ${index + 1}`, () => {
    if (fixture.expected) assert.deepEqual(fixture.outcome, { phone: fixture.expected })
    else assert.deepEqual(fixture.outcome, { code: 'invalid-argument', message: 'Molimo unesite ispravan broj telefona.' })
  })
}
